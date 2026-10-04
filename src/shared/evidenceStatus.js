/**
 * DHARAWATCH — Intervention evidence status (shared by the Evidence Review page and the AI brief).
 *
 * Categorical on purpose: there is no defensible basis for a numeric "evidence score", so the
 * status is derived from which sources exist, how old they are and whether they agree.
 * Every status carries the reasons that produced it.
 */

export const FIELD_FRESH_DAYS = 365;
export const LINKED_PHOTO_MAX_DISTANCE_M = 1000;

export const EVIDENCE_STATUS = {
  STRONG: { label: 'STRONG EVIDENCE', tone: 'good' },
  NEEDS_UPDATE: { label: 'NEEDS UPDATE', tone: 'warn' },
  LIMITED: { label: 'LIMITED EVIDENCE', tone: 'warn' },
  INCONSISTENT: { label: 'INCONSISTENT', tone: 'bad' },
  NO_DATA: { label: 'NO DATA', tone: 'muted' },
  PENDING: { label: 'ASSESSING…', tone: 'muted' }
};

const DAY = 86400000;
const DAMAGE_CONDITIONS = ['PARTIAL BREACH', 'DRY / INACTIVE', 'HEAVY SILTATION'];
const WATER_TYPES = ['Check Dam', 'Farm Pond', 'Percolation Tank', 'Recharge Structure'];

/** How a photo's position was established — only EXIF GPS describes where the photo was taken. */
export function gpsStatus(obs) {
  const src = obs?.location?.source;
  if (!obs?.location) return { key: 'NONE', label: 'NO LOCATION' };
  if (src === 'GPS_FOUND' || src === 'PHOTO_EXIF' || obs?.exif?.status === 'GPS_FOUND') return { key: 'EXIF', label: 'EXIF GPS' };
  if (src === 'BROWSER_GPS') return { key: 'DEVICE', label: 'DEVICE GPS (at upload)' };
  if (src === 'USER_PINNED') return { key: 'PIN', label: 'MANUAL PIN' };
  if (src === 'LANDMARK_REGISTRY') return { key: 'LANDMARK', label: 'LANDMARK LOOKUP' };
  return { key: 'OTHER', label: String(src || 'UNKNOWN') };
}

export const observationDate = (o) => o?.captureTime || o?.createdAt || null;

export function summarizeField({ photos = [], inspections = [] } = {}, now = new Date()) {
  const dated = [
    ...photos.map((p) => ({ kind: 'photo', date: observationDate(p), item: p })),
    ...inspections.map((i) => ({ kind: 'inspection', date: i.date, item: i }))
  ].filter((r) => r.date).sort((a, b) => new Date(b.date) - new Date(a.date));
  const latest = dated[0] || null;
  const ageDays = latest ? Math.floor((now - new Date(latest.date)) / DAY) : null;
  const located = photos.filter((p) => p.location);
  const exif = photos.filter((p) => gpsStatus(p).key === 'EXIF');
  const gpsLocated = photos.filter((p) => ['EXIF', 'DEVICE'].includes(gpsStatus(p).key));
  const linked = photos.filter((p) => p.link === 'LINKED');
  const farLinked = linked.filter((p) => p.distanceM != null && p.distanceM > LINKED_PHOTO_MAX_DISTANCE_M);
  const latestCondition = photos.map((p) => ({ c: p.condition, d: observationDate(p) })).filter((x) => x.c).sort((a, b) => new Date(b.d) - new Date(a.d))[0]?.c || null;
  return {
    photoCount: photos.length, linkedCount: linked.length, nearbyCount: photos.length - linked.length,
    locatedCount: located.length, gpsCount: gpsLocated.length, exifGpsCount: exif.length, inspectionCount: inspections.length,
    latestDate: latest?.date || null, latestKind: latest?.kind || null, ageDays,
    fresh: ageDays != null && ageDays <= FIELD_FRESH_DAYS,
    farLinked, latestCondition
  };
}

const monthGap = (a, b) => {
  const d = Math.abs(new Date(a).getUTCMonth() - new Date(b).getUTCMonth());
  return Math.min(d, 12 - d);
};

/**
 * @param intervention  canonical intervention record
 * @param field         { status, photos, inspections }
 * @param satellite     { status, data }  status: IDLE|LOADING|AVAILABLE|NO_SUITABLE_IMAGE|ERROR|TIMEOUT
 * @param terrain       { status, data }
 */
