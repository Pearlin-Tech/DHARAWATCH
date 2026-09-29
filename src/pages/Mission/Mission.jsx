import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import maplibregl from '../../lib/maplibre';
import { 
  Crosshair, Camera, Droplets, Clock, Target, Car,
  ArrowRight, Flag, ShieldCheck, Download, Save,
  Play, CheckCircle2, ChevronDown, Layers, MapPin, 
  ZoomIn, ZoomOut, Maximize, AlertTriangle, Check
} from 'lucide-react';
import AppNavigation from '../../components/AppNavigation';
import './Mission.css';

// -----------------------------------------------------------------------------
// DATA ADAPTER BOUNDARY
// -----------------------------------------------------------------------------
// When backend is connected, swap this fixture with the real MissionDataProvider
const MISSION_DEMO_FIXTURE = {
  isMock: true,
  candidates: [
    { id: 'C01', title: 'Chakulia North (DEMO)', desc: 'Gully headcut breach / Upstream', coords: [86.16, 22.82], reason: 'Spectral Anomaly', priority: 'HIGH', gap: 'No records in 6 mo', val: 'VALID', dist: '6.4 km' },
    { id: 'C02', title: 'Tributary 3 Check Dam (DEMO)', desc: 'Evidence gap #INT-014 / Silt build', coords: [86.18, 22.81], reason: 'Critical Ground Evidence Gap', priority: 'CRITICAL', gap: 'Zero records in 14 months', val: 'VALID', dist: '12.2 km' },
    { id: 'C03', title: 'Mid-Basin Storage (DEMO)', desc: 'Structure capacity discrepancy check', coords: [86.19, 22.79], reason: 'Siltation Discrepancy', priority: 'HIGH', gap: 'No records in 3 mo', val: 'VALID', dist: '18.0 km' },
    { id: 'C04', title: 'Lower Alluvial Plain (DEMO)', desc: 'Control baseline ground truth', coords: [86.20, 22.77], reason: 'Control Site Baseline', priority: 'MED', gap: 'Annual check due', val: 'VALID', dist: '27.0 km' },
    { id: 'C05', title: 'Eastern Embankment (DEMO)', desc: 'Vegetation clearance verification', coords: [86.15, 22.79], reason: 'Vegetation Change', priority: 'LOW', gap: 'No records in 1 mo', val: 'NEEDS REVIEW', dist: '8.1 km' },
  ],
  synthesis: {
    distance: "28.4 km",
    duration: "4h 35m"
  }
};

