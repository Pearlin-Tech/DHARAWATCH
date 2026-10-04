/**
 * DHARAWATCH — Geospatial engine
 *
 * Everything here is driven by real geometry / coordinates:
 *   - HydroSHEDS HydroBASINS (WWF/HydroSHEDS/v1/Basins/hybas_{1..12}) point + polygon resolution
 *   - Geometry-first Earth Engine analytics (fingerprint / timeline / attention / layers)
 *
 * There are NO geographic fallbacks, NO preset basins, NO synthetic values in this file.
 * Seeded "demo" watersheds are resolved from the real HydroBASINS dataset at runtime.
 */
import ee from '@google/earthengine';
import crypto from 'crypto';
import { validateGeometry, geometryMetrics, geometryKey } from '../src/shared/geo.js';
import { WATERSHED_LAYERS, DW_CLASSES } from '../src/shared/layerRegistry.js';

// ─── errors ───────────────────────────────────────────────────────
export class GeoError extends Error {
  constructor(code, message, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// ─── EE readiness ─────────────────────────────────────────────────
let _eeReady = false;
export function setEEReady(v) { _eeReady = !!v; }
export function isEEReady() { return _eeReady; }
function assertEE() {
  if (!_eeReady) throw new GeoError('EE_UNAVAILABLE', 'Earth Engine is not initialized on the server.', 503);
}

function classifyEEError(msg = '') {
  const m = String(msg);
  if (/not found|does not exist|asset/i.test(m) && /asset|collection|image/i.test(m)) return 'DATASET_UNAVAILABLE';
  if (/timed out|timeout/i.test(m)) return 'ANALYSIS_FAILED';
  if (/invalid|geometry|polygon|ring|edge/i.test(m)) return 'INVALID_GEOMETRY';
  if (/permission|quota|credential|auth/i.test(m)) return 'EE_UNAVAILABLE';
  return 'ANALYSIS_FAILED';
}

export function evalEE(obj, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new GeoError('ANALYSIS_FAILED', `Earth Engine request timed out after ${timeoutMs / 1000}s`, 504)), timeoutMs);
    try {
      obj.evaluate((res, err) => {
        clearTimeout(t);
        if (err) reject(new GeoError(classifyEEError(err), String(err), 502));
        else resolve(res);
      });
    } catch (e) {
      clearTimeout(t);
      reject(new GeoError('ANALYSIS_FAILED', e.message, 500));
    }
  });
}

// ─── cache ────────────────────────────────────────────────────────
const cache = new Map();
const TTL = 15 * 60 * 1000;
export function cget(k) { const e = cache.get(k); if (!e) return null; if (Date.now() - e.t > TTL) { cache.delete(k); return null; } return e.v; }
function cset(k, v) { cache.set(k, { t: Date.now(), v }); return v; }
export async function memo(k, fn) {
  const hit = cget(k);
  if (hit) return hit;
  // de-duplicate in-flight identical requests
  const inflightKey = `__inflight:${k}`;
  const inflight = cache.get(inflightKey);
  if (inflight) return inflight.v;
  const p = fn().then(v => { cache.delete(inflightKey); return cset(k, v); }, e => { cache.delete(inflightKey); throw e; });
  cache.set(inflightKey, { t: Date.now(), v: p });
  return p;
}

/** Drop every cached result that belongs to a context key (used by REFRESH). */
export function invalidateKey(key) {
  if (!key) return 0;
  let n = 0;
  for (const k of [...cache.keys()]) if (k.includes(`:${key}`) || k.endsWith(key)) { cache.delete(k); n++; }
  return n;
}

// ─── persistence (injected by server.js) ──────────────────────────
let store = null;
export function setStore(s) { store = s; }

// ─── HydroBASINS ──────────────────────────────────────────────────
export const basinsFC = (level) => ee.FeatureCollection(`WWF/HydroSHEDS/v1/Basins/hybas_${level}`);
// simplification tolerance (metres) per level — keeps payloads small without visibly moving boundaries
const SIMPLIFY = { 1: 8000, 2: 5000, 3: 3000, 4: 2000, 5: 1000, 6: 400, 7: 150, 8: 60, 9: 30, 10: 20, 11: 10, 12: 10 };

export function levelOfHybasId(id) {
  // HYBAS_ID = <continent digit><level 2 digits>...
  const s = String(id).replace(/^hybas-/, '');
  const lvl = parseInt(s.slice(1, 3), 10);
  return lvl >= 1 && lvl <= 12 ? lvl : null;
}

/** EE simplify() may emit GeometryCollections (polygons + degenerate slivers). Keep only the polygonal parts. */
function normalizePolygonal(g) {
  if (!g) return g;
  if (g.type !== 'GeometryCollection') return g;
  const polys = [];
  for (const m of g.geometries || []) {
    if (m.type === 'Polygon') polys.push(m.coordinates);
    else if (m.type === 'MultiPolygon') polys.push(...m.coordinates);
  }
  if (!polys.length) return g;
  return polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
}

const technicalName = (level, pfaf) => `HydroBASIN L${level} · ${pfaf}`;

function featureToContext(f, level) {
  const p = f.properties || {};
  const geom = normalizePolygonal(f.geometry);
  const v = validateGeometry(geom);
  if (!v.ok) { console.warn(`[Geo] L${level} basin ${p.HYBAS_ID} geometry rejected: ${v.message} (${geom && geom.type})`); return null; }
  const m = geometryMetrics(geom);
  const hid = p.HYBAS_ID;
  return {
    id: `hybas-${hid}`,
    source: 'hydrosheds',
    type: 'watershed',
    name: technicalName(level, p.PFAF_ID ?? hid),
    displayName: technicalName(level, p.PFAF_ID ?? hid),
    technicalName: technicalName(level, p.PFAF_ID ?? hid),
    naming: { status: 'PENDING', method: null },
    geometry: geom,
    bbox: m.bbox,
    center: m.centroid ? [m.centroid.lon, m.centroid.lat] : null,
    areaKm2: m.areaKm2,
    level,
    parentId: null,
    country: null,
    region: null,
    sourceDataset: `WWF/HydroSHEDS/v1/Basins/hybas_${level}`,
    sourceFeatureId: hid,
    isCustom: false,
    isSaved: false,
    metadata: {
      PFAF_ID: p.PFAF_ID, SUB_AREA_KM2: p.SUB_AREA, UP_AREA_KM2: p.UP_AREA,
      MAIN_BAS: p.MAIN_BAS, ENDO: p.ENDO ?? p.ENDORHEIC, COAST: p.COAST, ORDER: p.ORDER, NEXT_DOWN: p.NEXT_DOWN
    }
  };
}

function linkHierarchy(list) {
  // list is ordered coarse → fine; parent = nearest coarser candidate
  for (let i = 1; i < list.length; i++) list[i].parentId = list[i - 1].id;
  return list;
}

/** Real point → watershed resolution across HydroBASINS levels (hierarchy). */
export async function resolvePoint(lat, lon, { levels = [3, 4, 5, 6, 7, 8] } = {}) {
  assertEE();
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new GeoError('INVALID_GEOMETRY', 'lat/lon out of range', 400);
  }
  const key = `resolve:${lat.toFixed(5)}:${lon.toFixed(5)}:${levels.join(',')}`;
  return memo(key, async () => {
    const pt = ee.Geometry.Point([lon, lat]);
    const per = await Promise.all(levels.map(async (L) => {
      try {
        const col = basinsFC(L).filterBounds(pt).limit(1)
          .map(ft => ee.Feature(ft.geometry().simplify(SIMPLIFY[L] || 100), ft.toDictionary()));
        const data = await evalEE(col, 60000);
        const f = data.features?.[0];
        return f ? featureToContext(f, L) : null;
      } catch (e) {
        console.warn(`[Geo] resolvePoint L${L} failed: ${e.message}`);
        return { _error: e.message, level: L };
      }
    }));
    const ok = per.filter(x => x && !x._error);
    const failed = per.filter(x => x && x._error);
    // drop levels whose basin equals the coarser one (same SUB_AREA) → keep hierarchy meaningful
    const dedup = [];
    for (const c of ok) {
      const prev = dedup[dedup.length - 1];
      if (prev && Math.abs(prev.areaKm2 - c.areaKm2) / Math.max(prev.areaKm2, 1) < 0.002) continue;
      dedup.push(c);
    }
    linkHierarchy(dedup);
    await nameBasins(dedup);
    return { candidates: dedup, failedLevels: failed.map(f => ({ level: f.level, error: f._error })) };
  });
}

export function recommendedLevelFor(areaKm2) {
  // sensible analysis scale: sub-basin-ish
  if (areaKm2 == null) return 7;
  return 7;
}

