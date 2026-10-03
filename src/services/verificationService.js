/**
 * DHARAWATCH — Verification Client Service
 *
 * Frontend service for the Evidence-Driven Field Verification Planner.
 * Calls backend verification API endpoints.
 */

const API = '/api';

async function safeFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json;
}

/**
 * Run evidence-gap analysis for a watershed.
 * Returns verification candidates with priority scores.
 */
export async function analyzeWatershedEvidence({
  watershedId,
  priorityFilter = 'ALL',
  origin = null,
  maxStops = 6,
  fieldWindowMinutes = 300,
  signal
}) {
  return safeFetch(`${API}/mission/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ watershedId, priorityFilter, origin, maxStops, fieldWindowMinutes }),
    signal
  });
}

/**
 * Update field evidence for an intervention and recalculate priority.
 */
export async function updateFieldEvidence({ interventionId, photoCount, latestPhotoDate, notes }) {
  return safeFetch(`${API}/mission/update-evidence`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ interventionId, photoCount, latestPhotoDate, notes })
  });
}

// ─── Evidence status helpers ──────────────────────────────────────────────────

export const EVIDENCE_STATUS_CONFIG = {
  VERIFIED: { color: '#10b981', bg: 'rgba(16,185,129,0.12)', label: 'VERIFIED', dot: '#10b981' },
  NEEDS_UPDATE: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'NEEDS UPDATE', dot: '#f59e0b' },
  INCONSISTENT: { color: '#f97316', bg: 'rgba(249,115,22,0.12)', label: 'INCONSISTENT', dot: '#f97316' },
  HIGH_PRIORITY: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', label: 'HIGH PRIORITY', dot: '#ef4444' },
  NO_DATA: { color: '#6b7280', bg: 'rgba(107,114,128,0.12)', label: 'NO DATA', dot: '#6b7280' }
};

export function getEvidenceStatusConfig(status) {
  return EVIDENCE_STATUS_CONFIG[status] || EVIDENCE_STATUS_CONFIG.NO_DATA;
}

export const PRIORITY_FILTER_OPTIONS = [
  { value: 'ALL', label: 'All Sites' },
  { value: 'HIGH_PRIORITY', label: 'High Priority' },
  { value: 'EVIDENCE_GAP', label: 'Evidence Gap' },
  { value: 'SATELLITE_ANOMALY', label: 'Satellite Anomaly' },
  { value: 'NEEDS_UPDATE', label: 'Needs Update' },
  { value: 'INCONSISTENT', label: 'Field/Satellite Inconsistency' }
];

export const FIELD_WINDOW_OPTIONS = [
  { label: '2 HOURS', minutes: 120 },
  { label: '4 HOURS', minutes: 240 },
  { label: '5 HOURS', minutes: 300 },
  { label: '8 HOURS', minutes: 480 },
  { label: 'FULL DAY', minutes: 720 }
];

export const MAX_STOPS_OPTIONS = [3, 5, 6, 8, 10];

export const TRANSIT_OPTIONS = [
  { label: 'Vehicle + Walking', value: 'DRIVING_WALKING' },
  { label: 'Vehicle Only', value: 'DRIVING' },
  { label: 'Walking', value: 'WALKING' }
];

// Marker color by evidence status
export function getMarkerColor(evidenceStatus, isSelected, isActive) {
  if (isActive) return { bg: '#38bdf8', border: '#fff', text: '#000' };
  if (isSelected) return { bg: '#10b981', border: '#10b981', text: '#fff' };
  const map = {
    HIGH_PRIORITY: { bg: '#ef4444', border: '#ef4444', text: '#fff' },
    INCONSISTENT: { bg: '#f97316', border: '#f97316', text: '#fff' },
    NEEDS_UPDATE: { bg: '#f59e0b', border: '#f59e0b', text: '#000' },
    VERIFIED: { bg: '#10b981', border: '#10b981', text: '#000' },
    NO_DATA: { bg: '#6b7280', border: '#6b7280', text: '#fff' }
  };
  return map[evidenceStatus] || map.NO_DATA;
}
