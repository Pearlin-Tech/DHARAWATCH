import { api } from './api';

const LOCAL_KEY = 'dharawatch_settings';
// Ask/Explore copilot already persist their mode under this key — settings write through to it.
const AI_MODE_KEY = 'satquery_ai_mode';

export const BASEMAPS = {
  satellite: { label: 'Satellite', tiles: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}' },
  hybrid: { label: 'Satellite + labels', tiles: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}' },
  terrain: { label: 'Terrain', tiles: 'https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}' },
  streets: { label: 'Streets', tiles: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}' }
};

export const DEFAULT_SETTINGS = {
  displayName: '',
  organization: '',
  basemap: 'satellite',
  startLat: 23.0225,
  startLon: 72.5714,
  startZoom: 12,
  aiMode: 'explorer'
};

const sanitize = (raw) => {
  const s = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return s;
  if (typeof raw.displayName === 'string') s.displayName = raw.displayName.slice(0, 80);
  if (typeof raw.organization === 'string') s.organization = raw.organization.slice(0, 80);
  if (BASEMAPS[raw.basemap]) s.basemap = raw.basemap;
  const lat = Number(raw.startLat), lon = Number(raw.startLon), zoom = Number(raw.startZoom);
  if (Number.isFinite(lat) && Math.abs(lat) <= 90) s.startLat = lat;
  if (Number.isFinite(lon) && Math.abs(lon) <= 180) s.startLon = lon;
  if (Number.isFinite(zoom) && zoom >= 1 && zoom <= 20) s.startZoom = zoom;
  if (raw.aiMode === 'explorer' || raw.aiMode === 'expert') s.aiMode = raw.aiMode;
  return s;
};

const writeLocal = (s) => {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(s));
    localStorage.setItem(AI_MODE_KEY, s.aiMode);
  } catch (_) { /* storage unavailable */ }
};

export const settingsService = {
  /** Synchronous read for page bootstrap (map init etc.). */
  getLocal: () => {
    try {
      const s = sanitize(JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null'));
      const mode = localStorage.getItem(AI_MODE_KEY);
      if (mode === 'explorer' || mode === 'expert') s.aiMode = mode;
      return s;
    } catch (_) {
      return { ...DEFAULT_SETTINGS };
    }
  },

  /** Backend copy wins when present; falls back to the local mirror. */
  get: async () => {
    try {
      const data = await api.get('/settings');
      if (data && Object.keys(data).length > 0) {
        const s = sanitize(data);
        writeLocal(s);
        return { settings: s, synced: true };
      }
      return { settings: settingsService.getLocal(), synced: true };
    } catch (error) {
      console.warn('Failed to load settings from server, using local copy.', error);
      return { settings: settingsService.getLocal(), synced: false };
    }
  },

  /** Always saves locally; resolves true if the backend also accepted it. */
  update: async (settings) => {
    const s = sanitize(settings);
    writeLocal(s);
    try {
      await api.post('/settings', s);
      return true;
    } catch (error) {
      console.warn('Failed to save settings to server; kept local copy.', error);
      return false;
    }
  }
};

/** "Name (Organization)" from the Profile settings, or '' when no name is set. */
export const reviewerName = () => {
  const { displayName, organization } = settingsService.getLocal();
  const name = displayName.trim();
  if (!name) return '';
  return organization.trim() ? `${name} (${organization.trim()})` : name;
};
