/**
 * DHARAWATCH — Geospatial / Watershed HTTP routes
 *
 * Contract:  success → { ok:true, ... }   failure → { ok:false, error:{ code, message } }
 * Codes: NO_WATERSHED_FOUND, GEOCODE_FAILED, INVALID_GEOMETRY, NO_IMAGERY, EE_UNAVAILABLE,
 *        DATASET_UNAVAILABLE, ANALYSIS_FAILED
 */
import { searchPlaces, reverseGeocode } from './geocoder.js';
import {
  GeoError, resolvePoint, riverAnchor, intersectPolygon, countriesFor, getBasinById,
  computeFingerprint, computeTimeline, computeTimelineIndices, computeAttention, computeLayerTile, listLayers,
  recordFromContext, upsertRecord, newCustomId, ensureSeeds, isEEReady, invalidateKey, geometryRef
} from './geospatial.js';
import { validateGeometry, geometryMetrics } from '../src/shared/geo.js';
import { getIntel, getMedia, getBrief } from './watershedIntel.js';

const fail = (res, e, fallbackCode = 'ANALYSIS_FAILED') => {
  const code = e instanceof GeoError ? e.code : fallbackCode;
  const status = e instanceof GeoError ? e.status : 500;
  if (status >= 500) console.error(`[Geo Route] ${code}:`, e.message);
  return res.status(status).json({ ok: false, error: { code, message: e.message } });
};
const bad = (res, code, message, status = 400) => res.status(status).json({ ok: false, error: { code, message } });
const stripGeom = ({ geometry, ...rest }) => rest;