/** Real polygon → intersecting watersheds with overlap % (hierarchy aware). */
const INTERSECT_LIMIT = 100;
export async function intersectPolygon(geometry) {
  assertEE();
  const v = validateGeometry(geometry);
  if (!v.ok) throw new GeoError('INVALID_GEOMETRY', v.message, 400);
  const drawn = geometryMetrics(v.geometry);
  if (v.geometry.type === 'Point') {
    const r = await resolvePoint(v.geometry.coordinates[1], v.geometry.coordinates[0]);
    return { drawn, candidates: r.candidates.map(c => ({ ...c, overlapPercent: 100 })) };
  }
  const key = `isect:${geometryKey(v.geometry)}`;
  return memo(key, async () => {
    const a = drawn.areaKm2;
    const levels = a > 1e6 ? [2, 3, 4] : a > 1e5 ? [3, 4, 5, 6] : a > 1e4 ? [4, 5, 6, 7] : a > 1e3 ? [5, 6, 7, 8] : [5, 6, 7, 8, 9];
    const poly = ee.Geometry(v.geometry);
    const truncated = [];
    const per = await Promise.all(levels.map(async (L) => {
      try {
        const col = basinsFC(L).filterBounds(poly)
          .map(ft => {
            const g = ft.geometry();
            const inter = g.intersection(poly, 100).area(100).divide(1e6);
            return ee.Feature(g.simplify(SIMPLIFY[L] || 100), ft.toDictionary()).set('overlap_km2', inter);
          })
          .sort('overlap_km2', false)
          .limit(INTERSECT_LIMIT);
        const data = await evalEE(col, 90000);
        if ((data.features || []).length >= INTERSECT_LIMIT) truncated.push(L);
        return (data.features || []).map(f => {
          const ctx = featureToContext(f, L);
          if (!ctx) return null;
          const ov = Number(f.properties.overlap_km2) || 0;
          ctx.overlapKm2 = ov;
          ctx.overlapPercent = a > 0 ? Math.min(100, (ov / a) * 100) : 0;
          ctx.coveragePercent = ctx.areaKm2 > 0 ? Math.min(100, (ov / ctx.areaKm2) * 100) : 0;
          return ctx;
        }).filter(Boolean).filter(c => c.overlapPercent >= 0.5);
      } catch (e) {
        console.warn(`[Geo] intersect L${L} failed: ${e.message}`);
        return [];
      }
    }));
    const candidates = per.flat().sort((x, y) => (x.level - y.level) || (y.overlapPercent - x.overlapPercent));
    await nameBasins(candidates);
    // recommended: finest basin that still contains ≥90% of drawn area
    const containing = candidates.filter(c => c.overlapPercent >= 90).sort((x, y) => y.level - x.level)[0];
    return { drawn, candidates, recommendedId: containing?.id || null, truncatedLevels: truncated, perLevelLimit: INTERSECT_LIMIT };
  });
}

export async function countriesFor(geometry) {
  try {
    assertEE();
    const v = validateGeometry(geometry);
    if (!v.ok) return [];
    const g = ee.Geometry(v.geometry);
    const names = await evalEE(
      ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017').filterBounds(g).aggregate_array('country_na'), 30000);
    return names || [];
  } catch (_) { return []; }
}


// ─── Watershed naming (dataset-derived, never invented) ───────────
// Priority: HydroSHEDS river network BAS_NAME / BB_NAME of the reach draining the basin
// (authoritative dataset attribute) → technical HydroBASIN id. The nearest place name is
// returned separately as `nearPlace` and is never used as the watershed name.
export const RIVERS = 'WWF/HydroSHEDS/v1/FreeFlowingRivers';

/**
 * Name one HydroBASINS context in place. Uses its (simplified) geometry and UP_AREA:
 *   reaches with UPLAND_SKM ≥ 30% of the basin's upstream area are filtered first (cheap),
 *   then the reach with the largest upstream area inside the basin is its outlet river.
 */
export async function nameBasin(ctx) {
  if (!ctx || ctx.isCustom || !/^hybas-/.test(ctx.id || '')) return ctx;
  const md = ctx.metadata || {};
  const up = Number(md.UP_AREA_KM2) || ctx.areaKm2;
  const sub = Number(md.SUB_AREA_KM2) || ctx.areaKm2;
  try {
    const n = await memo(`name:${ctx.id}`, async () => {
      const g = ee.Geometry(ctx.geometry);
      const fc = ee.FeatureCollection(RIVERS).filter(ee.Filter.gte('UPLAND_SKM', up * 0.3)).filterBounds(g)
        .sort('UPLAND_SKM', false).limit(1);
      const top = await evalEE(fc.toList(1).map(f => ee.Feature(f).toDictionary(['BAS_NAME', 'BB_NAME', 'UPLAND_SKM', 'RIV_ORD'])), 45000);
      let r = top?.[0] || null;
      let others = [];
      if (!r || (r.UPLAND_SKM || 0) < up * 0.6) {
        // multi-river unit (e.g. coastal HydroBASINS): list the largest named river systems inside
        const many = ee.FeatureCollection(RIVERS).filter(ee.Filter.gte('UPLAND_SKM', Math.max(up * 0.03, 500))).filterBounds(g)
          .filter(ee.Filter.neq('BAS_NAME', '')).sort('UPLAND_SKM', false);
        // largest river systems first (distinct keeps first occurrence)
        others = (await evalEE(many.aggregate_array('BAS_NAME').distinct().slice(0, 6), 45000)) || [];
      }
      return { top: r, others };
    });
    const basName = (n.top?.BAS_NAME || '').trim().replace(/\s+basin$/i, ''); // dataset sometimes stores "Tapti Basin"
    const bbName = (n.top?.BB_NAME || '').trim();
    const dominant = n.top && (n.top.UPLAND_SKM || 0) >= up * 0.6 && basName;
    const isOutlet = String(md.MAIN_BAS) === String(ctx.sourceFeatureId);
    const whole = dominant && isOutlet && sub >= up * 0.8;
    let name, scope;
    if (whole) { name = `${basName} Basin`; scope = 'WHOLE_BASIN'; }
    else if (dominant) { name = `${basName} Basin · L${ctx.level} sub-basin`; scope = 'PART_OF_BASIN'; }
    else if (n.others.length) { name = `${n.others.slice(0, 3).map(o => String(o).replace(/\s+basin$/i, '')).join(' · ')} drainage`; scope = 'MULTI_RIVER'; }
    else { name = ctx.technicalName || ctx.name; scope = 'UNNAMED'; }
    ctx.name = name;
    ctx.displayName = name;
    ctx.river = dominant ? (bbName || basName) : null;
    ctx.riverSystem = dominant ? basName : null;
    ctx.naming = {
      status: scope === 'UNNAMED' ? 'NO_NAME_IN_DATASET' : 'RESOLVED', scope,
      method: scope === 'UNNAMED' ? 'HydroBASINS identifier (no named river reach found)' : 'HydroSHEDS river network attribute BAS_NAME of the basin outlet reach',
      dataset: RIVERS, outletUplandKm2: n.top?.UPLAND_SKM ? Math.round(n.top.UPLAND_SKM) : null,
      riversInside: n.others.length ? n.others : undefined
    };
  } catch (e) {
    ctx.naming = { status: 'LOOKUP_FAILED', method: null, error: e.message };
  }
  return ctx;
}
/**
 * A searched river's reference point is often its mouth (open water, outside every basin polygon).
 * Anchor it to a HydroSHEDS reach whose BAS_NAME / BB_NAME equals the river name within `km` —
 * a dataset match, never "the nearest polygon". Returns null when no such reach exists.
 */
export async function riverAnchor(lat, lon, riverName, km = 50) {
  assertEE();
  const n = String(riverName || '').replace(/\b(river|basin|watershed|the|rio|río)\b/gi, '').replace(/\s+/g, ' ').trim();
  if (!n) return null;
  const title = n.split(' ').map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  const variants = [...new Set([n, title, n.toUpperCase()])];
  return memo(`anchor:${lat.toFixed(4)}:${lon.toFixed(4)}:${title}:${km}`, async () => {
    const pt = ee.Geometry.Point([lon, lat]);
    const fc = ee.FeatureCollection(RIVERS).filterBounds(pt.buffer(km * 1000))
      .filter(ee.Filter.or(ee.Filter.inList('BAS_NAME', variants), ee.Filter.inList('BB_NAME', variants)))
      .sort('UPLAND_SKM', false).limit(1);
    const r = await evalEE(fc.toList(1).map(f => {
      const g = ee.Feature(f).geometry();
      return ee.Dictionary({ c: g.centroid(100).coordinates(), d: g.distance(pt, 100), b: ee.Feature(f).get('BAS_NAME'), up: ee.Feature(f).get('UPLAND_SKM') });
    }), 45000);
    const hit = r?.[0];
    if (!hit) return null;
    return { lon: hit.c[0], lat: hit.c[1], river: hit.b, distanceKm: Math.round(hit.d / 100) / 10, uplandKm2: Math.round(hit.up), dataset: RIVERS };
  });
}

export const nameBasins = (list) => Promise.all(list.map(c => nameBasin(c)));

/** Load a HydroBASINS watershed by id (hybas-…). */
export async function getBasinById(id) {
  assertEE();
  const L = levelOfHybasId(id);
  const num = Number(String(id).replace(/^hybas-/, ''));
  if (!L || !Number.isFinite(num)) throw new GeoError('NO_WATERSHED_FOUND', `Invalid HydroBASINS id: ${id}`, 404);
  return memo(`basin:${id}`, async () => {
    const col = basinsFC(L).filter(ee.Filter.eq('HYBAS_ID', num)).limit(1)
      .map(ft => ee.Feature(ft.geometry().simplify(SIMPLIFY[L] || 100), ft.toDictionary()));
    const data = await evalEE(col, 60000);
    const f = data.features?.[0];
    if (!f) throw new GeoError('NO_WATERSHED_FOUND', `HydroBASINS feature ${id} not found at level ${L}`, 404);
    const ctx = featureToContext(f, L);
    if (!ctx) throw new GeoError('INVALID_GEOMETRY', 'Basin geometry invalid', 500);
    const [countries] = await Promise.all([countriesFor({ type: 'Point', coordinates: ctx.center }), nameBasin(ctx)]);
    ctx.country = countries.join(' / ') || null;
    return ctx;
  });
}

// ─── Geometry reference for analytics ─────────────────────────────
// Accepts either {geometry} or {id}; returns an ee.Geometry plus a stable cache key and area.
export async function geometryRef({ id, geometry } = {}) {
  assertEE();
  if (geometry) {
    const v = validateGeometry(geometry);
    if (!v.ok) throw new GeoError('INVALID_GEOMETRY', v.message, 400);
    const m = geometryMetrics(v.geometry);
    const g = ee.Geometry(v.geometry);
    return { aoi: g, aoiSimple: g, key: `g:${geometryKey(v.geometry)}`, areaKm2: m.areaKm2, kind: v.geometry.type === 'Point' ? 'point' : 'geometry', label: 'Drawn / supplied geometry' };
  }
  if (id && /^hybas-/.test(id)) {
    const L = levelOfHybasId(id);
    const num = Number(id.replace(/^hybas-/, ''));
    if (!L || !Number.isFinite(num)) throw new GeoError('NO_WATERSHED_FOUND', `Invalid HydroBASINS id: ${id}`, 404);
    const filtered = basinsFC(L).filter(ee.Filter.eq('HYBAS_ID', num));
    const area = await memo(`area:${id}`, async () => {
      const a = await evalEE(filtered.limit(1).aggregate_array('SUB_AREA'), 30000);
      if (!a || !a.length) throw new GeoError('NO_WATERSHED_FOUND', `HydroBASINS feature ${id} not found`, 404);
      return a[0];
    });
    // simplified copy (already fetched for the map boundary) for cheap metadata filtering on huge basins
    const simple = await getBasinById(id).catch(() => null);
    return { aoi: filtered.geometry(), aoiSimple: simple?.geometry ? ee.Geometry(simple.geometry) : filtered.geometry(), key: id, areaKm2: area, kind: 'hydrosheds', label: 'Active HydroSHEDS watershed' };
  }
  if (id && store) {
    const row = await store.getRow('watersheds', id).catch(() => null);
    if (row?.geometry) {
      const m = geometryMetrics(row.geometry);
      const g = ee.Geometry(row.geometry);
      return { aoi: g, aoiSimple: g, key: `g:${geometryKey(row.geometry)}`, areaKm2: m.areaKm2, kind: row.isCustom ? 'custom' : 'saved', label: row.isCustom ? 'Custom analysis area' : 'Saved watershed' };
    }
  }
  throw new GeoError('NO_WATERSHED_FOUND', id ? `Context ${id} could not be resolved to a geometry` : 'Either id or geometry is required', id ? 404 : 400);
}

function scaleFor(areaKm2) {
  const a = Math.max(areaKm2 || 1, 0.01) * 1e6;
  return Math.min(5000, Math.max(30, Math.round(Math.sqrt(a / 3e6))));
}

// ─── Sentinel-2 helpers ───────────────────────────────────────────
const S2 = 'COPERNICUS/S2_SR_HARMONIZED';
const S2_LABEL = 'Sentinel-2 SR Harmonized';
function maskS2(image) {
  // SCL: 1 saturated, 3 cloud shadow, 8/9 cloud medium/high, 10 cirrus
  const scl = image.select('SCL');
  const mask = scl.neq(3).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10)).and(scl.neq(1));
  return image.updateMask(mask);
}
const s2Col = (aoi, start, end, maxCloud = 40) =>
  ee.ImageCollection(S2).filterBounds(aoi).filterDate(start, end).filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', maxCloud));

