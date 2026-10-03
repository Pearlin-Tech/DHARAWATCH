/**
 * DHARAWATCH — Mission Client Service
 * 
 * Client for mission CRUD operations and mission stops.
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

// ─── Missions ──────────────────────────────────────────────────────

export async function listMissions({ status, watershedId } = {}, signal) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (watershedId) params.set('watershedId', watershedId);
  return safeFetch(`${API}/missions?${params}`, { signal });
}

export async function getMission(id, signal) {
  return safeFetch(`${API}/missions/${encodeURIComponent(id)}`, { signal });
}

export async function createMission(data) {
  return safeFetch(`${API}/missions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

export async function updateMission(id, updates) {
  return safeFetch(`${API}/missions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
}

export async function deleteMission(id) {
  return safeFetch(`${API}/missions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ─── Mission Stops ─────────────────────────────────────────────────

export async function listMissionStops(missionId, signal) {
  return safeFetch(`${API}/missions/${encodeURIComponent(missionId)}/stops`, { signal });
}

export async function createMissionStop(missionId, data) {
  return safeFetch(`${API}/missions/${encodeURIComponent(missionId)}/stops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

export async function updateMissionStop(stopId, updates) {
  return safeFetch(`${API}/mission-stops/${encodeURIComponent(stopId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
}

export async function deleteMissionStop(stopId) {
  return safeFetch(`${API}/mission-stops/${encodeURIComponent(stopId)}`, { method: 'DELETE' });
}

// ─── Mission Statuses ──────────────────────────────────────────────

export const MISSION_STATUSES = [
  { value: 'PLANNED', label: 'Planned', color: '#6b7280' },
  { value: 'ACTIVE', label: 'Active', color: '#10b981' },
  { value: 'PAUSED', label: 'Paused', color: '#f59e0b' },
  { value: 'COMPLETED', label: 'Completed', color: '#38bdf8' },
  { value: 'CANCELLED', label: 'Cancelled', color: '#ef4444' }
];

export const MISSION_STOP_STATUSES = [
  { value: 'UPCOMING', label: 'Upcoming', color: '#6b7280' },
  { value: 'ACTIVE', label: 'Active', color: '#38bdf8' },
  { value: 'COMPLETED', label: 'Completed', color: '#10b981' },
  { value: 'SKIPPED', label: 'Skipped', color: '#ef4444' }
];

export const MISSION_STOP_TYPES = [
  { value: 'OBSERVATION', label: 'Field Observation', icon: '📍' },
  { value: 'INTERVENTION', label: 'Intervention Check', icon: '🏗️' },
  { value: 'SURVEY', label: 'Survey', icon: '📊' },
  { value: 'INSPECTION', label: 'Inspection', icon: '🔍' },
  { value: 'SAMPLE', label: 'Sample Collection', icon: '🧪' },
  { value: 'OTHER', label: 'Other', icon: '📦' }
];

export function getMissionStatusInfo(status) {
  return MISSION_STATUSES.find(s => s.value === status) || { value: status, label: status, color: '#6b7280' };
}

export function getMissionStopStatusInfo(status) {
  return MISSION_STOP_STATUSES.find(s => s.value === status) || { value: status, label: status, color: '#6b7280' };
}

export function getMissionStopTypeInfo(type) {
  return MISSION_STOP_TYPES.find(t => t.value === type) || { value: type, label: type, icon: '📦' };
}