export function evaluateEvidence({ intervention, field, satellite, terrain, now = new Date() }) {
  const reasons = [];
  const limitations = [];
  const f = summarizeField(field || {}, now);
  const sat = satellite?.data;
  const satOk = satellite?.status === 'AVAILABLE' && sat?.status === 'AVAILABLE';
  const terOk = terrain?.status === 'AVAILABLE' && terrain?.data?.status === 'AVAILABLE';
  const pending = [field, satellite, terrain].some((s) => s?.status === 'LOADING');

  // ── components ──
  const fieldC = field?.status === 'LOADING' ? { state: 'PENDING', detail: 'Loading field records…' }
    : field?.status === 'ERROR' ? { state: 'ERROR', detail: field.error || 'Field records could not be loaded.' }
    : !f.photoCount && !f.inspectionCount ? { state: 'MISSING', detail: 'No field photos or inspection records.' }
    : f.fresh && f.gpsCount ? { state: 'STRONG', detail: `${f.photoCount} photo(s), ${f.gpsCount} GPS-located, latest record ${f.ageDays} day(s) old.` }
    : { state: 'PARTIAL', detail: f.ageDays == null ? 'Field records have no dates.'
      : !f.fresh ? `Latest field record is ${f.ageDays} day(s) old.`
      : f.photoCount ? 'Recent photo(s), but none GPS-located (position is a manual pin, lookup or missing).' : 'Recent inspection record without photographs.' };
  const satC = satellite?.status === 'LOADING' ? { state: 'PENDING', detail: 'Running Sentinel-2 comparison…' }
    : satOk ? { state: 'STRONG', detail: `${sat.baseline.acquisitionDate} → ${sat.current.acquisitionDate}` }
    : satellite?.status === 'IDLE' || !satellite ? { state: 'MISSING', detail: 'Satellite comparison not run.' }
    : sat?.status === 'NO_SUITABLE_IMAGE' ? { state: 'MISSING', detail: sat.baseline?.reason || sat.current?.reason || 'No suitable image.' }
    : { state: 'ERROR', detail: satellite?.error || 'Satellite analysis failed.' };
  const terC = terrain?.status === 'LOADING' ? { state: 'PENDING', detail: 'Reading DEM / hydrography…' }
    : terOk ? { state: 'STRONG', detail: 'SRTM + MERIT Hydro + HydroSHEDS' }
    : terrain?.status === 'ERROR' || terrain?.status === 'TIMEOUT' ? { state: 'ERROR', detail: terrain.error || 'Terrain analysis failed.' }
    : { state: 'MISSING', detail: 'No terrain data.' };

  // ── consistency checks (each is a factual disagreement between sources) ──
  const conflicts = [];
  if (intervention?.status === 'OPERATIONAL' && DAMAGE_CONDITIONS.includes(f.latestCondition)) {
    conflicts.push(`Latest field condition "${f.latestCondition}" disagrees with the recorded status OPERATIONAL.`);
  }
  if (f.farLinked.length) {
    conflicts.push(`${f.farLinked.length} linked photo(s) are located more than ${LINKED_PHOTO_MAX_DISTANCE_M} m from the intervention.`);
  }
  if (satOk && intervention?.type === 'Plantation' && intervention?.status === 'OPERATIONAL' && sat.change?.ndvi?.delta != null && sat.change.ndvi.delta <= -0.1) {
    conflicts.push(`Observed NDVI declined by ${Math.abs(sat.change.ndvi.delta).toFixed(2)} in the analysis area while the plantation is recorded as OPERATIONAL.`);
  }

  // ── limitations ──
  if (satOk && monthGap(sat.baseline.acquisitionDate, sat.current.acquisitionDate) > 2) {
    limitations.push(`Baseline (${sat.baseline.acquisitionDate}) and current (${sat.current.acquisitionDate}) scenes are from different seasons — index changes may be seasonal, not structural.`);
  }
  if (satOk && WATER_TYPES.includes(intervention?.type) && sat.change?.waterHa && sat.change.waterHa.before === 0 && sat.change.waterHa.after === 0) {
    limitations.push('No open water detected (NDWI > 0) in either scene; small or seasonal water bodies may be below 10 m resolution.');
  }
  if (f.photoCount && !f.exifGpsCount) limitations.push('No field photo carries EXIF GPS; photo positions come from device location, a manual pin or a lookup.');
  if (!f.photoCount && f.inspectionCount) limitations.push('Inspection records exist but have no photographs attached.');
  if (f.nearbyCount && !f.linkedCount) limitations.push('Field photos are matched by distance only — none is explicitly linked to this intervention.');
  if (fieldC.state === 'MISSING') limitations.push('No field evidence for this intervention.');
  if (satC.state === 'MISSING' && satellite?.status !== 'IDLE') limitations.push(`Satellite: ${satC.detail}`);
  if (terC.state !== 'STRONG' && terC.state !== 'PENDING') limitations.push(`Terrain: ${terC.detail}`);

  // ── overall ──
  let key;
  if (pending) key = 'PENDING';
  else if (conflicts.length) { key = 'INCONSISTENT'; reasons.push(...conflicts); }
  else if (fieldC.state === 'MISSING' && !satOk && !terOk) { key = 'NO_DATA'; reasons.push('No field, satellite or terrain evidence is available.'); }
  else if (fieldC.state === 'STRONG' && satOk && terOk) { key = 'STRONG'; reasons.push('Recent GPS-located field photo, valid satellite comparison and terrain context are all available.'); }
  else if ((f.photoCount || f.inspectionCount) && !f.fresh && satOk) { key = 'NEEDS_UPDATE'; reasons.push(`Latest field record is ${f.ageDays ?? '?'} days old (> ${FIELD_FRESH_DAYS}); satellite data is current.`); }
  else {
    key = 'LIMITED';
    if (fieldC.state !== 'STRONG') reasons.push(`Field: ${fieldC.detail}`);
    if (!satOk) reasons.push(`Satellite: ${satC.detail}`);
    if (!terOk) reasons.push(`Terrain: ${terC.detail}`);
  }
  return { key, ...EVIDENCE_STATUS[key], reasons, limitations, field: f, components: { field: fieldC, satellite: satC, terrain: terC } };
}