/** The three Sentinel-2 indices, computed identically for map tiles, fingerprint, timeline and attention. */
const INDEX_BANDS = { ndvi: ['B8', 'B4'], ndwi: ['B3', 'B8'], ndmi: ['B8', 'B11'] };
const indexImage = (img) => ee.Image.cat(Object.entries(INDEX_BANDS).map(([k, b]) => img.normalizedDifference(b).rename(k)));
const INDEX_META = {
  ndvi: { label: 'NDVI', name: 'Vegetation', formula: '(B8 − B4)/(B8 + B4)', nativeResolution: '10 m' },
  ndwi: { label: 'NDWI', name: 'Surface water', formula: '(B3 − B8)/(B3 + B8)', nativeResolution: '10 m' },
  ndmi: { label: 'NDMI', name: 'Vegetation moisture', formula: '(B8 − B11)/(B8 + B11)', nativeResolution: '20 m' }
};

const isoDay = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n, from = new Date()) => new Date(from.getTime() - n * 86400000);
const round = (v, d = 3) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const isTimeout = (e) => /timed out/i.test(e?.message || '');

async function windowStats(ref, start, end) {
  const k = `wstats:${ref.key}:${start}:${end}`;
  return memo(k, async () => {
    const col = s2Col(ref.aoi, start, end, 40);
    const n = await evalEE(col.size(), 60000);
    if (!n) return { n: 0, start, end };
    const comp = col.map(maskS2).median();
    const scale = scaleFor(ref.areaKm2);
    const vals = await evalEE(indexImage(comp).reduceRegion({
      reducer: ee.Reducer.mean(), geometry: ref.aoi, scale, maxPixels: 1e9, bestEffort: true, tileScale: 4
    }), 100000);
    return { n, start, end, scale, ndvi: vals?.ndvi ?? null, ndwi: vals?.ndwi ?? null, ndmi: vals?.ndmi ?? null };
  });
}