export function registerGeoRoutes(app, store) {
  // ── geocoding / search ────────────────────────────────────────
  const searchHandler = async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      if (q.length < 2) return res.json({ ok: true, query: q, results: [] });
      const { results, error } = await searchPlaces(q);
      // Saved / seeded watersheds that actually match the text (real stored geometry; never a fallback)
      const ql = q.toLowerCase();
      const rows = await store.getAllRows('watersheds').catch(() => []);
      const saved = rows
        .filter(r => (r.isDemo || r.isSaved !== false) && r.geometry && [r.name, r.metadata?.river, r.metadata?.demoLabel, r.metadata?.feature].some(t => (t || '').toLowerCase().includes(ql)))
        .map(r => ({
          id: r.id, name: r.name, displayName: `${r.name} — ${r.isDemo ? 'curated example' : 'saved watershed'}`, type: 'WATERSHED', source: r.isDemo ? 'demo' : 'saved',
          lat: r.center?.[1], lon: r.center?.[0], center: r.center, bbox: r.bbox, areaKm2: r.areaKm2, level: r.level,
          country: r.country, confidence: 1, contextId: r.id
        }));
      const all = [...saved, ...(results || [])];
      if (!all.length) {
        return res.json({ ok: true, query: q, results: [], error: error ? { code: 'GEOCODE_FAILED', message: error } : { code: 'NO_RESULT', message: `No place matched "${q}".` } });
      }
      res.json({ ok: true, query: q, results: all, warning: error || undefined });
    } catch (e) { fail(res, e, 'GEOCODE_FAILED'); }
  };
  app.get('/api/geocode/search', searchHandler);
  app.get('/api/geospatial/search', searchHandler);

  app.get('/api/geocode/reverse', async (req, res) => {
    const lat = parseFloat(req.query.lat), lon = parseFloat(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return bad(res, 'INVALID_GEOMETRY', 'lat and lon required');
    const displayName = await reverseGeocode(lat, lon);
    res.json({ ok: true, displayName, lat, lon });
  });

  // ── watershed resolution ──────────────────────────────────────
  const resolveHandler = async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat), lon = parseFloat(req.query.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
        return bad(res, 'INVALID_GEOMETRY', 'lat and lon are required numbers within range');
      let r = await resolvePoint(lat, lon);
      let anchor = null;
      if (!r.candidates.length && req.query.river) {
        // e.g. a river's reference point at its estuary: anchor to the same-named HydroSHEDS reach (≤50 km)
        anchor = await riverAnchor(lat, lon, String(req.query.river), 50).catch(() => null);
        if (anchor) r = await resolvePoint(anchor.lat, anchor.lon);
      }
      if (!r.candidates.length) {
        return res.status(404).json({ ok: false, error: { code: 'NO_WATERSHED_FOUND', message: `No HydroSHEDS watershed intersects the requested location${req.query.river ? ` and no "${req.query.river}" reach lies within 50 km` : ''}.` }, location: { lat, lon } });
      }
      const countries = await countriesFor({ type: 'Point', coordinates: [lon, lat] });
      // nearest place is context only — it is never used as the watershed name
      const displayName = await reverseGeocode(lat, lon).catch(() => null);

      res.json({
        ok: true, location: { lat, lon, countries, displayName, anchor },
        candidates: r.candidates, failedLevels: r.failedLevels,
        recommendedId: (r.candidates.find(c => c.level === 7) || r.candidates[r.candidates.length - 1]).id
      });
    } catch (e) { fail(res, e); }
  };
  app.get('/api/watersheds/resolve', resolveHandler);
  app.get('/api/geospatial/resolve', resolveHandler);

  const intersectHandler = async (req, res) => {
    try {
      const v = validateGeometry(req.body?.geometry);
      if (!v.ok) return bad(res, 'INVALID_GEOMETRY', v.message);
      const r = await intersectPolygon(v.geometry);
      const countries = await countriesFor(v.geometry);
      
      const displayName = r.drawn.centroid ? await reverseGeocode(r.drawn.centroid.lat, r.drawn.centroid.lon).catch(() => null) : null;

      res.json({
        ok: true,
        drawn: { ...r.drawn, countries, displayName },
        candidates: r.candidates,
        recommendedId: r.recommendedId || null,
        truncatedLevels: r.truncatedLevels || [], perLevelLimit: r.perLevelLimit,
        status: r.candidates.length === 0 ? 'NO_WATERSHED_FOUND' : 'FOUND'
      });
    } catch (e) { fail(res, e); }
  };
  app.post('/api/watersheds/intersections', intersectHandler);
  app.post('/api/watersheds/analyze-geometry', intersectHandler);
  app.post('/api/geospatial/analyze-region', intersectHandler);

  // ── saved / demo records ──────────────────────────────────────
  app.get('/api/watersheds', async (req, res) => {
    try {
      await ensureSeeds();
      const rows = await store.getAllRows('watersheds');
      // SAVED = user-saved records only. Curated demos live at /api/watersheds/demos.
      const items = rows.filter(r => !r.isDemo && r.isSaved === true && r.geometry).map(stripGeom)
        .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
      res.json({ ok: true, watersheds: items });
    } catch (e) { fail(res, e); }
  });

  app.get('/api/watersheds/demos', async (req, res) => {
    try {
      await ensureSeeds();
      const rows = await store.getAllRows('watersheds');
      const order = ['Sardar Sarovar / Narmada', 'Mahanadi', 'Subarnarekha', 'Bhadar', 'Godavari', 'Congo', 'Amazon', 'Nile'];
      const items = rows.filter(r => r.isDemo && r.geometry).map(stripGeom)
        .sort((a, b) => order.indexOf(a.metadata?.seedName) - order.indexOf(b.metadata?.seedName));
      res.json({ ok: true, demos: items, eeReady: isEEReady() });
    } catch (e) { fail(res, e); }
  });

  app.post('/api/watersheds', async (req, res) => {
    try {
      const b = req.body || {};
      const v = validateGeometry(b.geometry);
      if (!v.ok) return bad(res, 'INVALID_GEOMETRY', v.message);
      if (!b.name || !String(b.name).trim()) return bad(res, 'INVALID_GEOMETRY', 'name is required');
      const isCustom = !!b.isCustom || !/^hybas-/.test(b.sourceId || b.id || '');
      // a saved record is always its own row (saved-…), so saving a demo or HydroBASINS context never mutates it
      const existing = b.id && /^saved-/.test(b.id) ? await store.getRow('watersheds', b.id).catch(() => null) : null;
      const id = existing ? b.id : `saved-${newCustomId().slice(7)}`;
      const rec = await recordFromContext({
        id, name: String(b.name).trim(), displayName: String(b.name).trim(), sourceId: b.sourceId || (b.id && !/^saved-/.test(b.id) ? b.id : null),
        technicalName: b.technicalName ?? null, naming: b.naming ?? null, river: b.river ?? null, riverSystem: b.riverSystem ?? null,
        source: isCustom ? 'user' : (b.source || 'hydrosheds'), type: isCustom ? 'custom-area' : 'watershed',
        level: b.level ?? null, parentId: b.parentId ?? null, geometry: v.geometry,
        sourceDataset: b.sourceDataset ?? null, sourceFeatureId: b.sourceFeatureId ?? null,
        isCustom, isSaved: true, isDemo: false, metadata: b.metadata || {}, country: b.country ?? null
      });
      const saved = await upsertRecord(rec);
      res.status(201).json({ ok: true, watershed: saved });
    } catch (e) { fail(res, e); }
  });

  app.post('/api/watersheds/import', async (req, res) => {
    try {
      const { name, geojson } = req.body || {};
      let g = geojson;
      if (g?.type === 'FeatureCollection') g = g.features?.[0]?.geometry;
      else if (g?.type === 'Feature') g = g.geometry;
      const v = validateGeometry(g);
      if (!v.ok || v.geometry.type === 'Point') return bad(res, 'INVALID_GEOMETRY', v.ok ? 'Point geometry cannot define an area' : v.message);
      const rec = await recordFromContext({
        id: newCustomId(), name: name || 'Imported area', source: 'user', type: 'custom-area', geometry: v.geometry,
        isCustom: true, isSaved: true, metadata: { imported: true }
      });
      res.status(201).json({ ok: true, watershed: await upsertRecord(rec) });
    } catch (e) { fail(res, e); }
  });

  app.patch('/api/watersheds/:id', async (req, res) => {
    try {
      const row = await store.getRow('watersheds', req.params.id).catch(() => null);
      if (!row) return bad(res, 'NO_WATERSHED_FOUND', 'Record not found', 404);
      const next = { ...row, updatedAt: new Date().toISOString() };
      if (typeof req.body?.name === 'string' && req.body.name.trim()) { next.name = req.body.name.trim(); next.displayName = next.name; }
      if (typeof req.body?.isSaved === 'boolean') next.isSaved = req.body.isSaved;
      await store.updateRow('watersheds', row.id, next);
      res.json({ ok: true, watershed: next });
    } catch (e) { fail(res, e); }
  });

  app.delete('/api/watersheds/:id', async (req, res) => {
    try {
      const changes = await store.deleteRow('watersheds', req.params.id);
      if (!changes) return bad(res, 'NO_WATERSHED_FOUND', 'Record not found', 404);
      res.json({ ok: true, deleted: true });
    } catch (e) { fail(res, e); }
  });

  app.post('/api/watersheds/delineate', (req, res) =>
    bad(res, 'DATASET_UNAVAILABLE', 'Pour-point delineation is not implemented in this build.', 501));

  // ── fetch ONE context by id (hybas-… from HydroBASINS, otherwise stored record) ──
  app.get('/api/watersheds/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const row = await store.getRow('watersheds', id).catch(() => null);
      if (row?.geometry) return res.json({ ok: true, watershed: row });
      if (/^hybas-/.test(id)) {
        const ctx = await getBasinById(id);
        return res.json({ ok: true, watershed: ctx });
      }
      return bad(res, 'NO_WATERSHED_FOUND', `No watershed or analysis area with id "${id}".`, 404);
    } catch (e) { fail(res, e); }
  });

  // ── analytics (geometry-first) ────────────────────────────────
  const analysis = (fn) => async (req, res) => {
    try {
      const input = {
        id: req.params.id || req.body?.id || undefined,
        geometry: req.body?.geometry
      };
      if (req.body?.refresh || req.query?.refresh) {
        try { const r = await geometryRef(input); invalidateKey(r.key); } catch (_) { /* resolved below */ }
      }
      const data = await fn(input, req);
      res.json({ ok: true, ...data, data });
    } catch (e) { fail(res, e); }
  };
  const fp = analysis((i) => computeFingerprint(i));
  const tl = analysis((i) => computeTimeline(i));
  const at = analysis((i) => computeAttention(i));
  const ly = analysis((i, req) => computeLayerTile(i, req.body?.layerId || req.params.layerId, req.body?.startDate, req.body?.endDate));

  app.post('/api/analysis/fingerprint', fp);
  app.post('/api/analysis/timeline', tl);
  app.post('/api/analysis/attention', at);
  app.post('/api/analysis/layers', ly);
  app.post('/api/analysis/timeline-indices', analysis((i) => computeTimelineIndices(i)));

  // ── Watershed intelligence (detail panel) ───────────────────
  // Context = stored row (saved/demo/custom) → HydroBASINS feature → supplied geometry.
  async function contextFor(req) {
    const id = req.params.id && req.params.id !== 'adhoc' ? req.params.id : req.body?.id;
    if (id) {
      const row = await store.getRow('watersheds', id).catch(() => null);
      if (row?.geometry) return row;
      if (/^hybas-/.test(id)) return getBasinById(id);
    }
    const v = validateGeometry(req.body?.geometry);
    if (!v.ok) throw Object.assign(new Error(id ? `No watershed with id "${id}"` : 'id or geometry required'), { code: 'NO_WATERSHED_FOUND', status: 404 });
    const m = geometryMetrics(v.geometry);
    return { id: id || 'adhoc', name: req.body?.name || 'Custom area', geometry: v.geometry, isCustom: true, areaKm2: m.areaKm2, perimeterKm: m.perimeterKm, bbox: m.bbox, center: m.centroid ? [m.centroid.lon, m.centroid.lat] : null, metadata: {} };
  }
  const ctxRoute = (fn) => async (req, res) => {
    try {
      const ctx = await contextFor(req);
      const data = await fn(ctx, req);
      res.json({ ok: true, ...data });
    } catch (e) {
      if (e.code === 'NO_WATERSHED_FOUND' && !(e instanceof GeoError)) return bad(res, e.code, e.message, e.status || 404);
      fail(res, e);
    }
  };
  const analysisInput = (ctx) => (/^hybas-/.test(ctx.id) ? { id: ctx.id } : ctx.id && ctx.id !== 'adhoc' && !ctx.id.startsWith('custom-drawn') ? { id: ctx.id } : { geometry: ctx.geometry });
  for (const path of ['/api/watersheds/:id/intel', '/api/watersheds-intel']) {
    app.get(path, ctxRoute((ctx) => getIntel(ctx)));
    app.post(path, ctxRoute((ctx) => getIntel(ctx)));
  }
  for (const path of ['/api/watersheds/:id/media', '/api/watersheds-media']) {
    app.get(path, ctxRoute((ctx) => getMedia(ctx)));
    app.post(path, ctxRoute((ctx) => getMedia(ctx)));
  }
  for (const path of ['/api/watersheds/:id/brief', '/api/watersheds-brief']) {
    app.post(path, ctxRoute((ctx) => getBrief({ input: analysisInput(ctx), ctx, store })));
  }

  // id-addressed convenience routes (id → geometry resolved server-side)
  app.get('/api/watersheds/:id/fingerprint', fp);
  app.get('/api/watersheds/:id/timeline', tl);
  app.get('/api/watersheds/:id/attention', at);
  app.get('/api/watersheds/:id/layers/:layerId', ly);
  app.get('/api/watersheds/:id/layers', (req, res) => res.json({ ok: true, available: listLayers() }));
  app.get('/api/analysis/layers', (req, res) => res.json({ ok: true, available: listLayers() }));

  // health summary for the watershed subsystem (not a fake "all good")
  app.get('/api/watersheds-health', async (req, res) => {
    res.json({ ok: isEEReady(), earthEngine: { initialized: isEEReady() } });
  });
}