export default function Mission() {
  const navigate = useNavigate();
  const mapContainer = useRef(null);
  const map = useRef(null);
  const markersRef = useRef({});
  const data = MISSION_DEMO_FIXTURE;

  // Form State
  const [target, setTarget] = useState('');
  const [origin, setOrigin] = useState('');
  const [windowLimit, setWindowLimit] = useState('5.0 HOURS');
  const [budget, setBudget] = useState(6);
  const [transit, setTransit] = useState('Vehicle + Walking');
  const [formErrors, setFormErrors] = useState({});

  // Mission State
  // CONFIG -> GENERATING -> CANDIDATES -> ROUTING -> READY -> ACTIVE
  const [missionState, setMissionState] = useState('CONFIG');
  const [genProgress, setGenProgress] = useState('');

  // Candidates & Plan
  const [candidates, setCandidates] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [activeCandidateId, setActiveCandidateId] = useState(null);

  // Bottom Tabs
  const [activeTab, setActiveTab] = useState('candidate_pool');

  // Initialize Map
  useEffect(() => {
    if (!map.current && mapContainer.current) {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: {
          version: 8,
          sources: {
            satellite: {
              type: 'raster',
              tiles: ['https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'],
              tileSize: 256,
              attribution: 'Google'
            }
          },
          layers: [{ id: 'satellite-layer', type: 'raster', source: 'satellite', minzoom: 0, maxzoom: 22 }]
        },
        center: [86.18, 22.80],
        zoom: 12,
        attributionControl: false
      });
      
      map.current.on('load', () => {
        map.current.addSource('route-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.current.addLayer({
          id: 'route-layer',
          type: 'line',
          source: 'route-source',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#38bdf8', 'line-width': 3, 'line-dasharray': [2, 2] }
        });
      });
    }
  }, []);

  // Update map markers when candidates or selection changes
  useEffect(() => {
    if (!map.current) return;

    // Clear old markers
    Object.values(markersRef.current).forEach(m => m.remove());
    markersRef.current = {};

    candidates.forEach(c => {
      const isSelected = selectedIds.includes(c.id);
      const isActive = activeCandidateId === c.id;

      const el = document.createElement('div');
      el.className = 'map-marker';
      el.style.backgroundColor = isSelected ? '#10b981' : (isActive ? '#38bdf8' : '#0f172a');
      el.style.border = `2px solid ${isActive || isSelected ? '#fff' : '#38bdf8'}`;
      el.style.color = isActive || isSelected ? '#000' : '#fff';
      el.style.width = isActive ? '28px' : '24px';
      el.style.height = isActive ? '28px' : '24px';
      el.style.borderRadius = '4px';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.fontFamily = 'monospace';
      el.style.fontSize = '10px';
      el.style.fontWeight = 'bold';
      el.style.cursor = 'pointer';
      el.style.boxShadow = isActive ? '0 0 15px rgba(56,189,248,0.8)' : '0 0 10px rgba(0,0,0,0.5)';
      el.style.transition = 'all 0.2s ease';
      el.innerText = c.id.replace('C', '');

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        setActiveCandidateId(c.id);
        map.current.flyTo({ center: c.coords, zoom: 15, duration: 800 });
      });

      const marker = new maplibregl.Marker({ element: el }).setLngLat(c.coords).addTo(map.current);
      markersRef.current[c.id] = marker;
    });

  }, [candidates, selectedIds, activeCandidateId]);

  // Update route
  useEffect(() => {
    if (!map.current || !map.current.getSource('route-source')) return;
    if (missionState === 'READY' || missionState === 'ACTIVE') {
      const orderedCoords = selectedIds.map(id => candidates.find(c => c.id === id).coords);
      map.current.getSource('route-source').setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: orderedCoords }
      });
    } else {
      map.current.getSource('route-source').setData({ type: 'FeatureCollection', features: [] });
    }
  }, [selectedIds, candidates, missionState]);

  const handleGenerate = () => {
    const errs = {};
    if (!target) errs.target = true;
    if (!origin) errs.origin = true;
    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);
      return;
    }
    setFormErrors({});
    
    setMissionState('GENERATING');
    const steps = [
      'RESOLVING TARGET...',
      'QUERYING EARTH ENGINE...',
      'ANALYZING SATELLITE CHANGE...',
      'FINDING EVIDENCE GAPS...',
      'RANKING CANDIDATES...'
    ];
    let step = 0;
    setGenProgress(steps[0]);
    const intv = setInterval(() => {
      step++;
      if (step < steps.length) {
        setGenProgress(steps[step]);
      } else {
        clearInterval(intv);
        setCandidates(data.candidates);
        setMissionState('CANDIDATES');
        setActiveTab('candidate_pool');
        if (map.current) {
          map.current.flyTo({ center: [86.18, 22.80], zoom: 13, duration: 1500 });
        }
      }
    }, 800);
  };

  const handleBuildRoute = () => {
    if (selectedIds.length === 0) return;
    setMissionState('ROUTING');
    setTimeout(() => {
      setMissionState('READY');
      setActiveTab('active_plan');
      if (map.current) {
        // Fit to route bounds
        const bounds = new maplibregl.LngLatBounds();
        selectedIds.forEach(id => bounds.extend(candidates.find(c => c.id === id).coords));
        map.current.fitBounds(bounds, { padding: 80, duration: 1000 });
      }
    }, 1500);
  };

  const toggleCandidateSelection = (id) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(x => x !== id);
      } else {
        if (prev.length >= budget) {
          alert('Stop budget reached!');
          return prev;
        }
        return [...prev, id];
      }
    });
  };

  const activeCandidate = candidates.find(c => c.id === activeCandidateId);
  const isSelected = selectedIds.includes(activeCandidateId);

  // Derive mode step 1 to 5
  let activeModeNum = 1;
  if (missionState === 'GENERATING') activeModeNum = 2;
  if (missionState === 'CANDIDATES' || missionState === 'ROUTING') activeModeNum = 3;
  if (missionState === 'READY') activeModeNum = 4;
  if (missionState === 'ACTIVE') activeModeNum = 5;

  return (
    <div className="mission-container">
      <AppNavigation />
      
      <div className="mission-content">
        <div ref={mapContainer} className="mission-map-container"></div>
        <div className="mission-ui-layer">
          
          {/* Top Section */}
          <div className="mission-top-section">
            <div className="mission-header-row">
              <div className="mh-left">
                <div className="mh-brand">DHARAWATCH / FIELD / MISSION INTELLIGENCE</div>
                <div className="mh-title">
                  FIELD / MISSION INTELLIGENCE
                  <span className="mh-status-badge">
                    <span className="mh-status-dot"></span> ORBITAL GAP ANALYSIS SYNCED
                  </span>
                </div>
              </div>
              <div className="mh-right">
                <div>CONSTELLATION: <span>SENTINEL-2 / SPOT-7 / PLANET</span></div>
                <div className="mh-operator">
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: '#fff', fontWeight: 600 }}>CDR. A. VANCE</div>
                    <div>GEOINT SPEC // T1</div>
                  </div>
                  <Crosshair size={18} color="#9ca3af" />
                </div>
              </div>
            </div>

            <div className="mission-hero-row">
              <div className="mission-hero">
                <h1>PLAN THE NEXT FIELD MISSION.</h1>
                <p>
                  Turn satellite change, evidence gaps and spatial context into a focused, highly optimized 
                  field ground-truth plan.
                </p>
              </div>
              
              <div className="mission-mode-stepper">
                <div>
                  <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#9ca3af', marginBottom: 6 }}>ACTIVE MODE</div>
                  <div className="mode-steps">
                    {['TARGET', 'ANALYZE', 'PLAN', 'REVIEW', 'EXECUTE'].map((label, idx) => {
                      const step = idx + 1;
                      const active = step === activeModeNum;
                      const completed = step < activeModeNum;
                      return (
                        <div key={step} className={`mode-step ${completed ? 'completed' : ''} ${active ? 'active' : ''}`}>
                          <div className="ms-num">0{step}</div>
                          <div className="ms-dot"></div>
                          <div className="ms-label">{label}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <button className="capture-btn" onClick={() => navigate('/field')}><Camera size={14}/> CAPTURE<br/>EVIDENCE</button>
              </div>
            </div>

            <div className="mission-config-strip">
              <div className={`config-box ${formErrors.target ? 'error' : ''}`} onClick={() => setTarget('Subarnarekha Basin · MW-0842B')}>
                <div className="cb-label"><Droplets size={12}/> TARGET WATERSHED</div>
                <div className="cb-val">{target || 'SELECT TARGET'} <ChevronDown size={14} color="#9ca3af"/></div>
              </div>
              <div className={`config-box ${formErrors.origin ? 'error' : ''}`} onClick={() => setOrigin('Camp 01 (Chakulia)')}>
                <div className="cb-label"><Target size={12}/> ORIGIN BASE</div>
                <div className="cb-val">{origin || 'SELECT ORIGIN'} <ChevronDown size={14} color="#9ca3af"/></div>
              </div>
              <div className="config-box">
                <div className="cb-label"><Clock size={12}/> FIELD WINDOW</div>
                <div className="cb-val">{windowLimit} <ChevronDown size={14} color="#9ca3af"/></div>
              </div>
              <div className="config-box">
                <div className="cb-label"><Layers size={12}/> BUDGET STOPS</div>
                <div className="cb-val">{budget} STOPS MAX <ChevronDown size={14} color="#9ca3af"/></div>
              </div>
              <div className="config-box">
                <div className="cb-label"><Car size={12}/> TRANSIT TYPE</div>
                <div className="cb-val">{transit} <ChevronDown size={14} color="#9ca3af"/></div>
              </div>

              {missionState === 'CONFIG' && (
                <button className="gen-mission-btn" onClick={handleGenerate}>
                  GENERATE MISSION <ArrowRight size={14}/>
                </button>
              )}
              {missionState === 'GENERATING' && (
                <div className="gen-mission-loading">
                  <div className="spinner"></div> {genProgress}
                </div>
              )}
              {data.isMock && (
                <div className="fs-pill warning" style={{ marginLeft: '12px', alignSelf: 'center', background: 'transparent', border: '1px solid #f59e0b', color: '#f59e0b', fontSize: '10px', padding: '4px 8px', borderRadius: '12px' }}>DEMO MODE</div>
              )}
            </div>
          </div>

          {/* Map Controls */}
          <div className="map-controls">
            <button onClick={() => map.current?.zoomIn()}><ZoomIn size={16}/></button>
            <button onClick={() => map.current?.zoomOut()}><ZoomOut size={16}/></button>
            <button onClick={() => map.current?.flyTo({ center: [86.18, 22.80], zoom: 12 })}><Maximize size={16}/></button>
          </div>

          {/* Middle Section (Floating Panels) */}
          <div className="mission-middle-section">
            {(missionState === 'READY' || missionState === 'ACTIVE') && (
              <div className="synthesis-panel">
                <div className="syn-header">
                  <div><Layers size={12} style={{display: 'inline', marginRight: 4, verticalAlign: 'text-bottom'}}/> MISSION SYNTHESIS</div>
                  <div className="syn-badge">AI OPTIMIZED</div>
                </div>
                <div className="syn-title">Why These {selectedIds.length} Stops?</div>
                <div className="syn-desc">
                  This itinerary prioritizes <strong>rapid change sectors</strong>, 
                  verifies critical masonry interventions with absent ground evidence, 
                  and anchors a lower alluvial control baseline.
                </div>
                <div className="syn-metrics">
                  <div className="sm-col">
                    <span className="sm-label">EST. DISTANCE (DEMO)</span>
                    <span className="sm-val">{data.synthesis.distance}</span>
                  </div>
                  <div className="sm-col">
                    <span className="sm-label">PLANNED DURATION</span>
                    <span className="sm-val highlight">{data.synthesis.duration}</span>
                  </div>
                </div>
                <div className="syn-footer">
                  <CheckCircle2 size={12}/> Reduces basin spatial uncertainty by {Math.min(100, selectedIds.length * 15)}%
                </div>
              </div>
            )}

            {activeCandidate && (
              <div className="inspector-panel">
                <div className="insp-header">INSPECTOR</div>
                <div className="insp-title-row">
                  <div className="insp-title">CANDIDATE · {activeCandidate.id.replace('C', '')} <span style={{ color: isSelected ? '#10b981' : '#38bdf8' }}>●</span></div>
                  <div className={`insp-badge ${activeCandidate.priority === 'CRITICAL' ? 'critical' : ''}`}>{activeCandidate.priority} VALUE</div>
                </div>

                <div className="insp-why">
                  <div className="iw-title">WHY VISIT? <ShieldCheck size={12}/></div>
                  <div className="iw-desc">{activeCandidate.reason}</div>
                  <div className="iw-sub">{activeCandidate.gap}</div>
                </div>

                <div className="insp-context">
                  <div className="ic-row">
                    <div className="ic-label">SPATIAL CONTEXT:</div>
                    <div className="ic-val">{activeCandidate.title}</div>
                  </div>
                  <div className="ic-row">
                    <div className="ic-label">VALIDATION:</div>
                    <div className="ic-val" style={{ color: activeCandidate.val === 'VALID' ? '#10b981' : '#f59e0b' }}>
                      {activeCandidate.val === 'VALID' ? <Check size={12}/> : <AlertTriangle size={12}/>} {activeCandidate.val}
                    </div>
                  </div>
                </div>

                <div className="insp-value-decomp">
                  <div className="ivd-title">INFORMATION VALUE DECOMPOSITION</div>
                  
                  <div className="ivd-row">
                    <div className="ivd-label">CHANGE SIGNAL</div>
                    <div className="ivd-bars">
                      {[...Array(5)].map((_, i) => <div key={i} className={`bar-unit ${i < 4 ? 'filled' : ''}`}></div>)}
                    </div>
                    <div className="ivd-val">HIGH</div>
                  </div>
                  <div className="ivd-row">
                    <div className="ivd-label">EVIDENCE GAP</div>
                    <div className="ivd-bars">
                      {[...Array(5)].map((_, i) => <div key={i} className={`bar-unit filled ${activeCandidate.priority==='CRITICAL'?'critical':''}`}></div>)}
                    </div>
                    <div className="ivd-val" style={{ color: activeCandidate.priority==='CRITICAL' ? '#10b981' : '#fff' }}>{activeCandidate.priority}</div>
                  </div>
                </div>

                <div className="insp-actions">
                  <button className={`insp-btn ${isSelected ? 'remove' : ''}`} onClick={() => toggleCandidateSelection(activeCandidate.id)}>
                    {isSelected ? 'REMOVE FROM PLAN' : 'ADD TO PLAN'}
                  </button>
                  <button className="insp-btn secondary" onClick={() => navigate('/compare')}><Layers size={14}/> VIEW SATELLITE CONTEXT</button>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Strip */}
          {(missionState !== 'CONFIG' && missionState !== 'GENERATING') && (
            <div className="mission-bottom-strip">
              <div className="mb-tabs">
                <div className={`mb-tab ${activeTab === 'active_plan' ? 'active' : ''}`} onClick={() => setActiveTab('active_plan')}>
                  <span style={{ color: '#38bdf8' }}>●</span> Active Plan ({selectedIds.length}/{budget} Stops)
                </div>
                <div className={`mb-tab ${activeTab === 'candidate_pool' ? 'active' : ''}`} onClick={() => setActiveTab('candidate_pool')}>
                  Candidate Pool ({candidates.length} Sites)
                </div>
                <div className={`mb-tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
                  <Clock size={12}/> Mission History (2)
                </div>
              </div>

              {activeTab === 'candidate_pool' && missionState === 'CANDIDATES' && (
                <div className="mb-summary-row" style={{ padding: '8px 0' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#9ca3af' }}>{selectedIds.length} Candidates Selected. Ready to build optimal route.</span>
                  <div className="mbs-actions">
                    <button className="mbs-btn primary" onClick={handleBuildRoute} disabled={selectedIds.length === 0}>
                      {missionState === 'ROUTING' ? 'ROUTING...' : 'BUILD ROUTE'}
                    </button>
                  </div>
                </div>
              )}

              {(activeTab === 'active_plan' || missionState === 'READY' || missionState === 'ACTIVE') && (
                <>
                  <div className="mb-summary-row">
                    <div className="mbs-stat">
                      <span className="mbs-label">STOPS:</span>
                      <span className="mbs-val">{selectedIds.length} <span className="mbs-sub">Planned</span></span>
                    </div>
                    <div className="mbs-stat" style={{ borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: 24 }}>
                      <span className="mbs-label">EST. (DEMO)<br/>DISTANCE:</span>
                      <span className="mbs-val highlight">{data.synthesis.distance.split(' ')[0]}<br/>{data.synthesis.distance.split(' ')[1]}</span>
                    </div>
                    <div className="mbs-stat" style={{ borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: 24 }}>
                      <span className="mbs-label">FIELD<br/>TIME:</span>
                      <span className="mbs-val highlight">{data.synthesis.duration} <span className="mbs-sub" style={{ color: '#10b981' }}>(Valid)</span></span>
                    </div>

                    <div className="mbs-actions">
                      <button className="mbs-btn"><Download size={14}/> Export GPX</button>
                      <button className="mbs-btn"><Save size={14}/> Save Draft</button>
                      <button className="mbs-btn primary" onClick={() => setMissionState('ACTIVE')}>
                        <Play size={14} fill="currentColor"/> START ACTIVE MISSION <ArrowRight size={14}/>
                      </button>
                    </div>
                  </div>

                  <div className="ms-cards-row">
                    {selectedIds.map((id, idx) => {
                      const c = candidates.find(x => x.id === id);
                      return (
                        <div key={id} className={`msc-card ${activeCandidateId === id ? 'active' : ''}`} onClick={() => { setActiveCandidateId(id); map.current?.flyTo({center: c.coords, zoom: 15}); }}>
                          <div className="msc-header">
                            <span>STOP 0{idx + 1}</span>
                            <span style={{ color: missionState === 'ACTIVE' && idx === 0 ? '#10b981' : '#38bdf8' }}>
                              {missionState === 'ACTIVE' && idx === 0 ? 'ACTIVE' : 'PLANNED'}
                            </span>
                          </div>
                          <div className="msc-title">{c.title}</div>
                          <div className="msc-desc">{c.reason}</div>
                        </div>
                      )
                    })}
                    {selectedIds.length === 0 && (
                      <div style={{ padding: '20px', fontFamily: 'monospace', color: '#9ca3af', fontSize: 11 }}>No stops selected yet.</div>
                    )}
                  </div>
                </>
              )}

              {activeTab === 'history' && (
                <div className="mission-footer" style={{ borderTop: 'none', paddingTop: 0 }}>
                  <div className="mf-list">
                    <div className="mf-item">MISSION 014 · Subarnarekha South · 18 Aug 2024 · 5 Stops (4 Verified)</div>
                    <div className="mf-item">MISSION 013 · Mayurakshi Catchment · 02 Jul 2024 · 4 Stops (Archived)</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
