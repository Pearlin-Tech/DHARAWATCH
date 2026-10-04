/**
 * DHARAWATCH — Intervention Evidence Review client.
 * Same transport contract as watershedClient: { ok:true, ... } | { ok:false, error:{ code, message } },
 * every request terminates (TIMEOUT), callers pass an AbortSignal so context switches cancel work.
 */
import { ApiError } from './watershedClient';

async function call(path, { method = 'GET', body, signal, timeout = 30000 } = {}) {
  const timer = AbortSignal.timeout(timeout);
  const combined = signal ? AbortSignal.any([signal, timer]) : timer;
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method, signal: combined,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    if (timer.aborted) throw new ApiError('TIMEOUT', `No response after ${Math.round(timeout / 1000)} s`, 0);
    throw new ApiError('NETWORK_ERROR', `Network error: ${e.message}`, 0);
  }
  let json = null;
  try { json = await res.json(); } catch (_) { /* non-JSON */ }
  if (!res.ok || json?.ok === false || json?.success === false) {
    const err = json?.error || {};
    throw new ApiError(err.code || `HTTP_${res.status}`, err.message || `Request failed (HTTP ${res.status})`, res.status);
  }
  return json;
}

const enc = encodeURIComponent;

/** Intervention record + linked/nearby field evidence (no Earth Engine). */
export const getReview = (id, { signal } = {}) => call(`/evidence-review/${enc(id)}`, { signal, timeout: 20000 });

export const runSatellite = (id, { baselineDate, currentDate, bufferM }, { signal } = {}) =>
  call(`/evidence-review/${enc(id)}/satellite`, { method: 'POST', body: { baselineDate, currentDate, bufferM }, signal, timeout: 150000 })
    .then((r) => r.satellite);

export const getTerrain = (id, { bufferM }, { signal } = {}) =>
  call(`/evidence-review/${enc(id)}/terrain?bufferM=${bufferM}`, { signal, timeout: 120000 }).then((r) => r.terrain);

export const getEvidenceBrief = (id, { baselineDate, currentDate, bufferM }, { signal } = {}) =>
  call(`/evidence-review/${enc(id)}/brief`, { method: 'POST', body: { baselineDate, currentDate, bufferM }, signal, timeout: 280000 })
    .then((r) => r.brief);

/** The review outcome lives on the intervention record itself — one intervention, one evidence record. */
export const saveReviewOutcome = (id, evidenceReview) =>
  call(`/interventions/${enc(id)}`, { method: 'PATCH', body: { evidenceReview } }).then((r) => r.data);

/** Canonical selected-intervention object — every part of the page derives from this shape. */
export function toInterventionContext(iv) {
  if (!iv) return null;
  return {
    id: iv.id,
    watershedId: iv.watershedId,
    name: iv.name,
    type: iv.type,
    status: iv.status,
    geometry: iv.geometry || null,
    latitude: Number(iv.coordinates?.lat),
    longitude: Number(iv.coordinates?.lng),
    createdAt: iv.createdAt || null,
    metadata: {
      constructionDate: iv.constructionDate || null,
      notes: iv.notes || '',
      inspections: iv.inspections || [],
      linkedMissionId: iv.linkedMissionId || null,
      evidenceReview: iv.evidenceReview || null,
      updatedAt: iv.updatedAt || null
    }
  };
}

/** Error → section state (LOADING / AVAILABLE / NO_DATA / ERROR / TIMEOUT). */
export const errorState = (e) => ({ status: e?.code === 'TIMEOUT' ? 'TIMEOUT' : 'ERROR', error: e?.message || String(e), code: e?.code || null });