// ─── Fingerprint ──────────────────────────────────────────────────
// Each metric carries its own status (AVAILABLE | NO_DATA | ERROR | TIMEOUT) and provenance.
export async function computeFingerprint(input) {
  const ref = await geometryRef(input);
  return memo(`fp:${ref.key}`, async () => {
    const end = isoDay(new Date());
    let stats = null, usedDays = null;
    for (const d of [30, 90, 180]) {
      const s = await windowStats(ref, isoDay(daysAgo(d)), end);
      if (s.n > 0) { stats = s; usedDays = d; break; }
    }
    const lineage = { geometry: ref.label, geometryKey: ref.key, areaKm2: round(ref.areaKm2, 2), processedAt: new Date().toISOString() };
    const metrics = {};
    if (!stats) {
      for (const k of Object.keys(INDEX_META)) metrics[k] = { ...INDEX_META[k], status: 'NO_DATA', reason: 'No Sentinel-2 SR scene with <40% cloud intersects this geometry in the last 180 days.', dataset: S2 };
    } else {
      const prov = {
        dataset: S2, datasetLabel: S2_LABEL, method: 'Cloud-masked (SCL) median composite → zonal mean', provider: 'Google Earth Engine',
        window: `Last ${usedDays} days`, windowStart: stats.start, windowEnd: stats.end, analysisScaleM: stats.scale, imageCount: stats.n
      };
      for (const k of Object.keys(INDEX_META)) {
        const v = round(stats[k], 3);
        metrics[k] = { ...INDEX_META[k], ...prov, value: v, status: v == null ? 'NO_DATA' : 'AVAILABLE', reason: v == null ? 'All pixels masked (cloud/shadow) in the composite.' : undefined };
      }
    }
    // Land cover + drainage: independent, each fallible on its own
    const scale = scaleFor(ref.areaKm2);
    const lcStart = stats?.start || isoDay(daysAgo(90));
    const [lc, dr] = await Promise.allSettled([
      (async () => {
        const dw = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1').filterBounds(ref.aoi).filterDate(lcStart, end).select('label');
        const n = await evalEE(dw.size(), 60000);
        if (!n) return { status: 'NO_DATA', reason: 'No Dynamic World scenes in window', dataset: 'GOOGLE/DYNAMICWORLD/V1' };
        const hist = await evalEE(dw.mode().reduceRegion({
          reducer: ee.Reducer.frequencyHistogram(), geometry: ref.aoi, scale: Math.max(scale, 60), maxPixels: 1e9, bestEffort: true, tileScale: 4
        }), 100000);
        const h = hist?.label || {};
        const total = Object.values(h).reduce((a, b) => a + b, 0);
        if (!total) return { status: 'NO_DATA', reason: 'Empty class histogram', dataset: 'GOOGLE/DYNAMICWORLD/V1' };
        const classes = Object.entries(h).map(([k, v]) => ({ id: +k, name: DW_CLASSES[+k]?.label || `class ${k}`, color: DW_CLASSES[+k]?.color, share: round(v / total, 4) }))
          .sort((a, b) => b.share - a.share);
        return { status: 'AVAILABLE', top: classes[0], classes, dataset: 'GOOGLE/DYNAMICWORLD/V1', datasetLabel: 'Dynamic World v1', method: 'Per-pixel mode of label band → class share', windowStart: lcStart, windowEnd: end, imageCount: n, analysisScaleM: Math.max(scale, 60) };
      })(),
      (async () => {
        const rivers = ee.FeatureCollection(RIVERS).filterBounds(ref.aoiSimple);
        const d = await evalEE(ee.Dictionary({ n: rivers.size(), len: rivers.aggregate_sum('LENGTH_KM'), maxOrd: rivers.aggregate_min('RIV_ORD') }), 60000);
        return { status: d.n > 0 ? 'AVAILABLE' : 'NO_DATA', segments: d.n, lengthKm: round(d.len, 0), largestRiverOrder: d.maxOrd ?? null, dataset: RIVERS, datasetLabel: 'HydroSHEDS free-flowing rivers', method: 'Reaches intersecting the area (static dataset)' };
      })()
    ]);
    const settled = (r) => r.status === 'fulfilled' ? r.value : { status: isTimeout(r.reason) ? 'TIMEOUT' : 'ERROR', reason: r.reason?.message };
    metrics.landCover = settled(lc);
    metrics.drainage = settled(dr);
    const core = ['ndvi', 'ndwi', 'ndmi'];
    const live = core.filter(k => metrics[k].status === 'AVAILABLE').length;
    return {
      status: !stats ? 'NO_DATA' : live === core.length ? 'AVAILABLE' : live ? 'PARTIAL' : 'NO_DATA',
      summary: { live, total: core.length },
      computedAt: new Date().toISOString(),
      period: stats ? `${stats.start} → ${stats.end}` : null,
      metrics,
      lineage
    };
  });
}

// ─── Timeline ─────────────────────────────────────────────────────
// Phase 1 (this function): real Sentinel-2 acquisition dates over the area — metadata only, one grouped
// server-side reduction, so it terminates quickly even for continental basins.
// Phase 2 (computeTimelineIndices): monthly NDVI/NDWI/NDMI, requested separately so an expensive
// statistic can never take the observation list down with it.
export async function computeTimeline(input) {
  const ref = await geometryRef(input);
  return memo(`tl:${ref.key}`, async () => {
    const months = ref.areaKm2 > 1e6 ? 2 : ref.areaKm2 > 2e5 ? 6 : ref.areaKm2 > 2e4 ? 12 : 24;
    const end = isoDay(new Date());
    const start = isoDay(daysAgo(Math.round(months * 30.44)));
    // Continental basins: footprint test against the basin bounding box (orders of magnitude cheaper
    // than a 10k-vertex polygon); reported in lineage so the approximation is visible.
    const bboxFootprint = ref.areaKm2 > 2e5;
    const footprint = bboxFootprint ? ref.aoiSimple.bounds() : ref.aoiSimple;
    const lineage = { geometry: ref.label, geometryKey: ref.key, footprintTest: bboxFootprint ? 'basin bounding box' : 'basin polygon', processedAt: new Date().toISOString() };
    const col = ee.ImageCollection(S2).filterBounds(footprint).filterDate(start, end)
      .map(img => img.set('date_str', img.date().format('YYYY-MM-dd')));
    const reducer = ee.Reducer.mean().combine(ee.Reducer.count(), null, true)
      .combine(ee.Reducer.first().setOutputs(['imageId']), null, false)
      .group({ groupField: 2, groupName: 'date' });
    const grouped = await evalEE(col.reduceColumns(reducer, ['CLOUDY_PIXEL_PERCENTAGE', 'system:index', 'date_str']), 110000);
    const obs = (grouped?.groups || []).map(g => ({
      date: g.date, scenes: g.count, cloudCover: round(g.mean, 1), sampleImageId: `${S2}/${g.imageId}`,
      type: 'SATELLITE', dataset: S2_LABEL
    })).sort((a, b) => a.date.localeCompare(b.date));
    if (!obs.length) {
      return { status: 'NO_DATA', observations: [], message: 'No Sentinel-2 acquisitions intersect this area in the window.', dateRange: { start, end }, dataset: S2, lineage, checkedAt: new Date().toISOString() };
    }
    return {
      status: 'AVAILABLE', observations: obs, totalObservations: obs.length,
      totalScenes: obs.reduce((a, o) => a + o.scenes, 0),
      clearObservations: obs.filter(o => o.cloudCover < 30).length,
      dateRange: { start, end }, windowMonths: months, dataset: S2, lineage, computedAt: new Date().toISOString()
    };
  });
}

/** Monthly cloud-masked composites → zonal mean NDVI/NDWI/NDMI. Each month succeeds/fails on its own. */
export async function computeTimelineIndices(input) {
  const ref = await geometryRef(input);
  return memo(`tli:${ref.key}`, async () => {
    const months = ref.areaKm2 > 1e6 ? 4 : ref.areaKm2 > 2e5 ? 6 : 12;
    const scale = Math.max(scaleFor(ref.areaKm2), ref.areaKm2 > 1e6 ? 2000 : ref.areaKm2 > 2e5 ? 500 : 30);
    const now = new Date();
    const firstOfMonth = (y, m) => new Date(Date.UTC(y, m, 1));
    const windows = [];
    for (let i = months - 1; i >= 0; i--) {
      const s = firstOfMonth(now.getUTCFullYear(), now.getUTCMonth() - i);
      const e = i === 0 ? now : firstOfMonth(now.getUTCFullYear(), now.getUTCMonth() - i + 1);
      windows.push({ month: isoDay(s).slice(0, 7), start: isoDay(s), end: isoDay(e) });
    }
    const series = await Promise.all(windows.map(async (w) => {
      try {
        const col = s2Col(ref.aoi, w.start, w.end, 50);
        const r = await evalEE(ee.Dictionary({
          n: col.size(),
          v: ee.Algorithms.If(col.size().gt(0),
            indexImage(col.map(maskS2).median()).reduceRegion({ reducer: ee.Reducer.mean(), geometry: ref.aoi, scale, maxPixels: 1e9, bestEffort: true, tileScale: 4 }),
            null)
        }), 100000);
        if (!r?.n) return { ...w, status: 'NO_DATA', imageCount: 0 };
        const v = r.v || {};
        return { ...w, status: 'AVAILABLE', imageCount: r.n, ndvi: round(v.ndvi), ndwi: round(v.ndwi), ndmi: round(v.ndmi) };
      } catch (e) {
        return { ...w, status: isTimeout(e) ? 'TIMEOUT' : 'ERROR', reason: e.message };
      }
    }));
    const ok = series.filter(x => x.status === 'AVAILABLE');
    return {
      status: ok.length === series.length ? 'AVAILABLE' : ok.length ? 'PARTIAL' : series.every(x => x.status === 'NO_DATA') ? 'NO_DATA' : 'ERROR',
      series, analysisScaleM: scale, dataset: S2, method: 'Monthly cloud-masked median composite → zonal mean',
      lineage: { geometry: ref.label, geometryKey: ref.key, processedAt: new Date().toISOString() }
    };
  });
}

