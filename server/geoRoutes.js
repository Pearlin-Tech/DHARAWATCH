/**
 * DHARAWATCH — Geospatial / Watershed HTTP routes
 *
 * Contract:  success → { ok:true, ... }   failure → { ok:false, error:{ code, message } }
 * Codes: NO_WATERSHED_FOUND, GEOCODE_FAILED, INVALID_GEOMETRY, NO_IMAGERY, EE_UNAVAILABLE,
 *        DATASET_UNAVAILABLE, ANALYSIS_FAILED
 */
import { searchPlaces, reverseGeocode } from './geocoder.js';
import {
  GeoError, resolvePoint, intersectPolygon, countriesFor, getBasinById,
  computeFingerprint, computeTimeline, computeAttention, computeLayerTile, listLayers,
  recordFromContext, upsertRecord, newCustomId, ensureSeeds, isEEReady, invalidateKey, geometryRef
} from './geospatial.js';
import { validateGeometry, geometryMetrics } from '../src/shared/geo.js';

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
        .filter(r => r.isSaved !== false && r.geometry && ((r.name || '').toLowerCase().includes(ql) || (r.metadata?.river || '').toLowerCase().includes(ql)))
        .map(r => ({
          id: r.id, name: r.name, displayName: `${r.name} — saved watershed`, type: 'WATERSHED', source: 'saved',
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
      const r = await resolvePoint(lat, lon);
      if (!r.candidates.length) {
        return res.status(404).json({ ok: false, error: { code: 'NO_WATERSHED_FOUND', message: 'No HydroSHEDS watershed intersects the requested location.' }, location: { lat, lon } });
      }
      const countries = await countriesFor({ type: 'Point', coordinates: [lon, lat] });
      res.json({
        ok: true, location: { lat, lon, countries },
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
      res.json({
        ok: true,
        drawn: { ...r.drawn, countries },
        candidates: r.candidates,
        recommendedId: r.recommendedId || null,
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
      const items = rows.filter(r => r.isSaved !== false && r.geometry).map(stripGeom)
        .sort((a, b) => (b.isDemo === a.isDemo ? String(a.name).localeCompare(String(b.name)) : (b.isDemo ? 1 : -1)));
      res.json({ ok: true, watersheds: items });
    } catch (e) { fail(res, e); }
  });

  app.post('/api/watersheds', async (req, res) => {
    try {
      const b = req.body || {};
      const v = validateGeometry(b.geometry);
      if (!v.ok) return bad(res, 'INVALID_GEOMETRY', v.message);
      if (!b.name || !String(b.name).trim()) return bad(res, 'INVALID_GEOMETRY', 'name is required');
      const isCustom = !!b.isCustom || !b.id || !/^hybas-/.test(b.id);
      const id = b.id && /^(hybas-|custom-)/.test(b.id) ? b.id : newCustomId();
      const rec = await recordFromContext({
        id, name: String(b.name).trim(), displayName: String(b.name).trim(),
        source: isCustom ? 'user' : (b.source || 'hydrosheds'), type: isCustom ? 'custom-area' : 'watershed',
        level: b.level ?? null, parentId: b.parentId ?? null, geometry: v.geometry,
        sourceDataset: b.sourceDataset ?? null, sourceFeatureId: b.sourceFeatureId ?? null,
        isCustom, isSaved: b.isSaved !== false, metadata: b.metadata || {}, country: b.country ?? null
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
