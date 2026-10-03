/**
 * DHARAWATCH — Watershed client.
 *
 * One transport, one contract: { ok:true, ... } | { ok:false, error:{ code, message } }.
 * Every analytic call is addressed by the ACTIVE CONTEXT (id and/or geometry) — never by a demo id.
 */

const API = '/api';

export class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function call(path, { method = 'GET', body, signal } = {}) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      signal,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
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

// ── search / resolution ─────────────────────────────────────────
export async function searchGeo(q, signal) {
  const r = await call(`/geocode/search?q=${encodeURIComponent(q)}`, { signal });
  return { results: r.results || [], error: r.error || null };
}

/** All HydroBASINS levels containing a point (hierarchy). */
export function resolvePoint(lat, lon, signal) {
  return call(`/watersheds/resolve?lat=${lat}&lon=${lon}`, { signal });
}

/** All watersheds intersecting a drawn polygon (with overlap %). */
export function intersectGeometry(geometry, signal) {
  return call('/watersheds/intersections', { method: 'POST', body: { geometry }, signal });
}

export async function getContextById(id, signal) {
  return (await call(`/watersheds/${encodeURIComponent(id)}`, { signal })).watershed;
}

// ── saved / demo records ────────────────────────────────────────
export async function listSaved(signal) {
  return (await call('/watersheds', { signal })).watersheds || [];
}
export async function saveContextRecord(ctx, name) {
  const r = await call('/watersheds', {
    method: 'POST',
    body: {
      id: ctx.id, name, geometry: ctx.geometry, source: ctx.source, level: ctx.level, parentId: ctx.parentId,
      sourceDataset: ctx.sourceDataset, sourceFeatureId: ctx.sourceFeatureId, isCustom: ctx.isCustom, isSaved: true,
      country: ctx.country, metadata: ctx.metadata
    }
  });
  return r.watershed;
}
export async function createCustomArea(geometry, name) {
  const r = await call('/watersheds', { method: 'POST', body: { name, geometry, isCustom: true, isSaved: false, source: 'user' } });
  return r.watershed;
}
export async function patchContext(id, patch) {
  return (await call(`/watersheds/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch })).watershed;
}
export function deleteContext(id) {
  return call(`/watersheds/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
export async function importGeoJSON(name, geojson) {
  return (await call('/watersheds/import', { method: 'POST', body: { name, geojson } })).watershed;
}

// ── geometry-first analytics (id resolved server-side; geometry sent only when no persisted id) ──
// Only treat IDs starting with 'hybas-' or 'custom-' as reliable server-side keys.
// Wikidata (wd-*), Overpass, or geocoder IDs are NOT valid for EE analytics.
const isServerSideId = (id) => id && (id.startsWith('hybas-') || id.startsWith('custom-'));
const ref = (ctx) => {
  if (isServerSideId(ctx?.id)) return { id: ctx.id };
  if (ctx?.geometry) return { geometry: ctx.geometry };
  if (ctx?.id) return { id: ctx.id }; // last resort — let server handle error gracefully
  return {};
};


// New contract: getFingerprint(ctx, signal, refresh)
// Compat: Watershed.jsx calls getFingerprint(id, geometry, signal) — handle both
function _makeCtx(idOrCtx, geometry) {
  if (idOrCtx && typeof idOrCtx === 'object') return idOrCtx; // already a ctx
  return { id: idOrCtx || undefined, geometry: geometry || undefined };
}
export const getFingerprint = (idOrCtx, geometryOrSignal, signalOrRefresh, refresh) => {
  const isOldSig = typeof idOrCtx === 'string' || (idOrCtx === null || idOrCtx === undefined);
  if (isOldSig) {
    const ctx = _makeCtx(idOrCtx, geometryOrSignal);
    return call('/analysis/fingerprint', { method: 'POST', body: { ...ref(ctx), refresh }, signal: signalOrRefresh });
  }
  return call('/analysis/fingerprint', { method: 'POST', body: { ...ref(idOrCtx), refresh: signalOrRefresh }, signal: geometryOrSignal });
};
export const getTimeline = (idOrCtx, geometryOrSignal, signalOrRefresh, refresh) => {
  const isOldSig = typeof idOrCtx === 'string' || (idOrCtx === null || idOrCtx === undefined);
  if (isOldSig) {
    const ctx = _makeCtx(idOrCtx, geometryOrSignal);
    return call('/analysis/timeline', { method: 'POST', body: { ...ref(ctx), refresh }, signal: signalOrRefresh });
  }
  return call('/analysis/timeline', { method: 'POST', body: { ...ref(idOrCtx), refresh: signalOrRefresh }, signal: geometryOrSignal });
};
export const getAttention = (idOrCtx, geometryOrSignal, signalOrRefresh, refresh) => {
  const isOldSig = typeof idOrCtx === 'string' || (idOrCtx === null || idOrCtx === undefined);
  if (isOldSig) {
    const ctx = _makeCtx(idOrCtx, geometryOrSignal);
    return call('/analysis/attention', { method: 'POST', body: { ...ref(ctx), refresh }, signal: signalOrRefresh });
  }
  return call('/analysis/attention', { method: 'POST', body: { ...ref(idOrCtx), refresh: signalOrRefresh }, signal: geometryOrSignal });
};
export const getLayerTile = (ctx, layerId, signal, refresh) => call('/analysis/layers', { method: 'POST', body: { ...ref(ctx), layerId, refresh }, signal });

// ── compatibility aliases for Watershed.jsx (old names → new implementations) ──

/** @deprecated use listSaved() */
export async function listSavedWatersheds(signal) {
  return listSaved(signal);
}

/** @deprecated use searchGeo() */
export async function searchWatersheds(q, signal) {
  const r = await searchGeo(q, signal);
  return r.results || [];
}

/** @deprecated use searchGeo() */
export async function searchPlaces(q, signal) {
  const r = await searchGeo(q, signal);
  return r.results || [];
}

/** @deprecated use resolvePoint() — returns candidates array */
export async function resolveWatershed(lat, lon, signal) {
  const r = await resolvePoint(lat, lon, signal);
  // resolvePoint returns { watersheds: [...] } — return first candidate as context object
  const candidates = r?.watersheds || r?.candidates || [];
  if (candidates.length === 0) throw new Error('No watershed found at this location');
  // Return the best match (highest level / most specific)
  const best = candidates[candidates.length - 1];
  return { ...best, dataStatus: 'AVAILABLE' };
}

/** @deprecated use createCustomArea() */
export async function saveCustomWatershed({ name, type, geometry, source, metadata } = {}) {
  return createCustomArea(geometry, name);
}

/** @deprecated use importGeoJSON() */
export async function importWatershed({ name, geojson } = {}) {
  return importGeoJSON(name, geojson);
}

/** @deprecated use deleteContext() */
export function deleteWatershed(id) {
  return deleteContext(id);
}

/** @deprecated layers are now always WATERSHED_LAYERS from layerRegistry */
export async function getAvailableLayers(id, signal) {
  // The layer registry is the source of truth; return an empty "all available" signal
  return { available: [] };
}
