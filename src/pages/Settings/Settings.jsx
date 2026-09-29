import React, { useState, useEffect } from 'react';
import { Download, CheckCircle2 } from 'lucide-react';
import AppNavigation from '../../components/AppNavigation';
import { settingsService } from '../../services/settingsService';
import './Settings.css';

export default function Settings() {
  const [activeTab, setActiveTab] = useState('Profile');
  const tabs = ['Profile', 'Map', 'Notifications', 'Saved Locations', 'Field Mode', 'Appearance'];

  const [settings, setSettings] = useState({
    autoFetchHighRes: true,
    elevationContour: false,
    surfaceAlerts: true,
    passPredictions: true,
    auditLogs: true,
    lowBandwidth: false,
    highContrast: false,
    monoFont: true,
    theme: 'Dark (Default)',
    accent: 'Electric Cyan'
  });
  
  const [saveStatus, setSaveStatus] = useState('All changes auto-saved to local backend');

  useEffect(() => {
    settingsService.get().then(data => {
      if (data) setSettings(data);
    });
  }, []);

  const saveSettings = async (newSettings) => {
    setSaveStatus('Saving to backend...');
    try {
      await settingsService.update(newSettings);
      setSaveStatus('All changes auto-saved to local backend');
    } catch (e) {
      setSaveStatus('Failed to save to backend');
    }
  };

  const toggleSetting = (key) => {
    const newSettings = { ...settings, [key]: !settings[key] };
    setSettings(newSettings);
    saveSettings(newSettings);
  };
  
  const updateSetting = (key, value) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    saveSettings(newSettings);
  };

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
              Manage your analyst account, geospatial map defaults, notifications, and field display behavior.
            </p>
          </div>

          <div className="settings-tabs">
            {tabs.map(tab => (
              <div 
                key={tab} 
                className={`settings-tab ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </div>
            ))}
          </div>

          {activeTab === 'Profile' && (
            <div className="settings-section">
              <h3 className="settings-section-title">Profile & Credentials</h3>
              <p className="settings-section-desc">Personal operational identity and authentication credentials.</p>
              
              <div className="settings-row">
                <div className="settings-row-content">
                  <h4>Full Name</h4>
                  <p>Your identity as logged in orbital access logs.</p>
                </div>
                <div className="settings-control">
                  <input type="text" className="settings-input" defaultValue="Elena Rostova" />
                </div>
              </div>

              <div className="settings-row">
                <div className="settings-row-content">
                  <h4>Call Sign / Operator ID</h4>
                  <p>Tactical deployment unit and operational clearance.</p>
                </div>
                <div className="settings-control">
                  <div className="text-[10px] font-mono bg-white/5 border border-white/10 px-3 py-2 rounded text-gray-dim uppercase">
                    OP-8841 · Rhone Field Team
                  </div>
                </div>
              </div>

              <div className="settings-row">
                <div className="settings-row-content">
                  <h4>Work Email</h4>
                  <p>Destination for telemetry digests and security dispatches.</p>
                </div>
                <div className="settings-control">
                  <input type="text" className="settings-input" defaultValue="elena.rostova@orbital-intelligence.eu" />
                </div>
              </div>

              <div className="settings-row">
                <div className="settings-row-content">
                  <h4>Security Key & Two-Factor</h4>
                  <p>Hardware FIDO2 Security Key enrolled.</p>
                </div>
                <div className="settings-control">
                  <button className="settings-button">Update Key</button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Map' && (
            <div className="settings-section">
              <h3 className="settings-section-title">Map & Sensor Defaults</h3>
              <p className="settings-section-desc">Coordinate baselines and multi-spectral sensor pipeline behaviors.</p>
              
              <div className="settings-row">
                <div className="settings-row-content">
                  <h4>Default Map Style</h4>
                  <p>Initial basemap rendering engine on session bootstrap.</p>
                </div>
                <div className="settings-control">
                  <select className="settings-select">
                    <option>Multispectral Dark (Sentinel-2 Native)</option>
                    <option>Optical True Color</option>
                    <option>High Contrast Vector</option>
                  </select>
                </div>
              </div>

              <div className="settings-row">
                <div className="settings-row-content">
                  <h4>Default Coordinate System</h4>
                  <p>Global spatial reference system for cursor readout and AOIs.</p>
                </div>
                <div className="settings-control">
                  <select className="settings-select">
                    <option>WGS 84 / UTM Projected (Automatic)</option>
                    <option>WGS 84 (EPSG:4326)</option>
                    <option>Web Mercator (EPSG:3857)</option>
                  </select>
                </div>
              </div>

              <div className="settings-row">
                <div className="settings-row-content">
                  <h4>Auto-fetch High Resolution Imagery</h4>
                  <p>Request sub-50cm commercial tiles upon zoom depths &gt; 16.</p>
                </div>
                <div className="settings-control">
                  <div className={`settings-toggle ${settings.autoFetchHighRes ? 'active' : ''}`} onClick={() => toggleSetting('autoFetchHighRes')}>
                    <div className="settings-toggle-thumb"></div>
                  </div>
                </div>
              </div>
              
              <div className="settings-row">
                <div className="settings-row-content">
                  <h4>Elevation Contour Overlay</h4>
                  <p>Render SRTM/Copernicus DEM 10m topographic index vectors.</p>
                </div>
                <div className="settings-control">
                  <div className={`settings-toggle ${settings.elevationContour ? 'active' : ''}`} onClick={() => toggleSetting('elevationContour')}>
                    <div className="settings-toggle-thumb"></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Notifications' && (
            <div className="settings-section">
              <h3 className="settings-section-title">Notifications & Alert Triggers</h3>
              <p className="settings-section-desc">Automated alarms for sensor anomalies, pass-bys, and vector deltas.</p>
              
              <div className="settings-row">
                <div className="settings-row-content">
                  <h4>Surface Change Alerts</h4>
                  <p>Immediate notification when a watched envelope breaches threshold.</p>
                </div>
                <div className="settings-control">
                  <div className={`settings-toggle ${settings.surfaceAlerts ? 'active' : ''}`} onClick={() => toggleSetting('surfaceAlerts')}>
                    <div className="settings-toggle-thumb"></div>
                  </div>
                </div>
              </div>
              
              <div className="settings-row">
                <div className="settings-row-content">
                  <h4>Satellite Pass Predictions</h4>
                  <p>Digest 2 hours prior to orbital revisit.</p>
                </div>
                <div className="settings-control">
                  <div className={`settings-toggle ${settings.passPredictions ? 'active' : ''}`} onClick={() => toggleSetting('passPredictions')}>
                    <div className="settings-toggle-thumb"></div>
                  </div>
                </div>
              </div>
              
              <div className="settings-row">
                <div className="settings-row-content">
                  <h4>Critical Audit Logs</h4>
                  <p>Security and mission-authorization events across organization nodes.</p>
                </div>
                <div className="settings-control">
                  <div className={`settings-toggle ${settings.auditLogs ? 'active' : ''}`} onClick={() => toggleSetting('auditLogs')}>
                    <div className="settings-toggle-thumb"></div>
                  </div>
                </div>
              </div>

              <div className="settings-row">
                <div className="settings-row-content">
                  <h4>Notification Delivery</h4>
                  <p>Primary routing endpoint for urgent sensor triggers.</p>
                </div>
                <div className="settings-control">
                  <select className="settings-select">
                    <option>In-app banner & secure email</option>
                    <option>In-app banner only</option>
                    <option>Secure email only</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Saved Locations' && (
            <div className="settings-section">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="settings-section-title">Saved Locations</h3>
                  <p className="settings-section-desc mb-0">Persistent areas of interest and continuous surveillance targets.</p>
                </div>
                <button className="settings-button text-accent-blue border-accent-blue/30">+ Add Location</button>
              </div>
              
              <div className="settings-row">
                <div className="settings-row-content">
                  <h4 className="flex items-center gap-2">Camargue Estuary Delta <div className="w-1.5 h-1.5 bg-success-mint rounded-full"></div></h4>
                  <p className="font-mono text-[10px]">43°32'N, 04°30'E · Primary Watch AOI</p>
                </div>
                <div className="settings-control flex items-center gap-4">
                  <span className="text-[10px] font-mono text-accent-blue">Manage (3 watches)</span>
                </div>
              </div>
              
              <div className="settings-row">
                <div className="settings-row-content">
                  <h4 className="flex items-center gap-2">Madre de Dios Basin <div className="w-1.5 h-1.5 bg-warning-amber rounded-full"></div></h4>
                  <p className="font-mono text-[10px]">12°35'S, 69°11'W · Forestry Surveillance</p>
                </div>
                <div className="settings-control flex items-center gap-4">
                  <span className="text-[10px] font-mono text-accent-blue">Manage (1 watch)</span>
                </div>
              </div>
              
              <div className="settings-row">
                <div className="settings-row-content">
                  <h4 className="flex items-center gap-2">Rotterdam Maasvlakte <div className="w-1.5 h-1.5 bg-gray rounded-full"></div></h4>
                  <p className="font-mono text-[10px]">51°57'N, 04°05'E · Vessel Dwell Survey</p>
                </div>
                <div className="settings-control flex items-center gap-4">
                  <span className="text-[10px] font-mono text-accent-blue">Manage (2 watches)</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Field Mode' && (
            <div className="settings-section">
              <h3 className="settings-section-title">Field Mode & Offline Cache</h3>
              <p className="settings-section-desc">Tactical mobile deployment, degraded link handling, and outdoor display overrides.</p>
              
              <div className="settings-row">
                <div className="settings-row-content">
                  <h4>Low-Bandwidth Mode</h4>
                  <p>Compress satellite raster tiles for degraded field connectivity.</p>
                </div>
                <div className="settings-control">
                  <div className={`settings-toggle ${settings.lowBandwidth ? 'active' : ''}`} onClick={() => toggleSetting('lowBandwidth')}>
                    <div className="settings-toggle-thumb"></div>
                  </div>
                </div>
              </div>
              
              <div className="settings-row">
                <div className="settings-row-content">
                  <h4>Offline Tile Cache</h4>
                  <p>Pre-download active AOI vectors and 10m rasters for zero-connectivity operations.</p>
                </div>
                <div className="settings-control">
                  <button className="settings-button flex items-center gap-2 text-xs font-mono">
                    <Download size={14} /> Cache 1.2 GB
                  </button>
                </div>
              </div>
              
              <div className="settings-row">
                <div className="settings-row-content">
                  <h4>High-Contrast Sunlight Visibility</h4>
                  <p>Invert vector strokes and enhance contrast for direct outdoor sun.</p>
                </div>
                <div className="settings-control">
                  <div className={`settings-toggle ${settings.highContrast ? 'active' : ''}`} onClick={() => toggleSetting('highContrast')}>
                    <div className="settings-toggle-thumb"></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Appearance' && (
            <div className="settings-section">
              <h3 className="settings-section-title">Appearance</h3>
              <p className="settings-section-desc">Ergonomic adjustments for dark control rooms and high-density typography.</p>
              
              <div className="settings-row">
                <div className="settings-row-content">
                  <h4>Theme Interface</h4>
                  <p>Visual tone calibration across workspace canvases.</p>
                </div>
                <div className="settings-control">
                  <div className="settings-theme-selector">
                    <button className={settings.theme === 'Dark (Default)' ? 'active' : ''} onClick={() => updateSetting('theme', 'Dark (Default)')}>Dark (Default)</button>
                    <button className={settings.theme === 'OLED Obsidian' ? 'active' : ''} onClick={() => updateSetting('theme', 'OLED Obsidian')}>OLED Obsidian</button>
                    <button className={settings.theme === 'System' ? 'active' : ''} onClick={() => updateSetting('theme', 'System')}>System</button>
                  </div>
                </div>
              </div>
              
              <div className="settings-row">
                <div className="settings-row-content">
                  <h4>Accent Color</h4>
                  <p>Focus reticle, highlight vectors, and interactive element tint.</p>
                </div>
                <div className="settings-control">
                  <div className="settings-color-selector">
                    <div className={`color-option ${settings.accent === 'Electric Cyan' ? 'active' : ''}`} onClick={() => updateSetting('accent', 'Electric Cyan')}>
                      <div className="color-circle" style={{ backgroundColor: '#2563eb' }}></div> Electric Cyan
                    </div>
                    <div className={`color-option ${settings.accent === 'Emerald' ? 'active' : ''}`} onClick={() => updateSetting('accent', 'Emerald')}>
                      <div className="color-circle" style={{ backgroundColor: '#4ade80' }}></div> Emerald
                    </div>
                    <div className={`color-option ${settings.accent === 'Amber' ? 'active' : ''}`} onClick={() => updateSetting('accent', 'Amber')}>
                      <div className="color-circle" style={{ backgroundColor: '#f59e0b' }}></div> Amber
                    </div>
                  </div>
                </div>
              </div>

              <div className="settings-row">
                <div className="settings-row-content">
                  <h4>Monospace Font Rendering</h4>
                  <p>Use Space Grotesk / JetBrains Mono for coordinates and timestamps.</p>
                </div>
                <div className="settings-control">
                  <div className={`settings-toggle ${settings.monoFont ? 'active' : ''}`} onClick={() => toggleSetting('monoFont')}>
                    <div className="settings-toggle-thumb"></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="settings-footer">
            <div className="flex items-center gap-2 text-[10px] font-mono text-success-mint">
              <CheckCircle2 size={14} /> {saveStatus}
            </div>
            <div className="flex items-center gap-6">
              <button className="text-[10px] font-mono text-gray hover:text-white transition-colors">
                Reset to defaults
              </button>
              <button className="px-4 py-2 bg-transparent hover:bg-white/5 border border-white/10 rounded-lg text-xs text-white flex items-center gap-2 transition-colors">
                <Download size={14} /> Export Configuration
              </button>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
