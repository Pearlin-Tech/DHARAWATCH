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
import { WATERSHED_LAYERS } from '../src/shared/layerRegistry.js';

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
function cget(k) { const e = cache.get(k); if (!e) return null; if (Date.now() - e.t > TTL) { cache.delete(k); return null; } return e.v; }
function cset(k, v) { cache.set(k, { t: Date.now(), v }); return v; }
async function memo(k, fn) {
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
const basinsFC = (level) => ee.FeatureCollection(`WWF/HydroSHEDS/v1/Basins/hybas_${level}`);
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
    name: `HydroBASIN L${level} · ${p.PFAF_ID ?? hid}`,
    displayName: `HydroBASINS level ${level} · Pfafstetter ${p.PFAF_ID ?? hid}`,
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
      MAIN_BAS: p.MAIN_BAS, ENDO: p.ENDORHEIC, COAST: p.COAST, ORDER: p.ORDER
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
    return { candidates: dedup, failedLevels: failed.map(f => ({ level: f.level, error: f._error })) };
  });
}

export function recommendedLevelFor(areaKm2) {
  // sensible analysis scale: sub-basin-ish
  if (areaKm2 == null) return 7;
  return 7;
}

/** Real polygon → intersecting watersheds with overlap % (hierarchy aware). */
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
    const per = await Promise.all(levels.map(async (L) => {
      try {
        const col = basinsFC(L).filterBounds(poly)
          .map(ft => {
            const g = ft.geometry();
            const inter = g.intersection(poly, 100).area(100).divide(1e6);
            return ee.Feature(g.simplify(SIMPLIFY[L] || 100), ft.toDictionary()).set('overlap_km2', inter);
          })
          .sort('overlap_km2', false)
          .limit(12);
        const data = await evalEE(col, 90000);
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
    // recommended: finest basin that still contains ≥90% of drawn area
    const containing = candidates.filter(c => c.overlapPercent >= 90).sort((x, y) => y.level - x.level)[0];
    return { drawn, candidates, recommendedId: containing?.id || null };
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
    ctx.country = (await countriesFor({ type: 'Point', coordinates: ctx.center })).join(' / ') || null;
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
    return { aoi: ee.Geometry(v.geometry), key: `g:${geometryKey(v.geometry)}`, areaKm2: m.areaKm2, kind: v.geometry.type === 'Point' ? 'point' : 'geometry', label: 'Drawn / supplied geometry' };
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
    return { aoi: filtered.geometry(), key: id, areaKm2: area, kind: 'hydrosheds', label: 'Active HydroSHEDS watershed' };
  }
  if (id && store) {
    const row = await store.getRow('watersheds', id).catch(() => null);
    if (row?.geometry) {
      const m = geometryMetrics(row.geometry);
      return { aoi: ee.Geometry(row.geometry), key: `g:${geometryKey(row.geometry)}`, areaKm2: m.areaKm2, kind: row.isCustom ? 'custom' : 'saved', label: row.isCustom ? 'Custom analysis area' : 'Saved watershed' };
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
function maskS2(image) {
  const scl = image.select('SCL');
  const mask = scl.neq(3).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10)).and(scl.neq(1));
  return image.updateMask(mask);
}
const s2Col = (aoi, start, end, maxCloud = 40) =>
  ee.ImageCollection(S2).filterBounds(aoi).filterDate(start, end).filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', maxCloud));

const isoDay = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n, from = new Date()) => new Date(from.getTime() - n * 86400000);

async function windowStats(ref, start, end) {
  const k = `wstats:${ref.key}:${start}:${end}`;
  return memo(k, async () => {
    const col = s2Col(ref.aoi, start, end, 40);
    const n = await evalEE(col.size(), 45000);
    if (!n) return { n: 0, start, end };
    const comp = col.map(maskS2).median();
    const idx = ee.Image.cat([
      comp.normalizedDifference(['B8', 'B4']).rename('ndvi'),
      comp.normalizedDifference(['B3', 'B8']).rename('ndwi')
    ]);
    const scale = scaleFor(ref.areaKm2);
    const vals = await evalEE(idx.reduceRegion({
      reducer: ee.Reducer.mean(), geometry: ref.aoi, scale, maxPixels: 1e9, bestEffort: true, tileScale: 4
    }), 90000);
    return { n, start, end, scale, ndvi: vals?.ndvi ?? null, ndwi: vals?.ndwi ?? null };
  });
}

const DW_CLASSES = ['Water', 'Trees', 'Grass', 'Flooded vegetation', 'Crops', 'Shrub & scrub', 'Built area', 'Bare ground', 'Snow & ice'];
const round = (v, d = 3) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

// ─── Fingerprint ──────────────────────────────────────────────────
export async function computeFingerprint(input) {
  const ref = await geometryRef(input);
  return memo(`fp:${ref.key}`, async () => {
    const now = new Date();
    const end = isoDay(now);
    let stats = null, usedDays = null;
    for (const d of [30, 90, 180]) {
      const s = await windowStats(ref, isoDay(daysAgo(d)), end);
      if (s.n > 0) { stats = s; usedDays = d; break; }
    }
    const lineageBase = {
      geometry: ref.label, geometryKey: ref.key, areaKm2: round(ref.areaKm2, 2),
      processedAt: new Date().toISOString()
    };
    if (!stats) {
      return {
        status: 'NO_IMAGERY',
        message: 'NO SUITABLE OBSERVATIONS FOUND',
        reason: `No Sentinel-2 SR scenes with <40% cloud intersect this geometry in the last 180 days.`,
        dateRange: { start: isoDay(daysAgo(180)), end },
        dataset: S2,
        lineage: lineageBase,
        metrics: {}
      };
    }
    const windowLabel = `Last ${usedDays} days`;
    const s2Meta = { dataset: S2, datasetLabel: 'Sentinel-2 SR Harmonized', window: windowLabel, windowStart: stats.start, windowEnd: stats.end, scaleM: stats.scale, imageCount: stats.n };
    const metrics = {
      ndvi: { label: 'NDVI', value: round(stats.ndvi, 3), date: stats.end, status: stats.ndvi == null ? 'UNAVAILABLE' : 'AVAILABLE', ...s2Meta },
      ndwi: { label: 'NDWI', value: round(stats.ndwi, 3), date: stats.end, status: stats.ndwi == null ? 'UNAVAILABLE' : 'AVAILABLE', ...s2Meta }
    };

    // Land cover + drainage in parallel, each independently fallible
    const scale = scaleFor(ref.areaKm2);
    const [lc, dr] = await Promise.allSettled([
      (async () => {
        const dw = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1').filterBounds(ref.aoi)
          .filterDate(stats.start, stats.end).select('label');
        const n = await evalEE(dw.size(), 45000);
        if (!n) return { status: 'NO_IMAGERY', reason: 'No Dynamic World scenes in window' };
        const hist = await evalEE(dw.mode().reduceRegion({
          reducer: ee.Reducer.frequencyHistogram(), geometry: ref.aoi, scale: Math.max(scale, 60), maxPixels: 1e9, bestEffort: true, tileScale: 4
        }), 90000);
        const h = hist?.label || {};
        const total = Object.values(h).reduce((a, b) => a + b, 0);
        if (!total) return { status: 'UNAVAILABLE', reason: 'Empty histogram' };
        const classes = Object.entries(h).map(([k, v]) => ({ id: +k, name: DW_CLASSES[+k] || `class ${k}`, share: v / total }))
          .sort((a, b) => b.share - a.share);
        return { status: 'AVAILABLE', top: classes[0], classes: classes.slice(0, 5), dataset: 'GOOGLE/DYNAMICWORLD/V1', datasetLabel: 'Dynamic World v1', window: windowLabel, windowStart: stats.start, windowEnd: stats.end, imageCount: n };
      })(),
      (async () => {
        const rivers = ee.FeatureCollection('WWF/HydroSHEDS/v1/FreeFlowingRivers').filterBounds(ref.aoi);
        const n = await evalEE(rivers.size(), 45000);
        return { status: n > 0 ? 'AVAILABLE' : 'NONE_FOUND', segments: n, dataset: 'WWF/HydroSHEDS/v1/FreeFlowingRivers', datasetLabel: 'HydroRIVERS (free-flowing)', window: 'Static (2019)' };
      })()
    ]);
    metrics.landCover = lc.status === 'fulfilled' ? lc.value : { status: 'ERROR', reason: lc.reason?.message };
    metrics.drainage = dr.status === 'fulfilled' ? dr.value : { status: 'ERROR', reason: dr.reason?.message };

    return {
      status: 'AVAILABLE',
      computedAt: new Date().toISOString(),
      period: `${stats.start} → ${stats.end}`,
      metrics,
      lineage: lineageBase
    };
  });
}

// ─── Timeline ─────────────────────────────────────────────────────
export async function computeTimeline(input) {
  const ref = await geometryRef(input);
  return memo(`tl:${ref.key}`, async () => {
    const months = ref.areaKm2 > 2e5 ? 12 : 24;
    const end = isoDay(new Date());
    const start = isoDay(daysAgo(months * 30));
    const lineage = { geometry: ref.label, geometryKey: ref.key, processedAt: new Date().toISOString() };
    const col = s2Col(ref.aoi, start, end, 60)
      .map(img => img.set('date_str', img.date().format('YYYY-MM-dd')));
    const meta = await evalEE(ee.Dictionary({
      dates: col.aggregate_array('date_str'),
      clouds: col.aggregate_array('CLOUDY_PIXEL_PERCENTAGE')
    }), 90000);
    const dates = meta?.dates || [];
    const byDate = new Map();
    dates.forEach((d, i) => {
      const e = byDate.get(d) || { date: d, scenes: 0, cloudSum: 0 };
      e.scenes++; e.cloudSum += Number(meta.clouds[i]) || 0;
      byDate.set(d, e);
    });
    const obs = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).map(e => ({
      date: e.date, scenes: e.scenes, cloudCover: round(e.cloudSum / e.scenes, 1),
      type: 'SATELLITE', dataset: 'Sentinel-2 SR Harmonized', ndvi: null, ndwi: null, hasIndices: false
    }));
    if (!obs.length) {
      return {
        status: 'NO_IMAGERY', observations: [],
        message: 'NO SUITABLE OBSERVATIONS FOUND',
        dateRange: { start, end }, dataset: S2, lineage, checkedAt: new Date().toISOString()
      };
    }
    // Indices for the most recent clear-ish dates (server-side per-date mosaics, real reduceRegion)
    const sample = [...obs].filter(o => o.cloudCover < 40).slice(-14);
    let statsError = null;
    if (sample.length) {
      try {
        const scale = scaleFor(ref.areaKm2);
        const dl = ee.List(sample.map(o => o.date));
        const res = ee.List(dl.map(d => {
          const day = ee.Date(d);
          const mos = col.filterDate(day, day.advance(1, 'day')).map(maskS2).mosaic();
          const idx = ee.Image.cat([
            mos.normalizedDifference(['B8', 'B4']).rename('ndvi'),
            mos.normalizedDifference(['B3', 'B8']).rename('ndwi')
          ]);
          return ee.Dictionary(idx.reduceRegion({
            reducer: ee.Reducer.mean(), geometry: ref.aoi, scale, maxPixels: 1e9, bestEffort: true, tileScale: 4
          })).set('date', d);
        }));
        const out = await evalEE(res, 120000);
        for (const r of out || []) {
          const o = obs.find(x => x.date === r.date);
          if (o) { o.ndvi = round(r.ndvi, 3); o.ndwi = round(r.ndwi, 3); o.hasIndices = r.ndvi != null || r.ndwi != null; }
        }
      } catch (e) { statsError = e.message; }
    }
    return {
      status: 'AVAILABLE',
      observations: obs,
      totalObservations: obs.length,
      indicesComputedFor: obs.filter(o => o.hasIndices).length,
      indicesError: statsError,
      dateRange: { start, end },
      dataset: S2,
      lineage,
      computedAt: new Date().toISOString()
    };
  });
}

// ─── Attention ────────────────────────────────────────────────────
export async function computeAttention(input) {
  const ref = await geometryRef(input);
  return memo(`att:${ref.key}`, async () => {
    const lineage = { geometry: ref.label, geometryKey: ref.key, processedAt: new Date().toISOString() };
    const fp = await computeFingerprint(input);
    if (fp.status !== 'AVAILABLE') {
      return { status: 'INSUFFICIENT_DATA', items: [], message: 'INSUFFICIENT DATA — no current Sentinel-2 imagery for this geometry.', lineage };
    }
    const curStart = fp.metrics.ndvi.windowStart, curEnd = fp.metrics.ndvi.windowEnd;
    const shift = (s) => isoDay(new Date(new Date(s).getTime() - 365 * 86400000));
    const refStats = await windowStats(ref, shift(curStart), shift(curEnd));
    const items = [];
    const comparisons = [];
    if (refStats.n > 0) {
      const dN = fp.metrics.ndvi.value != null && refStats.ndvi != null ? fp.metrics.ndvi.value - refStats.ndvi : null;
      const dW = fp.metrics.ndwi.value != null && refStats.ndwi != null ? fp.metrics.ndwi.value - refStats.ndwi : null;
      comparisons.push({ metric: 'NDVI', current: fp.metrics.ndvi.value, reference: round(refStats.ndvi), delta: round(dN) });
      comparisons.push({ metric: 'NDWI', current: fp.metrics.ndwi.value, reference: round(refStats.ndwi), delta: round(dW) });
      const refLabel = `same window one year earlier (${refStats.start} → ${refStats.end})`;
      if (dN != null && dN <= -0.1) items.push({
        id: `veg-${ref.key}`, type: 'VEGETATION_STRESS', severity: dN <= -0.2 ? 'HIGH' : 'MEDIUM',
        metric: 'NDVI', currentValue: fp.metrics.ndvi.value, referenceValue: round(refStats.ndvi), delta: round(dN),
        date: curEnd, reason: `NDVI is ${Math.abs(dN).toFixed(2)} lower than ${refLabel}.`, source: 'Sentinel-2 SR Harmonized'
      });
      if (dW != null && Math.abs(dW) >= 0.1) items.push({
        id: `wat-${ref.key}`, type: dW > 0 ? 'WATER_EXPANSION' : 'WATER_RECESSION', severity: Math.abs(dW) >= 0.2 ? 'HIGH' : 'MEDIUM',
        metric: 'NDWI', currentValue: fp.metrics.ndwi.value, referenceValue: round(refStats.ndwi), delta: round(dW),
        date: curEnd, reason: `NDWI changed by ${dW > 0 ? '+' : ''}${dW.toFixed(2)} versus ${refLabel}.`, source: 'Sentinel-2 SR Harmonized'
      });
    }
    // SMAP soil moisture anomaly (coarse ~9 km — only meaningful for larger areas)
    try {
      const smap = (s, e) => ee.ImageCollection('NASA/SMAP/SPL4SMGP/007').filterDate(s, e).select('sm_surface').mean();
      const [cur, prev] = await Promise.all([
        evalEE(smap(curStart, curEnd).reduceRegion({ reducer: ee.Reducer.mean(), geometry: ref.aoi, scale: 9000, maxPixels: 1e9, bestEffort: true }), 60000),
        evalEE(smap(shift(curStart), shift(curEnd)).reduceRegion({ reducer: ee.Reducer.mean(), geometry: ref.aoi, scale: 9000, maxPixels: 1e9, bestEffort: true }), 60000)
      ]);
      if (cur?.sm_surface != null && prev?.sm_surface != null) {
        const d = cur.sm_surface - prev.sm_surface;
        comparisons.push({ metric: 'SOIL_MOISTURE', current: round(cur.sm_surface), reference: round(prev.sm_surface), delta: round(d) });
        if (d <= -0.05) items.push({
          id: `sm-${ref.key}`, type: 'SOIL_MOISTURE_DEFICIT', severity: d <= -0.1 ? 'HIGH' : 'MEDIUM', metric: 'SMAP sm_surface (m³/m³)',
          currentValue: round(cur.sm_surface), referenceValue: round(prev.sm_surface), delta: round(d), date: curEnd,
          reason: `Surface soil moisture is ${Math.abs(d).toFixed(3)} m³/m³ lower than the same window one year earlier.`, source: 'NASA SMAP L4'
        });
      }
    } catch (e) { /* SMAP is optional; its absence is reported via comparisons */ }

    return {
      status: refStats.n > 0 ? (items.length ? 'AVAILABLE' : 'NO_ATTENTION_ITEMS') : 'INSUFFICIENT_DATA',
      items, comparisons,
      message: refStats.n === 0
        ? 'INSUFFICIENT DATA — no reference imagery from one year earlier.'
        : items.length ? `${items.length} indicator(s) deviate from the same-season reference.` : 'No indicator deviates from the same-season reference beyond thresholds.',
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
  if (layerId === 'boundary') return { available: true, vector: true, layerId, dataStatus: 'AVAILABLE' };
  const ref = await geometryRef(input);
  const end = endDate || isoDay(new Date());
  const start = startDate || isoDay(daysAgo(30));
  const key = `layer:${ref.key}:${layerId}:${start}:${end}`;
  return memo(key, async () => {
    const aoi = ref.aoi;
    let image, vis, displayName, source, date = end, dataset, extras = {};
    switch (layerId) {
      case 'ndvi':
      case 'ndwi':
      case 'sentinel2': {
        // widen window if empty so the tile reflects real imagery over the geometry
        let usedStart = start, n = 0;
        for (const d of [0, 60, 150]) {
          usedStart = isoDay(daysAgo(30 + d, new Date(end)));
          n = await evalEE(s2Col(aoi, usedStart, end, 40).size(), 45000);
          if (n > 0) break;
        }
        if (!n) return { available: false, layerId, dataStatus: 'NO_IMAGERY', reason: 'No Sentinel-2 scenes with <40% cloud in the last 180 days for this geometry.' };
        const comp = s2Col(aoi, usedStart, end, 40).map(maskS2).median().clip(aoi);
        if (layerId === 'ndvi') {
          image = comp.normalizedDifference(['B8', 'B4']);
          vis = { min: -0.2, max: 0.8, palette: ['d73027', 'f46d43', 'fdae61', 'fee08b', 'd9ef8b', 'a6d96a', '66bd63', '1a9850'] };
          displayName = 'Vegetation (NDVI)';
        } else if (layerId === 'ndwi') {
          image = comp.normalizedDifference(['B3', 'B8']);
          vis = { min: -0.5, max: 0.5, palette: ['d73027', 'f46d43', 'fee08b', 'ffffbf', 'c6dbef', '6baed6', '08519c'] };
          displayName = 'Surface Water (NDWI)';
        } else {
          image = comp.select(['B4', 'B3', 'B2']);
          vis = { bands: ['B4', 'B3', 'B2'], min: 0, max: 3000, gamma: 1.2 };
          displayName = 'True Color (Sentinel-2)';
        }
        source = 'Sentinel-2 SR Harmonized'; dataset = S2;
        extras = { windowStart: usedStart, windowEnd: end, imageCount: n };
        break;
      }
      case 'dynamicWorld': {
        const col = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1').filterBounds(aoi).filterDate(start, end);
        let n = await evalEE(col.size(), 45000);
        let c2 = col, s2 = start;
        if (!n) { s2 = isoDay(daysAgo(180, new Date(end))); c2 = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1').filterBounds(aoi).filterDate(s2, end); n = await evalEE(c2.size(), 45000); }
        if (!n) return { available: false, layerId, dataStatus: 'NO_IMAGERY', reason: 'No Dynamic World scenes in the last 180 days for this geometry.' };
        image = c2.select('label').mode().clip(aoi);
        vis = { min: 0, max: 8, palette: ['419BDF', '397D49', '88B053', '7A87C6', 'E49635', 'DFC35A', 'C4281B', 'A59B8F', 'B39FE1'] };
        displayName = 'Land Cover (Dynamic World)'; source = 'Dynamic World v1'; dataset = 'GOOGLE/DYNAMICWORLD/V1';
        extras = { windowStart: s2, windowEnd: end, imageCount: n };
        break;
      }
      case 'terrain': {
        const dem = ee.Image('USGS/SRTMGL1_003').select('elevation').clip(aoi);
        // data-driven stretch from the geometry itself
        const mm = await evalEE(dem.reduceRegion({ reducer: ee.Reducer.percentile([2, 98]), geometry: aoi, scale: Math.max(scaleFor(ref.areaKm2), 90), maxPixels: 1e9, bestEffort: true, tileScale: 4 }), 60000)
          .catch(() => null);
        const lo = mm?.elevation_p2 ?? 0, hi = mm?.elevation_p98 ?? 3000;
        image = dem;
        vis = { min: lo, max: hi > lo ? hi : lo + 100, palette: ['006633', 'E5FFCC', '662A00', 'D8D8D8', 'F5F5F5'] };
        displayName = 'Terrain (SRTM 30 m)'; source = 'SRTM GL1 (USGS/NASA)'; dataset = 'USGS/SRTMGL1_003'; date = '2000';
        extras = { stretchMin: round(lo, 0), stretchMax: round(hi, 0) };
        break;
      }
      case 'soilMoisture': {
        const sm = ee.ImageCollection('NASA/SMAP/SPL4SMGP/007').filterDate(start, end).select('sm_surface');
        const n = await evalEE(sm.size(), 30000);
        if (!n) return { available: false, layerId, dataStatus: 'NO_IMAGERY', reason: `No SMAP L4 granules between ${start} and ${end}.` };
        image = sm.mean().clip(aoi);
        vis = { min: 0.02, max: 0.5, palette: ['red', 'orange', 'yellow', 'lime', 'blue'] };
        displayName = 'Soil Moisture (SMAP ~9 km)'; source = 'NASA SMAP Level-4'; dataset = 'NASA/SMAP/SPL4SMGP/007';
        extras = { windowStart: start, windowEnd: end, imageCount: n };
        break;
      }
      case 'drainage': {
        const rivers = ee.FeatureCollection('WWF/HydroSHEDS/v1/FreeFlowingRivers').filterBounds(aoi);
        image = ee.Image().byte().paint({ featureCollection: rivers, color: 1, width: 2 }).clip(aoi);
        vis = { palette: ['6366f1'] };
        displayName = 'Drainage Network (HydroRIVERS)'; source = 'WWF HydroSHEDS'; dataset = 'WWF/HydroSHEDS/v1/FreeFlowingRivers'; date = '2019';
        break;
      }
      default:
        return { available: false, layerId, dataStatus: 'UNAVAILABLE', reason: `Unknown layer: ${layerId}` };
    }
    const mapId = await new Promise((resolve, reject) => {
      image.getMapId(vis, (obj, err) => err ? reject(new GeoError(classifyEEError(err), String(err), 502)) : resolve(obj));
    });
    return {
      available: true, layerId, tileUrl: mapId.urlFormat, displayName, source, dataset, date,
      dataStatus: 'AVAILABLE', visParams: vis, ...extras,
      lineage: { geometry: ref.label, geometryKey: ref.key, processedAt: new Date().toISOString() }
    };
  });
}

// ─── Saved / seeded watersheds ────────────────────────────────────
const SEEDS = [
  { name: 'Sardar Sarovar / Narmada', lat: 21.83, lon: 73.75, level: 5, river: 'Narmada', description: 'Narmada basin around the Sardar Sarovar dam (Gujarat / Madhya Pradesh).' },
  { name: 'Subarnarekha', lat: 22.80, lon: 86.20, level: 6, river: 'Subarnarekha', description: 'Eastern India basin spanning Jharkhand, West Bengal and Odisha.' },
  { name: 'Bhadar', lat: 21.75, lon: 70.62, level: 7, river: 'Bhadar', description: 'Saurashtra (Gujarat) catchment — check dams and irrigation.' },
  { name: 'Mahanadi', lat: 21.53, lon: 83.87, level: 4, river: 'Mahanadi', description: 'Mahanadi basin at Hirakud (Odisha / Chhattisgarh).' },
  { name: 'Godavari', lat: 18.00, lon: 79.55, level: 4, river: 'Godavari', description: 'Peninsular India\'s largest river basin.' },
  { name: 'Amazon', lat: -3.13, lon: -60.02, level: 3, river: 'Amazon', description: 'Amazon basin near Manaus (South America).' },
  { name: 'Congo', lat: -4.30, lon: 15.30, level: 3, river: 'Congo', description: 'Congo basin near Kinshasa (Central Africa).' }
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

/** Remove legacy rows with no recoverable geometry; seed curated watersheds with REAL HydroBASINS geometry. */
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
    if (!_eeReady) return;
    const current = await store.getAllRows('watersheds').catch(() => []);
    const have = new Set(current.filter(r => r.isDemo).map(r => r.metadata?.seedName));
    for (const s of SEEDS) {
      if (have.has(s.name)) continue;
      try {
        const r = await resolvePoint(s.lat, s.lon, { levels: [s.level] });
        const c = r.candidates[0];
        if (!c) { console.warn(`[Geo] seed ${s.name}: no basin at level ${s.level}`); continue; }
        c.country = (await countriesFor({ type: 'Point', coordinates: c.center })).join(' / ') || null;
        const rec = await recordFromContext({
          ...c, name: s.name, displayName: `${s.name} (HydroBASINS L${c.level})`, isDemo: true, isSaved: true,
          metadata: { ...c.metadata, seedName: s.name, river: s.river, description: s.description, seededFrom: { lat: s.lat, lon: s.lon, level: s.level } }
        });
        await upsertRecord(rec);
        console.log(`[Geo] seeded ${s.name} → ${rec.id} (${Math.round(rec.areaKm2)} km²)`);
      } catch (e) { console.warn(`[Geo] seed ${s.name} failed: ${e.message}`); }
    }
  })().catch(e => console.warn('[Geo] ensureSeeds error', e.message)).finally(() => { /* allow manual re-run */ });
  return seeding;
}

export function newCustomId() { return `custom-${crypto.randomBytes(5).toString('hex')}`; }