// ─── SMAP (NASA SPL4SMGP v008) ───────────────────────────────────
const SMAP = 'NASA/SMAP/SPL4SMGP/008';
async function smapLatestDate() {
  return memo('smap:last', async () => {
    const t = await evalEE(ee.ImageCollection(SMAP).filterDate(isoDay(daysAgo(120)), isoDay(new Date())).aggregate_max('system:time_start'), 45000);
    return t ? new Date(t) : null;
  });
}

// ─── Attention ────────────────────────────────────────────────────
export async function computeAttention(input) {
  const ref = await geometryRef(input);
  return memo(`att:${ref.key}`, async () => {
    const lineage = { geometry: ref.label, geometryKey: ref.key, processedAt: new Date().toISOString() };
    const fp = await computeFingerprint(input);
    if (fp.status === 'NO_DATA') {
      return { status: 'INSUFFICIENT_DATA', items: [], comparisons: [], message: 'INSUFFICIENT DATA — no current Sentinel-2 imagery for this area.', lineage };
    }
    const cur = fp.metrics.ndvi;
    const curStart = cur.windowStart, curEnd = cur.windowEnd;
    const shift = (s) => isoDay(new Date(new Date(s).getTime() - 365 * 86400000));
    const refStats = await windowStats(ref, shift(curStart), shift(curEnd));
    const refLabel = `same window one year earlier (${shift(curStart)} → ${shift(curEnd)})`;
    const items = [];
    const comparisons = [];
    const thresholds = { ndvi: 0.1, ndwi: 0.1, ndmi: 0.1 };
    for (const k of ['ndvi', 'ndwi', 'ndmi']) {
      const c = fp.metrics[k]?.value, r = refStats.n > 0 ? round(refStats[k]) : null;
      const d = c != null && r != null ? round(c - r) : null;
      comparisons.push({
        metric: INDEX_META[k].label, current: c ?? null, reference: r, delta: d,
        status: d == null ? 'NO_DATA' : Math.abs(d) >= thresholds[k] ? 'DEVIATION' : 'WITHIN_RANGE',
        source: S2_LABEL, date: curEnd, currentWindow: `${curStart} → ${curEnd}`, referenceWindow: `${shift(curStart)} → ${shift(curEnd)}`
      });
      if (d == null || Math.abs(d) < thresholds[k]) continue;
      const sev = Math.abs(d) >= 0.2 ? 'HIGH' : 'MEDIUM';
      const type = k === 'ndvi' ? (d < 0 ? 'VEGETATION_DECLINE' : 'VEGETATION_INCREASE')
        : k === 'ndwi' ? (d > 0 ? 'WATER_EXPANSION' : 'WATER_RECESSION')
        : (d < 0 ? 'CANOPY_MOISTURE_DECLINE' : 'CANOPY_MOISTURE_INCREASE');
      items.push({
        id: `${k}-${ref.key}`, type, severity: sev, metric: INDEX_META[k].label, currentValue: c, referenceValue: r, delta: d, status: 'DEVIATION',
        date: curEnd, reason: `${INDEX_META[k].label} ${d > 0 ? 'rose' : 'fell'} by ${Math.abs(d).toFixed(3)} versus the ${refLabel}.`, source: S2_LABEL
      });
    }
    // SMAP surface soil moisture anomaly (~11 km model grid; window ends at the latest available granule)
    let smapStatus = 'NO_DATA';
    try {
      const last = await smapLatestDate();
      if (last) {
        const e = isoDay(new Date(last.getTime() + 86400000)), s = isoDay(daysAgo(30, last));
        const mean = (a, b) => evalEE(ee.ImageCollection(SMAP).filterDate(a, b).select('sm_surface').mean()
          .reduceRegion({ reducer: ee.Reducer.mean(), geometry: ref.aoiSimple, scale: 11000, maxPixels: 1e9, bestEffort: true }), 60000);
        const [c, p] = await Promise.all([mean(s, e), mean(shift(s), shift(e))]);
        if (c?.sm_surface != null && p?.sm_surface != null) {
          const d = round(c.sm_surface - p.sm_surface);
          smapStatus = 'AVAILABLE';
          comparisons.push({ metric: 'SMAP soil moisture (m³/m³)', current: round(c.sm_surface), reference: round(p.sm_surface), delta: d, status: Math.abs(d) >= 0.05 ? 'DEVIATION' : 'WITHIN_RANGE', source: 'NASA SMAP L4 v008', date: isoDay(last), currentWindow: `${s} → ${isoDay(last)}`, referenceWindow: `${shift(s)} → ${shift(isoDay(last))}` });
          if (d <= -0.05) items.push({
            id: `sm-${ref.key}`, type: 'SOIL_MOISTURE_DEFICIT', severity: d <= -0.1 ? 'HIGH' : 'MEDIUM', metric: 'SMAP sm_surface', status: 'DEVIATION',
            currentValue: round(c.sm_surface), referenceValue: round(p.sm_surface), delta: d, date: isoDay(last),
            reason: `Surface soil moisture is ${Math.abs(d).toFixed(3)} m³/m³ lower than the same 30 days one year earlier.`, source: 'NASA SMAP L4 v008'
          });
        }
      }
    } catch (e) { smapStatus = isTimeout(e) ? 'TIMEOUT' : 'ERROR'; }

    const status = refStats.n > 0 ? (items.length ? 'AVAILABLE' : 'NO_ATTENTION_ITEMS') : 'INSUFFICIENT_DATA';
    return {
      status, items, comparisons, smapStatus,
      message: refStats.n === 0
        ? 'INSUFFICIENT DATA — no reference Sentinel-2 imagery one year earlier.'
        : items.length ? `${items.length} indicator(s) deviate from the same-season reference.` : 'No indicator deviates from the same-season reference beyond thresholds (±0.10 index, −0.05 m³/m³ soil moisture).',
      lineage: { ...lineage, current: `${curStart} → ${curEnd}`, reference: `${shift(curStart)} → ${shift(curEnd)}` },
      computedAt: new Date().toISOString()
    };
  });
}

// ─── Layers ───────────────────────────────────────────────────────
export function listLayers() {
  return Object.values(WATERSHED_LAYERS).map(l => ({ ...l }));
}

