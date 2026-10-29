import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, CheckCircle2, AlertTriangle, RefreshCw, Trash2, ExternalLink } from 'lucide-react';
import AppNavigation from '../../components/AppNavigation';
import { settingsService, DEFAULT_SETTINGS, BASEMAPS } from '../../services/settingsService';
import { listSaved, deleteSaved } from '../../services/watershedClient';
import './Settings.css';

const TABS = ['Profile', 'Map', 'Saved Watersheds', 'System'];

// Browser-side caches this app writes; cleared by "Clear local data".
const LOCAL_KEYS = ['dharawatch_settings', 'dharawatch_selectedFeature', 'satquery_ai_mode', 'drishtiWatchCopilotPosition'];

async function probe(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.ok !== false) return { state: 'ok', detail: null };
    return { state: 'down', detail: json?.error?.message || json?.error || `HTTP ${res.status}` };
  } catch (e) {
    return { state: 'down', detail: e.name === 'TimeoutError' ? 'No response after 20 s' : e.message };
  }
}

export default function Settings() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('Profile');
  const [settings, setSettings] = useState(() => settingsService.getLocal());
  const [saveStatus, setSaveStatus] = useState({ tone: 'ok', text: 'Loading settings…' });
  const saveTimer = useRef(null);

  const [saved, setSaved] = useState({ status: 'idle', items: [], error: null });
  const [health, setHealth] = useState({ api: null, earthEngine: null, checking: false });

  useEffect(() => {
    settingsService.get().then(({ settings: s, synced }) => {
      setSettings(s);
      setSaveStatus(synced
        ? { tone: 'ok', text: 'Settings synced with server' }
        : { tone: 'warn', text: 'Server unreachable — using settings stored in this browser' });
    });
  }, []);

  const persist = useCallback((next) => {
    setSaveStatus({ tone: 'ok', text: 'Saving…' });
    clearTimeout(saveTimer.current);
    // debounce so typing in text fields doesn't post on every keystroke
    saveTimer.current = setTimeout(async () => {
      const ok = await settingsService.update(next);
      setSaveStatus(ok
        ? { tone: 'ok', text: 'All changes saved' }
        : { tone: 'warn', text: 'Saved in this browser only — server unreachable' });
    }, 400);
  }, []);

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const updateSetting = (key, value) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    persist(next);
  };

  const loadSaved = useCallback(() => {
    setSaved((s) => ({ ...s, status: 'loading', error: null }));
    listSaved()
      .then((items) => setSaved({ status: 'done', items, error: null }))
      .catch((e) => setSaved({ status: 'error', items: [], error: e.message }));
  }, []);

  const checkHealth = useCallback(async () => {
    setHealth((h) => ({ ...h, checking: true }));
    const [api, earthEngine] = await Promise.all([probe('/api/health'), probe('/api/earth-engine/health')]);
    setHealth({ api, earthEngine, checking: false });
  }, []);

  useEffect(() => {
    if (activeTab === 'Saved Watersheds' && saved.status === 'idle') loadSaved();
    if (activeTab === 'System' && !health.api && !health.checking) checkHealth();
  }, [activeTab, saved.status, health.api, health.checking, loadSaved, checkHealth]);

  const removeSaved = async (item) => {
    if (!window.confirm(`Delete saved watershed "${item.name}"? This cannot be undone.`)) return;
    try {
      await deleteSaved(item.id);
      setSaved((s) => ({ ...s, items: s.items.filter((i) => i.id !== item.id) }));
    } catch (e) {
      window.alert(`Could not delete: ${e.message}`);
    }
  };

  const resetDefaults = () => {
    if (!window.confirm('Reset all settings to their defaults?')) return;
    setSettings({ ...DEFAULT_SETTINGS });
    persist({ ...DEFAULT_SETTINGS });
  };

  const exportConfig = () => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dharawatch-settings.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearLocalData = () => {
    if (!window.confirm('Clear settings and cached workspace state stored in this browser? Saved watersheds and evidence on the server are not affected.')) return;
    try { LOCAL_KEYS.forEach((k) => localStorage.removeItem(k)); } catch (_) { /* storage unavailable */ }
    setSettings({ ...DEFAULT_SETTINGS });
    setSaveStatus({ tone: 'ok', text: 'Local browser data cleared' });
  };

  const numberSetting = (key) => (e) => {
    const v = e.target.value;
    // keep the raw string while editing; sanitize() rejects out-of-range values on save
    updateSetting(key, v === '' ? '' : Number(v));
  };

  const statusRow = (label, desc, result) => (
    <div className="settings-row">
      <div className="settings-row-content">
        <h4>{label}</h4>
        <p>{result?.state === 'down' && result.detail ? result.detail : desc}</p>
      </div>
      <div className="settings-control">
        <span className={`settings-status ${result ? result.state : 'pending'}`}>
          {!result ? 'Checking…' : result.state === 'ok' ? 'Online' : 'Unavailable'}
        </span>
      </div>
    </div>
  );

  return (
    <div className="settings-container">
      <AppNavigation />

      <div className="settings-main-content">
        <div className="settings-inner">

          <div className="text-[10px] font-mono text-accent-blue uppercase tracking-widest flex items-center gap-2 mb-4">
            PREFERENCES & ENVIRONMENT
          </div>

          <div className="settings-header">
            <h1 className="settings-title">Settings</h1>
            <p className="settings-sub">
              Workspace defaults, saved watersheds and service status.
            </p>
          </div>

          <div className="settings-tabs" role="tablist">
            {TABS.map(tab => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                className={`settings-tab ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          {activeTab === 'Profile' && (
            <div className="settings-section">
              <h3 className="settings-section-title">Profile</h3>
              <p className="settings-section-desc">How your saved reviews are attributed. Stored with your settings.</p>

              <div className="settings-row">
                <div className="settings-row-content">
                  <h4>Display Name</h4>
                  <p>Recorded as the reviewer on Evidence Reviews you save.</p>
                </div>
                <div className="settings-control">
                  <input
                    type="text"
                    className="settings-input"
                    placeholder="Your name"
                    value={settings.displayName}
                    maxLength={80}
                    onChange={(e) => updateSetting('displayName', e.target.value)}
                  />
                </div>
              </div>

              <div className="settings-row">
                <div className="settings-row-content">
                  <h4>Organization</h4>
                  <p>Team, department or agency.</p>
                </div>
                <div className="settings-control">
                  <input
                    type="text"
                    className="settings-input"
                    placeholder="Organization"
                    value={settings.organization}
                    maxLength={80}
                    onChange={(e) => updateSetting('organization', e.target.value)}
                  />
                </div>
              </div>

              <div className="settings-row">
                <div className="settings-row-content">
                  <h4>Default AI Mode</h4>
                  <p>Starting mode for Ask and the Explore copilot. Explorer gives plain-language answers; Expert adds technical detail.</p>
                </div>
                <div className="settings-control">
                  <div className="settings-theme-selector">
                    <button className={settings.aiMode === 'explorer' ? 'active' : ''} onClick={() => updateSetting('aiMode', 'explorer')}>Explorer</button>
                    <button className={settings.aiMode === 'expert' ? 'active' : ''} onClick={() => updateSetting('aiMode', 'expert')}>Expert</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Map' && (
            <div className="settings-section">
              <h3 className="settings-section-title">Map Defaults</h3>
              <p className="settings-section-desc">Applied when the Explore map opens.</p>

              <div className="settings-row">
                <div className="settings-row-content">
                  <h4>Default Basemap</h4>
                  <p>Base imagery shown on Explore. Can still be switched from the Layers panel.</p>
                </div>
                <div className="settings-control">
                  <select className="settings-select" value={settings.basemap} onChange={(e) => updateSetting('basemap', e.target.value)}>
                    {Object.entries(BASEMAPS).map(([id, b]) => <option key={id} value={id}>{b.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="settings-row">
                <div className="settings-row-content">
                  <h4>Start Location</h4>
                  <p>Latitude and longitude (WGS 84, decimal degrees) the map centers on.</p>
                </div>
                <div className="settings-control settings-control-pair">
                  <input type="number" className="settings-input" step="0.0001" min="-90" max="90" aria-label="Start latitude" value={settings.startLat} onChange={numberSetting('startLat')} />
                  <input type="number" className="settings-input" step="0.0001" min="-180" max="180" aria-label="Start longitude" value={settings.startLon} onChange={numberSetting('startLon')} />
                </div>
              </div>

              <div className="settings-row">
                <div className="settings-row-content">
                  <h4>Start Zoom</h4>
                  <p>1 = whole world, 20 = individual buildings.</p>
                </div>
                <div className="settings-control">
                  <input type="number" className="settings-input settings-input-short" min="1" max="20" step="1" value={settings.startZoom} onChange={numberSetting('startZoom')} />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Saved Watersheds' && (
            <div className="settings-section">
              <div className="settings-section-head">
                <div>
                  <h3 className="settings-section-title">Saved Watersheds</h3>
                  <p className="settings-section-desc">Watersheds and custom areas saved from the Watershed workspace.</p>
                </div>
                <button className="settings-button" onClick={() => navigate('/watershed')}>+ Add from Watershed</button>
              </div>

              {saved.status === 'loading' && <p className="settings-empty">Loading…</p>}
              {saved.status === 'error' && (
                <p className="settings-empty err">
                  Could not load saved watersheds: {saved.error}{' '}
                  <button className="settings-link" onClick={loadSaved}>Retry</button>
                </p>
              )}
              {saved.status === 'done' && saved.items.length === 0 && (
                <p className="settings-empty">Nothing saved yet. Open a watershed and use Save to keep it here.</p>
              )}
              {saved.items.map((item) => (
                <div className="settings-row" key={item.id}>
                  <div className="settings-row-content">
                    <h4>{item.name}</h4>
                    <p className="font-mono text-[10px]">
                      {item.isCustom ? 'Custom area' : `Watershed · L${item.level ?? '?'}`}
                      {Number.isFinite(item.areaKm2) ? ` · ${Math.round(item.areaKm2).toLocaleString()} km²` : ''}
                      {item.updatedAt ? ` · saved ${new Date(item.updatedAt).toLocaleDateString()}` : ''}
                    </p>
                  </div>
                  <div className="settings-control settings-control-pair">
                    <button className="settings-button" onClick={() => navigate(`/watershed?id=${encodeURIComponent(item.id)}`)}>
                      <ExternalLink size={13} /> Open
                    </button>
                    <button className="settings-button danger" onClick={() => removeSaved(item)} aria-label={`Delete ${item.name}`}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'System' && (
            <div className="settings-section">
              <div className="settings-section-head">
                <div>
                  <h3 className="settings-section-title">Service Status</h3>
                  <p className="settings-section-desc">Live checks against the backend this workspace talks to.</p>
                </div>
                <button className="settings-button" onClick={checkHealth} disabled={health.checking}>
                  <RefreshCw size={13} className={health.checking ? 'spin' : ''} /> Re-check
                </button>
              </div>

              {statusRow('API Server', 'Stores evidence, field observations and saved watersheds.', health.checking ? null : health.api)}
              {statusRow('Google Earth Engine', 'Satellite imagery, indices and watershed boundaries.', health.checking ? null : health.earthEngine)}

              <h3 className="settings-section-title settings-subsection">Local Data</h3>
              <div className="settings-row">
                <div className="settings-row-content">
                  <h4>Clear Browser Data</h4>
                  <p>Removes settings and cached workspace state kept in this browser.</p>
                </div>
                <div className="settings-control">
                  <button className="settings-button danger" onClick={clearLocalData}>Clear local data</button>
                </div>
              </div>
            </div>
          )}

          <div className="settings-footer">
            <div className={`settings-save-status ${saveStatus.tone}`}>
              {saveStatus.tone === 'ok' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />} {saveStatus.text}
            </div>
            <div className="settings-footer-actions">
              <button className="settings-link" onClick={resetDefaults}>
                Reset to defaults
              </button>
              <button className="settings-button" onClick={exportConfig}>
                <Download size={14} /> Export Configuration
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
