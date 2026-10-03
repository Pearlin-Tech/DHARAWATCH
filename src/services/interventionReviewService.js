/**
 * DHARAWATCH — Intervention Evidence Review Client Service
 *
 * Provides client-side helpers to fetch watersheds, interventions,
 * multi-source evidence details, submit new field photos, and toggle review status.
 */

const API = '/api/intervention-review';

async function safeFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json;
}

export async function fetchReviewWatersheds(signal) {
  const res = await safeFetch(`${API}/watersheds`, { signal });
  return res.watersheds || [];
}

export async function fetchReviewInterventions(watershedId, signal) {
  const res = await safeFetch(`${API}/interventions?watershedId=${encodeURIComponent(watershedId)}`, { signal });
  return res.interventions || [];
}

export async function fetchInterventionDetail(id, signal) {
  const res = await safeFetch(`${API}/detail/${encodeURIComponent(id)}`, { signal });
  return res.intervention || null;
}

export async function addFieldPhoto({ interventionId, title, url, notes, photographer, type, lat, lng }) {
  const res = await safeFetch(`${API}/add-photo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ interventionId, title, url, notes, photographer, type, lat, lng })
  });
  return res;
}

export async function toggleReviewStatus({ interventionId, isReviewed, notes }) {
  const res = await safeFetch(`${API}/toggle-review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ interventionId, isReviewed, notes })
  });
  return res;
}

// ─── Evidence Status Config ───────────────────────────────────────────────────
export const EVIDENCE_STATUS_BADGES = {
  'VERIFIED': {
    label: 'VERIFIED',
    color: '#10b981',
    bg: 'rgba(16, 185, 129, 0.15)',
    border: 'rgba(16, 185, 129, 0.35)',
    dot: '#10b981'
  },
  'NEEDS UPDATE': {
    label: 'NEEDS UPDATE',
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.15)',
    border: 'rgba(245, 158, 11, 0.35)',
    dot: '#f59e0b'
  },
  'LIMITED EVIDENCE': {
    label: 'LIMITED EVIDENCE',
    color: '#38bdf8',
    bg: 'rgba(56, 189, 248, 0.15)',
    border: 'rgba(56, 189, 248, 0.35)',
    dot: '#38bdf8'
  },
  'INCONSISTENT': {
    label: 'INCONSISTENT',
    color: '#f97316',
    bg: 'rgba(249, 115, 22, 0.15)',
    border: 'rgba(249, 115, 22, 0.35)',
    dot: '#f97316'
  },
  'NO DATA': {
    label: 'NO DATA',
    color: '#9ca3af',
    bg: 'rgba(156, 163, 175, 0.15)',
    border: 'rgba(156, 163, 175, 0.35)',
    dot: '#9ca3af'
  }
};

export function getStatusBadge(status) {
  return EVIDENCE_STATUS_BADGES[status] || EVIDENCE_STATUS_BADGES['NO DATA'];
}