export async function computeLayerTile(input, layerId, startDate, endDate) {
  assertEE();
  const def = WATERSHED_LAYERS[layerId];
  if (!def) throw new GeoError('UNKNOWN_LAYER', `Unknown layer: ${layerId}`, 400);
  if (layerId === 'boundary') return { available: true, vector: true, layerId, dataStatus: 'AVAILABLE' };
  const ref = await geometryRef(input);
  const end = endDate || isoDay(new Date());
  const start = startDate || isoDay(daysAgo(30));
  const key = `layer:${ref.key}:${layerId}:${start}:${end}`;
  return memo(key, async () => {
    const aoi = ref.aoi;
    let image, vis = def.vis, date = end, extras = {};
    switch (layerId) {
      case 'ndvi':
      case 'ndwi':
      case 'ndmi':
      case 'sentinel2': {
        // widen the window if empty so the tile reflects real imagery over the geometry
        let usedStart = start, n = 0;
        for (const d of [0, 60, 150]) {
          usedStart = isoDay(daysAgo(30 + d, new Date(end)));
          n = await evalEE(s2Col(aoi, usedStart, end, 40).size(), 60000);
          if (n > 0) break;
        }
        if (!n) return { available: false, layerId, dataStatus: 'NO_DATA', reason: 'No Sentinel-2 scenes with <40% cloud in the last 180 days for this area.', dataset: S2, checked: { start: isoDay(daysAgo(180, new Date(end))), end } };
        const comp = s2Col(aoi, usedStart, end, 40).map(maskS2).median().clip(aoi);
        image = layerId === 'sentinel2' ? comp.select(['B4', 'B3', 'B2']) : comp.normalizedDifference(INDEX_BANDS[layerId]);
        extras = { windowStart: usedStart, windowEnd: end, imageCount: n };
        break;
      }
      case 'dynamicWorld': {
        let s2 = start, c2 = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1').filterBounds(aoi).filterDate(start, end);
        let n = await evalEE(c2.size(), 60000);
        if (!n) { s2 = isoDay(daysAgo(180, new Date(end))); c2 = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1').filterBounds(aoi).filterDate(s2, end); n = await evalEE(c2.size(), 60000); }
        if (!n) return { available: false, layerId, dataStatus: 'NO_DATA', reason: 'No Dynamic World scenes in the last 180 days for this area.', dataset: def.dataset };
        image = c2.select('label').mode().clip(aoi);
        extras = { windowStart: s2, windowEnd: end, imageCount: n };
        break;
      }
      case 'terrain': {
        const dem = ee.Image('USGS/SRTMGL1_003').select('elevation');
        const mm = await evalEE(dem.reduceRegion({ reducer: ee.Reducer.percentile([2, 98]), geometry: ref.aoiSimple, scale: Math.max(scaleFor(ref.areaKm2), 90), maxPixels: 1e9, bestEffort: true, tileScale: 4 }), 60000)
          .catch(() => null);
        const lo = Math.round(mm?.elevation_p2 ?? 0), hi0 = Math.round(mm?.elevation_p98 ?? 3000);
        const hi = hi0 > lo ? hi0 : lo + 100;
        // colour relief × hillshade, rendered as a ready RGB image
        const colour = dem.visualize({ min: lo, max: hi, palette: def.vis.palette });
        const shade = ee.Terrain.hillshade(dem).divide(255).multiply(0.6).add(0.4);
        image = colour.multiply(shade).uint8().clip(aoi);
        vis = {};
        date = '2000 (SRTM mission)';
        extras = { stretchMin: lo, stretchMax: hi, legend: { type: 'gradient', min: lo, max: hi, unit: 'm' } };
        break;
      }
      case 'soilMoisture': {
        const last = await smapLatestDate();
        if (!last) return { available: false, layerId, dataStatus: 'NO_DATA', reason: 'No SMAP L4 granules in the last 120 days.', dataset: SMAP, resolution: def.resolution, checked: { start: isoDay(daysAgo(120)), end } };
        const e = isoDay(new Date(last.getTime() + 86400000)), s = isoDay(daysAgo(7, last));
        const sm = ee.ImageCollection(SMAP).filterDate(s, e).select('sm_surface');
        const n = await evalEE(sm.size(), 45000);
        if (!n) return { available: false, layerId, dataStatus: 'NO_DATA', reason: `No SMAP L4 granules between ${s} and ${e}.`, dataset: SMAP, resolution: def.resolution, checked: { start: s, end: e } };
        image = sm.mean().clip(aoi);
        date = isoDay(last);
        extras = { windowStart: s, windowEnd: isoDay(last), imageCount: n, note: 'Latest 7 days of 3-hourly SMAP L4 analyses (data latency ≈ days).' };
        break;
      }
      case 'drainage': {
        // legible at basin scale: only reaches whose upstream area is ≥ 0.2% of the basin (min 50 km²)
        const minUpland = Math.max(50, Math.round((ref.areaKm2 || 0) * 0.002));
        const rivers = ee.FeatureCollection(RIVERS).filterBounds(ref.aoiSimple).filter(ee.Filter.gte('UPLAND_SKM', minUpland))
          .map(f => {
            const up = ee.Number(f.get('UPLAND_SKM'));
            const cls = ee.Algorithms.If(up.gte(minUpland * 50), 3, ee.Algorithms.If(up.gte(minUpland * 5), 2, 1));
            return f.set({ cls, w: ee.Number(cls) });
          });
        image = ee.Image().byte().paint({ featureCollection: rivers, color: 'cls', width: 'w' }).clip(aoi);
        date = 'static (HydroSHEDS v1)';
        extras = { minUplandKm2: minUpland, note: `Reaches with upstream area ≥ ${minUpland} km² shown; width/colour by upstream area.` };
        break;
      }
      default:
        throw new GeoError('UNKNOWN_LAYER', `Unknown layer: ${layerId}`, 400);
    }
    const mapId = await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new GeoError('ANALYSIS_FAILED', 'Earth Engine getMapId timed out after 60s', 504)), 60000);
      image.getMapId(vis, (obj, err) => { clearTimeout(t); err ? reject(new GeoError(classifyEEError(err), String(err), 502)) : resolve(obj); });
    });
    return {
      available: true, layerId, mapLayerId: def.mapId, tileUrl: mapId.urlFormat, displayName: def.label, source: def.source, dataset: def.dataset,
      resolution: def.resolution, date, dataStatus: 'AVAILABLE', visParams: vis, ...extras,
      lineage: { geometry: ref.label, geometryKey: ref.key, processedAt: new Date().toISOString() }
    };
  });
}

// ─── Saved / seeded watersheds ────────────────────────────────────
const SEEDS = [
  { name: 'Sardar Sarovar / Narmada', lat: 21.83, lon: 73.75, level: 5, river: 'Narmada', feature: 'Sardar Sarovar Dam', description: 'Narmada basin draining to the Sardar Sarovar dam (Gujarat / Madhya Pradesh).' },
  { name: 'Mahanadi', lat: 21.53, lon: 83.87, level: 4, river: 'Mahanadi', feature: 'Hirakud Dam', description: 'Mahanadi basin including the Hirakud reservoir (Odisha / Chhattisgarh).' },
  { name: 'Subarnarekha', lat: 22.80, lon: 86.20, level: 6, river: 'Subarnarekha', description: 'Eastern India basin spanning Jharkhand, West Bengal and Odisha.' },
  { name: 'Bhadar', lat: 21.75, lon: 70.62, level: 7, river: 'Bhadar', description: 'Saurashtra (Gujarat) catchment — check dams and irrigation.' },
  { name: 'Godavari', lat: 18.00, lon: 79.55, level: 4, river: 'Godavari', description: 'Peninsular India\'s largest river basin.' },
  { name: 'Congo', lat: -4.30, lon: 15.30, level: 3, river: 'Congo', description: 'Congo basin resolved at Kinshasa (Central Africa).' },
  { name: 'Amazon', lat: -3.13, lon: -60.02, level: 3, river: 'Amazon', description: 'Amazon basin resolved at Manaus (South America).' },
  { name: 'Nile', lat: 30.05, lon: 31.25, level: 3, river: 'Nile', feature: 'Aswan High Dam', description: 'Nile basin resolved at Cairo (North-East Africa).' }
];
export const SEED_NAMES = SEEDS.map(s => s.name);

export async function recordFromContext(ctx, extra = {}) {
  const m = geometryMetrics(ctx.geometry);
  return {
    id: ctx.id,
    name: ctx.name,
    displayName: ctx.displayName || ctx.name,
    source: ctx.source,
    type: ctx.type,
    level: ctx.level ?? null,
    parentId: ctx.parentId ?? null,
    geometry: ctx.geometry,
    bbox: m.bbox,
    center: m.centroid ? [m.centroid.lon, m.centroid.lat] : null,
    areaKm2: m.areaKm2,
    perimeterKm: m.perimeterKm,
    country: ctx.country ?? null,
    region: ctx.region ?? null,
    sourceDataset: ctx.sourceDataset ?? null,
    sourceFeatureId: ctx.sourceFeatureId ?? null,
    isCustom: !!ctx.isCustom,
    isDemo: !!ctx.isDemo,
    isSaved: ctx.isSaved !== false,
    metadata: ctx.metadata || {},
    technicalName: ctx.technicalName ?? null,
    naming: ctx.naming ?? null,
    river: ctx.river ?? null,
    riverSystem: ctx.riverSystem ?? null,
    sourceId: ctx.sourceId ?? null,
    createdAt: ctx.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...extra
  };
}

export async function upsertRecord(rec) {
  const existing = await store.getRow('watersheds', rec.id).catch(() => null);
  if (existing) { await store.updateRow('watersheds', rec.id, { ...existing, ...rec, createdAt: existing.createdAt || rec.createdAt }); }
  else await store.insertRow('watersheds', rec.id, rec);
  return store.getRow('watersheds', rec.id);
}

/**
 * Remove legacy rows with no recoverable geometry; seed curated DEMO watersheds with REAL HydroBASINS geometry.
 * Demo rows are isDemo:true / isSaved:false — they never appear in the user's Saved list.
 */
