/**
 * DHARAWATCH — Watershed Client Service
 *
 * Single context contract for all watershed data.
 * All panels consume from this service — no independent state invention.
 */

const API = '/api';

async function safeFetch(url, opts = {}) {
  try {
    const res = await fetch(url, { signal: opts.signal, ...opts });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error?.message || `HTTP ${res.status}`);
    }
    const json = await res.json();
    return json.data ?? json;
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw err;
  }
}

// ─── Resolve watershed from coordinates ──────────────────────────
export async function resolveWatershed(lat, lon, signal) {
  return safeFetch(`${API}/watersheds/resolve?lat=${lat}&lon=${lon}`, { signal });
}

// ─── Search watersheds ────────────────────────────────────────────
export async function searchWatersheds(query, signal) {
  return safeFetch(`${API}/search?q=${encodeURIComponent(query)}`, { signal });
}


// ─── List saved custom watersheds ────────────────────────────────
export async function listSavedWatersheds(signal) {
  return safeFetch(`${API}/watersheds`, { signal });
}

// ─── Get watershed fingerprint ────────────────────────────────────
export async function getFingerprint(watershedId, geometry, signal) {
  const geomParam = geometry ? `&geometry=${encodeURIComponent(JSON.stringify(geometry))}` : '';
  return safeFetch(`${API}/watersheds/${encodeURIComponent(watershedId)}/fingerprint?${geomParam}`, { signal });
}

// ─── Get watershed attention ──────────────────────────────────────
export async function getAttention(watershedId, geometry, signal) {
  const geomParam = geometry ? `&geometry=${encodeURIComponent(JSON.stringify(geometry))}` : '';
  return safeFetch(`${API}/watersheds/${encodeURIComponent(watershedId)}/attention?${geomParam}`, { signal });
}

// ─── Get watershed timeline ───────────────────────────────────────
export async function getTimeline(watershedId, geometry, signal) {
  const geomParam = geometry ? `&geometry=${encodeURIComponent(JSON.stringify(geometry))}` : '';
  return safeFetch(`${API}/watersheds/${encodeURIComponent(watershedId)}/timeline?${geomParam}`, { signal });
}

// ─── Get available layers ─────────────────────────────────────────
export async function getAvailableLayers(watershedId, signal) {
  return safeFetch(`${API}/watersheds/${encodeURIComponent(watershedId)}/layers`, { signal });
}

// ─── Get EE tile URL for a layer ─────────────────────────────────
export async function getLayerTile(watershedId, layerId, geometry, startDate, endDate, signal) {
  const params = new URLSearchParams();
  if (geometry) params.set('geometry', JSON.stringify(geometry));
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  return safeFetch(
    `${API}/watersheds/${encodeURIComponent(watershedId)}/layers/${layerId}?${params}`,
    { signal }
  );
}

// ─── Save custom watershed ────────────────────────────────────────
export async function saveCustomWatershed({ name, type, geometry, source, metadata }) {
  return safeFetch(`${API}/watersheds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, type, geometry, source, metadata })
  });
}

// ─── Import GeoJSON watershed ─────────────────────────────────────
export async function importWatershed({ name, geojson }) {
  return safeFetch(`${API}/watersheds/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, geojson })
  });
}

// ─── Delete watershed ─────────────────────────────────────────────
export async function deleteWatershed(id) {
  return safeFetch(`${API}/watersheds/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
