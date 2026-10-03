/**
 * DHARAWATCH — Watershed client.
 *
 * One transport, one contract: { ok:true, ... } | { ok:false, error:{ code, message } }.
 * Every analytic call is addressed by the ACTIVE CONTEXT object (never a bare id or a demo id):
 *   persisted contexts (hybas-…, saved-…, custom-…) are sent by id and resolved server-side,
 *   unsaved drafts (drawn areas) are sent by geometry.
 * Every request terminates: a timeout raises ApiError('TIMEOUT').
 */

const API = '/api';

export class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function call(path, { method = 'GET', body, signal, timeout = 30000 } = {}) {
  const timer = AbortSignal.timeout(timeout);
  const combined = signal ? AbortSignal.any([signal, timer]) : timer;
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      signal: combined,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (e) {
    if (signal?.aborted) throw e; // caller cancelled (context switch) — not an error to show
    if (timer.aborted) throw new ApiError('TIMEOUT', `No response after ${Math.round(timeout / 1000)} s`, 0);
    throw new ApiError('NETWORK_ERROR', `Network error: ${e.message}`, 0);
  }
  let json = null;
  try { json = await res.json(); } catch (_) { /* non-JSON */ }
  if (!res.ok || json?.ok === false) {
    const err = json?.error || {};
    throw new ApiError(err.code || `HTTP_${res.status}`, err.message || `Request failed (HTTP ${res.status})`, res.status);
  }
  return json;
}

/** True for ids the server can resolve to a stored / HydroBASINS geometry. */
export const isPersistedId = (id) => /^(hybas-|saved-|custom-)/.test(id || '');
const ref = (ctx) => (isPersistedId(ctx?.id) ? { id: ctx.id } : { geometry: ctx?.geometry });

// ── search / resolution ─────────────────────────────────────────
export async function searchGeo(q, { signal } = {}) {
  const r = await call(`/geocode/search?q=${encodeURIComponent(q)}`, { signal, timeout: 20000 });
  return { results: r.results || [], error: r.error || null, warning: r.warning || null };
}
export const resolvePoint = (lat, lon, { signal, river } = {}) => call(`/watersheds/resolve?lat=${lat}&lon=${lon}${river ? `&river=${encodeURIComponent(river)}` : ''}`, { signal, timeout: 150000 });
export const intersectGeometry = (geometry, { signal } = {}) => call('/watersheds/intersections', { method: 'POST', body: { geometry }, signal, timeout: 150000 });
export async function getContextById(id, { signal } = {}) {
  return (await call(`/watersheds/${encodeURIComponent(id)}`, { signal, timeout: 90000 })).watershed;
}

// ── demo / saved records (separate collections) ─────────────────
export async function listDemos({ signal } = {}) {
  return (await call('/watersheds/demos', { signal, timeout: 120000 })).demos || [];
}
export async function listSaved({ signal } = {}) {
  return (await call('/watersheds', { signal, timeout: 30000 })).watersheds || [];
}
export async function saveContext(ctx, name) {
  const r = await call('/watersheds', {
    method: 'POST',
    body: {
      id: ctx.id, sourceId: ctx.sourceId || (isPersistedId(ctx.id) ? ctx.id : null), name, geometry: ctx.geometry,
      source: ctx.source, level: ctx.level, parentId: ctx.parentId, sourceDataset: ctx.sourceDataset, sourceFeatureId: ctx.sourceFeatureId,
      isCustom: ctx.isCustom, country: ctx.country, metadata: ctx.metadata, technicalName: ctx.technicalName,
      naming: ctx.naming, river: ctx.river, riverSystem: ctx.riverSystem
    }
  });
  return r.watershed;
}
export const deleteSaved = (id) => call(`/watersheds/${encodeURIComponent(id)}`, { method: 'DELETE' });
export async function importGeoJSON(name, geojson) {
  return (await call('/watersheds/import', { method: 'POST', body: { name, geojson } })).watershed;
}

// ── analytics (context-addressed) ───────────────────────────────
const analysis = (path, timeout) => (ctx, { signal, refresh } = {}) =>
  call(`/analysis/${path}`, { method: 'POST', body: { ...ref(ctx), refresh: !!refresh }, signal, timeout });

export const getFingerprint = analysis('fingerprint', 150000);
export const getTimeline = analysis('timeline', 150000);
export const getTimelineIndices = analysis('timeline-indices', 180000);
export const getAttention = analysis('attention', 180000);
export const getLayerTile = (ctx, layerId, { signal, refresh } = {}) =>
  call('/analysis/layers', { method: 'POST', body: { ...ref(ctx), layerId, refresh: !!refresh }, signal, timeout: 120000 });

// ── watershed intelligence (detail panel) ───────────────────────
const ctxCall = (suffix, method, timeout) => (ctx, { signal } = {}) => isPersistedId(ctx?.id)
  ? call(`/watersheds/${encodeURIComponent(ctx.id)}/${suffix}`, { method, signal, timeout })
  : call(`/watersheds-${suffix}`, { method: 'POST', body: { geometry: ctx.geometry, name: ctx.name }, signal, timeout });

export const getIntel = ctxCall('intel', 'GET', 150000);
export const getMedia = ctxCall('media', 'GET', 60000);
export const getBrief = ctxCall('brief', 'POST', 280000);

export async function listFieldObservations({ signal } = {}) {
  const r = await call('/field', { signal, timeout: 20000 });
  return r.data || r.observations || [];
}
