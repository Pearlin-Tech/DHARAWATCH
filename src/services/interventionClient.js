/**
 * DHARAWATCH — Intervention Client Service
 * Handles CRUD operations for watershed interventions.
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

export async function listInterventions({ watershedId, type, status, signal } = {}) {
  const params = new URLSearchParams();
  if (watershedId) params.set('watershedId', watershedId);
  if (type) params.set('type', type);
  if (status) params.set('status', status);
  return safeFetch(`${API}/interventions?${params}`, { signal });
}

export async function getIntervention(id, signal) {
  return safeFetch(`${API}/interventions/${encodeURIComponent(id)}`, { signal });
}

export async function createIntervention(data, signal) {
  return safeFetch(`${API}/interventions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal
  });
}

export async function updateIntervention(id, data, signal) {
  return safeFetch(`${API}/interventions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal
  });
}

export async function addInspection(interventionId, data, signal) {
  return safeFetch(`${API}/interventions/${encodeURIComponent(interventionId)}/inspections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal
  });
}

export async function deleteIntervention(id, signal) {
  return safeFetch(`${API}/interventions/${encodeURIComponent(id)}`, { method: 'DELETE', signal });
}

export const INTERVENTION_TYPES = [
  'Check Dam',
  'Farm Pond',
  'Percolation Tank',
  'Recharge Structure',
  'Contour Trench',
  'Bund',
  'Plantation',
  'Drainage Work',
  'Other'
];

export const INTERVENTION_STATUSES = [
  'PLANNED',
  'UNDER_CONSTRUCTION',
  'COMPLETED',
  'OPERATIONAL',
  'NEEDS_REPAIR',
  'DECOMMISSIONED'
];

// Helper functions for UI display
export function getInterventionTypeInfo(type) {
  const typeIcons = {
    'Check Dam': 'Hammer',
    'Farm Pond': 'Wrench',
    'Percolation Tank': 'Wrench',
    'Recharge Structure': 'Wrench',
    'Contour Trench': 'Hammer',
    'Bund': 'Hammer',
    'Plantation': 'FilePlus',
    'Drainage Work': 'Wrench',
    'Other': 'Hammer'
  };
  return {
    iconName: typeIcons[type] || 'Hammer',
    color: '#38bdf8'
  };
}

export function getInterventionStatusInfo(status) {
  const statusConfig = {
    'PLANNED': { label: 'Planned', color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
    'UNDER_CONSTRUCTION': { label: 'Under Construction', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
    'COMPLETED': { label: 'Completed', color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
    'OPERATIONAL': { label: 'Operational', color: '#38bdf8', bg: 'rgba(56,189,248,0.1)' },
    'NEEDS_REPAIR': { label: 'Needs Repair', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
    'DECOMMISSIONED': { label: 'Decommissioned', color: '#6b7280', bg: 'rgba(107,114,128,0.1)' }
  };
  return statusConfig[status] || { label: status, color: '#6b7280', bg: 'rgba(107,114,128,0.1)' };
}