let seeding = null;
export function ensureSeeds() {
  if (seeding) return seeding;
  seeding = (async () => {
    if (!store) return;
    const rows = await store.getAllRows('watersheds').catch(() => []);
    let removed = 0;
    for (const r of rows) {
      const validGeom = r.geometry && validateGeometry(r.geometry).ok;
      const fakeRect = r.type === 'DEMO' || r.type === 'PUBLIC_SNAPSHOT' || /^(ws-|demo-)/.test(r.id || '');
      if (!validGeom || fakeRect || !r.id) {
        await store.deleteRow('watersheds', r.id).catch(() => {});
        removed++;
      }
    }
    if (removed) console.log(`[Geo] removed ${removed} legacy watershed record(s) without real geometry`);
    if (!_eeReady) { seeding = null; return; }
    const current = await store.getAllRows('watersheds').catch(() => []);
    for (const s of SEEDS) {
      const existing = current.find(r => r.isDemo && r.metadata?.seedName === s.name);
      try {
        let rec;
        if (existing && existing.naming?.status && existing.isSaved === false && existing.metadata?.demoVersion === 2) continue;
        if (existing) {
          // migrate: keep the stored HydroBASINS geometry, add dataset naming, detach from Saved
          rec = { ...existing };
        } else {
          const r = await resolvePoint(s.lat, s.lon, { levels: [s.level] });
          const c = r.candidates[0];
          if (!c) { console.warn(`[Geo] seed ${s.name}: no basin at level ${s.level}`); continue; }
          c.country = (await countriesFor({ type: 'Point', coordinates: c.center })).join(' / ') || null;
          rec = await recordFromContext({ ...c, isDemo: true, isSaved: false });
        }
        const named = await nameBasin({ ...rec, technicalName: rec.technicalName || technicalName(rec.level, rec.metadata?.PFAF_ID ?? rec.sourceFeatureId) });
        rec = {
          ...rec, name: named.name, displayName: named.name, technicalName: named.technicalName, naming: named.naming,
          river: named.river ?? s.river, riverSystem: named.riverSystem ?? null,
          isDemo: true, isSaved: false,
          metadata: { ...rec.metadata, seedName: s.name, demoLabel: s.name, river: s.river, feature: s.feature || null, description: s.description, seededFrom: { lat: s.lat, lon: s.lon, level: s.level }, demoVersion: 2 },
          updatedAt: new Date().toISOString()
        };
        await upsertRecord(rec);
        console.log(`[Geo] demo ${s.name} → ${rec.id} "${rec.name}" (${Math.round(rec.areaKm2)} km², naming ${rec.naming?.status})`);
      } catch (e) { console.warn(`[Geo] seed ${s.name} failed: ${e.message}`); }
    }
  })().catch(e => { console.warn('[Geo] ensureSeeds error', e.message); seeding = null; });
  return seeding;
}

export function newCustomId() { return `custom-${crypto.randomBytes(5).toString('hex')}`; }

// ─── Intervention site analysis (Evidence Review) ─────────────────
// Same Sentinel-2 collection, SCL mask and index formulas as the watershed pipeline above, applied to an
// explicit analysis footprint (circle of bufferM around the intervention, or its own polygon).

/** Default analysis radius by intervention type — small structures get a tight footprint. */
export const SITE_BUFFER_DEFAULTS = {
  'Check Dam': 50, 'Farm Pond': 50, 'Percolation Tank': 100, 'Recharge Structure': 25,
  'Contour Trench': 100, 'Bund': 50, 'Plantation': 100, 'Drainage Work': 50, 'Other': 50
};
const S2_SR_START = '2017-03-28';
const SITE_WINDOW_DAYS = 45;      // search ± this many days around each requested date
const SITE_MIN_CLEAR = 0.8;       // share of clear (unmasked) pixels required inside the footprint

function siteFootprint({ lat, lng, bufferM, geometry }) {
  const point = ee.Geometry.Point([lng, lat]);
  if (geometry && (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon')) {
    return { point, aoi: ee.Geometry(geometry), kind: 'polygon' };
  }
  return { point, aoi: point.buffer(bufferM), kind: 'circle' };
}

function thumbUrl(image, params) {
  return new Promise((resolve) => {
    try { image.getThumbURL(params, (url, err) => resolve(err ? null : url)); } catch (_) { resolve(null); }
  });
}

/** Pick the clearest-over-the-footprint Sentinel-2 scene closest to `date`; never invents a scene. */
async function siteScene(fp, date) {
  if (date < S2_SR_START) {
    return { status: 'NO_SUITABLE_IMAGE', requestedDate: date, reason: `Sentinel-2 SR Harmonized imagery starts ${S2_SR_START}; no scene can exist for this date.` };
  }
  const t = new Date(date).getTime();
  const start = isoDay(new Date(t - SITE_WINDOW_DAYS * 86400000));
  const end = isoDay(new Date(t + SITE_WINDOW_DAYS * 86400000));
  const target = ee.Date(date);
  const col = ee.ImageCollection(S2).filterBounds(fp.aoi).filterDate(start, end)
    .map((img) => {
      const clear = maskS2(img).select('B4').mask().reduceRegion({ reducer: ee.Reducer.mean(), geometry: fp.aoi, scale: 10, maxPixels: 1e7 }).get('B4');
      return img.set({ clear, dayDiff: ee.Number(img.date().difference(target, 'day')).abs() });
    });
  const info = await evalEE(ee.Dictionary({
    total: col.size(),
    usable: col.filter(ee.Filter.gte('clear', SITE_MIN_CLEAR)).size(),
    best: ee.Algorithms.If(
      col.filter(ee.Filter.gte('clear', SITE_MIN_CLEAR)).size().gt(0),
      ee.Feature(col.filter(ee.Filter.gte('clear', SITE_MIN_CLEAR)).sort('dayDiff').first()).toDictionary(['system:index', 'clear', 'dayDiff', 'CLOUDY_PIXEL_PERCENTAGE']),
      null
    )
  }), 90000);
  if (!info.best) {
    return {
      status: 'NO_SUITABLE_IMAGE', requestedDate: date, window: { start, end }, scenesInWindow: info.total,
      reason: info.total
        ? `${info.total} Sentinel-2 scene(s) between ${start} and ${end}, but none had ≥${SITE_MIN_CLEAR * 100}% cloud-free pixels over the analysis area.`
        : `No Sentinel-2 scenes cover the analysis area between ${start} and ${end}.`
    };
  }
  const id = `${S2}/${info.best['system:index']}`;
  const acquisitionDate = `${info.best['system:index'].slice(0, 4)}-${info.best['system:index'].slice(4, 6)}-${info.best['system:index'].slice(6, 8)}`;
  return { status: 'AVAILABLE', requestedDate: date, window: { start, end }, scenesInWindow: info.total, imageId: id, acquisitionDate, offsetDays: Math.round(info.best.dayDiff), sceneCloudPct: round(info.best.CLOUDY_PIXEL_PERCENTAGE, 1), clearPctInArea: round(info.best.clear * 100, 1) };
}

async function siteSceneStats(fp, scene) {
  const img = maskS2(ee.Image(scene.imageId));
  const idx = indexImage(img);
  const water = idx.select('ndwi').gt(0).multiply(ee.Image.pixelArea()).rename('waterM2');
  const vals = await evalEE(idx.addBands(water).reduceRegion({
    reducer: ee.Reducer.mean().combine(ee.Reducer.sum(), '', true).combine(ee.Reducer.count(), '', true),
    geometry: fp.aoi, scale: 10, maxPixels: 1e8
  }), 90000);
  // thumbnail: true colour around the footprint with the footprint outline burned in
  const region = fp.aoi.buffer(ee.Number(fp.aoi.area(1)).sqrt().multiply(1.2).max(150)).bounds(1);
  const outline = ee.Image().byte().paint(ee.FeatureCollection([ee.Feature(fp.aoi)]), 1, 2).visualize({ palette: ['00e5ff'] });
  const rgb = ee.Image(scene.imageId).visualize({ bands: ['B4', 'B3', 'B2'], min: 0, max: 3000, gamma: 1.2 });
  const url = await thumbUrl(rgb.blend(outline), { region, dimensions: 512, format: 'png' });
  return {
    ndvi: round(vals?.ndvi_mean), ndwi: round(vals?.ndwi_mean), ndmi: round(vals?.ndmi_mean),
    waterHa: vals?.waterM2_sum != null ? round(vals.waterM2_sum / 1e4, 2) : null,
    pixels: vals?.ndvi_count ?? null,
    thumbUrl: url
  };
}

async function siteLandCover(fp, date) {
  const t = new Date(date).getTime();
  const start = isoDay(new Date(t - 60 * 86400000));
  const end = isoDay(new Date(t + 60 * 86400000));
  const dw = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1').filterBounds(fp.aoi).filterDate(start, end).select('label');
  const n = await evalEE(dw.size(), 60000);
  if (!n) return { status: 'NO_DATA', window: { start, end }, reason: 'no Dynamic World scenes in this window' };
  const h = await evalEE(dw.mode().reduceRegion({ reducer: ee.Reducer.frequencyHistogram(), geometry: fp.aoi, scale: 10, maxPixels: 1e8 }).get('label'), 60000);
  const total = Object.values(h || {}).reduce((a, b) => a + b, 0);
  if (!total) return { status: 'NO_DATA', window: { start, end }, images: n, reason: `${n} Dynamic World scene(s), but none with cloud-free pixels over the analysis area` };
  const classes = Object.entries(h).map(([k, v]) => ({ name: DW_CLASSES[+k]?.label || `class ${k}`, color: DW_CLASSES[+k]?.color, share: round(v / total, 3) })).sort((a, b) => b.share - a.share);
  return { status: 'AVAILABLE', window: { start, end }, images: n, dominant: classes[0], classes: classes.slice(0, 4) };
}

export async function computeSiteChange({ lat, lng, bufferM = 50, geometry = null, baselineDate, currentDate }) {
  assertEE();
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new GeoError('INVALID_INPUT', 'Intervention has no coordinates.', 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(baselineDate || '') || !/^\d{4}-\d{2}-\d{2}$/.test(currentDate || '')) throw new GeoError('INVALID_INPUT', 'baselineDate and currentDate must be YYYY-MM-DD.', 400);
  if (baselineDate >= currentDate) throw new GeoError('INVALID_INPUT', 'Baseline date must be before the current date.', 400);
  const k = `site-change:${lat.toFixed(5)},${lng.toFixed(5)}:${geometry ? geometryKey(geometry) : bufferM}:${baselineDate}:${currentDate}`;
  return memo(k, async () => {
    const fp = siteFootprint({ lat, lng, bufferM, geometry });
    const areaHa = round((await evalEE(fp.aoi.area(1), 30000)) / 1e4, 2);
    const [b, c] = await Promise.all([siteScene(fp, baselineDate), siteScene(fp, currentDate)]);
    if (b.status === 'AVAILABLE' && c.status === 'AVAILABLE' && b.imageId === c.imageId) {
      c.status = 'NO_SUITABLE_IMAGE';
      c.reason = 'Both dates resolve to the same Sentinel-2 scene — choose dates further apart.';
    }
    const [bs, cs, lb, lc] = await Promise.all([
      b.status === 'AVAILABLE' ? siteSceneStats(fp, b) : null,
      c.status === 'AVAILABLE' ? siteSceneStats(fp, c) : null,
      siteLandCover(fp, baselineDate).catch((e) => ({ status: 'ERROR', reason: e.message })),
      siteLandCover(fp, currentDate).catch((e) => ({ status: 'ERROR', reason: e.message }))
    ]);
    const baseline = bs ? { ...b, ...bs } : b;
    const current = cs ? { ...c, ...cs } : c;
    const both = bs && cs;
    const delta = (key) => (both && bs[key] != null && cs[key] != null ? { before: bs[key], after: cs[key], delta: round(cs[key] - bs[key]) } : null);
    return {
      status: both ? 'AVAILABLE' : 'NO_SUITABLE_IMAGE',
      analysisArea: { kind: fp.kind, center: { lat, lng }, radiusM: fp.kind === 'circle' ? bufferM : null, areaHa },
      baseline, current,
      change: both ? { ndvi: delta('ndvi'), ndwi: delta('ndwi'), ndmi: delta('ndmi'), waterHa: delta('waterHa') } : null,
      landCover: {
        before: lb, after: lc,
        transition: lb?.status === 'AVAILABLE' && lc?.status === 'AVAILABLE' ? { from: lb.dominant.name, to: lc.dominant.name, changed: lb.dominant.name !== lc.dominant.name } : null,
        dataset: 'GOOGLE/DYNAMICWORLD/V1', method: 'Per-pixel mode of label band in ±60 days, share inside the analysis area'
      },
      provenance: {
        dataset: S2_LABEL, collection: S2, resolution: '10 m (NDMI uses 20 m B11)',
        cloudMask: 'SCL classes 1, 3, 8, 9, 10 masked',
        selection: `Closest scene within ±${SITE_WINDOW_DAYS} days with ≥${SITE_MIN_CLEAR * 100}% clear pixels inside the analysis area`,
        formulas: Object.fromEntries(Object.entries(INDEX_META).map(([key, m]) => [key, m.formula])),
        waterMethod: 'Surface water = pixels with NDWI > 0 (McFeeters), area summed inside the analysis area'
      },
      computedAt: new Date().toISOString()
    };
  });
}

export async function computeSiteTerrain({ lat, lng, bufferM = 50, geometry = null }) {
  assertEE();
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new GeoError('INVALID_INPUT', 'Intervention has no coordinates.', 400);
  const k = `site-terrain:${lat.toFixed(5)},${lng.toFixed(5)}:${geometry ? geometryKey(geometry) : bufferM}`;
  return memo(k, async () => {
    const fp = siteFootprint({ lat, lng, bufferM, geometry });
    const dem = ee.Image('USGS/SRTMGL1_003').select('elevation');
    const slope = ee.Terrain.slope(dem).rename('slope');
    // terrain stats over at least one SRTM pixel neighbourhood
    const terrainAoi = bufferM < 45 && fp.kind === 'circle' ? fp.point.buffer(45) : fp.aoi;
    const upa = ee.Image('MERIT/Hydro/v1_0_1').select('upa');
    const nearbyRivers = ee.FeatureCollection(RIVERS).filterBounds(fp.point.buffer(25000));
    const res = await evalEE(ee.Dictionary({
      terrain: dem.addBands(slope).reduceRegion({ reducer: ee.Reducer.mean().combine(ee.Reducer.minMax(), '', true), geometry: terrainAoi, scale: 30, maxPixels: 1e7 }),
      upa: upa.reduceRegion({ reducer: ee.Reducer.max(), geometry: fp.point.buffer(Math.max(bufferM, 90)), scale: 90, maxPixels: 1e7 }).get('upa'),
      riverCount: nearbyRivers.size(),
      riverDistanceM: ee.Algorithms.If(nearbyRivers.size().gt(0), nearbyRivers.geometry().distance(fp.point, 10), null)
    }), 90000);
    const t = res.terrain || {};
    const elevation = t.elevation_mean != null ? { mean: round(t.elevation_mean, 0), min: round(t.elevation_min, 0), max: round(t.elevation_max, 0) } : null;
    const slopeDeg = t.slope_mean != null ? { mean: round(t.slope_mean, 1), max: round(t.slope_max, 1) } : null;
    const upaKm2 = res.upa != null ? round(res.upa, 2) : null;
    const flowClass = upaKm2 == null ? null
      : upaKm2 < 1 ? { level: 'LOW', explanation: 'Small upstream contributing area — hillslope position rather than a defined channel.' }
      : upaKm2 < 10 ? { level: 'MODERATE', explanation: 'Upstream contributing area typical of a minor drainage line near the intervention.' }
      : upaKm2 < 100 ? { level: 'HIGH', explanation: 'High upstream contributing flow signal near the intervention — likely on or next to a stream channel.' }
      : { level: 'VERY HIGH', explanation: 'Very large upstream contributing area — the footprint is on or adjacent to a major river channel.' };
    const slopeClass = slopeDeg == null ? null
      : slopeDeg.mean < 3 ? 'Nearly level ground (< 3°).' : slopeDeg.mean < 8 ? 'Gentle slope (3–8°).' : slopeDeg.mean < 15 ? 'Moderate slope (8–15°).' : 'Steep ground (≥ 15°) — runoff and erosion potential is higher.';
    const status = elevation || upaKm2 != null ? 'AVAILABLE' : 'NO_DATA';
    return {
      status,
      elevation: elevation && { ...elevation, unit: 'm', dataset: 'USGS/SRTMGL1_003 (SRTM)', resolution: '30 m', method: `Mean/min/max over ${terrainAoi === fp.aoi ? 'the analysis area' : 'a 45 m radius (one SRTM pixel neighbourhood)'}` },
      slope: slopeDeg && { ...slopeDeg, unit: '°', explanation: slopeClass, dataset: 'USGS/SRTMGL1_003 (SRTM)', resolution: '30 m', method: 'ee.Terrain.slope on SRTM DEM' },
      flowAccumulation: upaKm2 != null ? { upstreamAreaKm2: upaKm2, ...flowClass, dataset: 'MERIT/Hydro/v1_0_1 (upa)', resolution: '~90 m', method: `Maximum upstream drainage area within ${Math.max(bufferM, 90)} m` } : null,
      drainage: res.riverDistanceM != null
        ? { distanceM: round(res.riverDistanceM, 0), dataset: 'WWF/HydroSHEDS/v1/FreeFlowingRivers', resolution: '15 arc-second network', method: 'Distance from the intervention point to the nearest mapped river reach', note: 'Only rivers in the HydroSHEDS network (≈10 km² upstream area and larger) are mapped.' }
        : { distanceM: null, note: 'No mapped HydroSHEDS river reach within 25 km.', dataset: 'WWF/HydroSHEDS/v1/FreeFlowingRivers' },
      computedAt: new Date().toISOString()
    };
  });
}
