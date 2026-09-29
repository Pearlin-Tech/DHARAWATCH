import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Layers, Filter, Maximize, AlertTriangle, 
  MapPin, Clock, Camera, Activity, FileStack, Settings, 
  Search, ShieldCheck, FileText, ChevronRight, Share2, 
  Eye, CheckCircle2, Navigation, MessageSquare, AlertCircle, X,
  LayoutTemplate
} from 'lucide-react';
import { watershedService } from '../../services/watershedService';
import AppNavigation from '../../components/AppNavigation';
import MapViewport from '../../components/MapViewport';
import FloatingPanel from './FloatingPanel';
import './Watershed.css';

const DEFAULT_LAYOUT = {
  fingerprint: { x: 24, y: 120 },
  attention: { x: window.innerWidth - 400, y: 120 },
  layers: { x: 24, y: 460 },
  intervention: { x: window.innerWidth - 400, y: 380 },
  timeline: { x: (window.innerWidth - 800) / 2, y: window.innerHeight - 150 }
};

export default function Watershed() {
  const [selectedWatershed, setSelectedWatershed] = useState(null);
  
  // Real data state (defaults to null/empty as requested)
  const [metadata, setMetadata] = useState({
    boundary: '—',
    microWatersheds: '—',
    latestPass: '—',
    source: '—'
  });

  const [activeLayers, setActiveLayers] = useState({
    satellite: true,
    boundary: true,
    microWatersheds: false,
    drainage: false,
    ndvi: false,
    water: false,
    lulc: false,
    interventions: false,
    fieldEvidence: false
  });

  const [hoverCoords, setHoverCoords] = useState(null);
  
  // Panel Manager State
  const [panels, setPanels] = useState({
    fingerprint: true,
    attention: true,
    layers: true,
    intervention: false,
    timeline: true
  });
  
  const [panelManagerOpen, setPanelManagerOpen] = useState(false);

  // Z-Index Manager
  const [zIndices, setZIndices] = useState({
    fingerprint: 10,
    attention: 10,
    layers: 10,
    intervention: 10,
    timeline: 10
  });
  const [topZ, setTopZ] = useState(10);

  const bringToFront = (panelId) => {
    setTopZ(prev => prev + 1);
    setZIndices(prev => ({ ...prev, [panelId]: topZ + 1 }));
  };

  const resetWorkspace = () => {
    // A quick hack to reset positions is to unmount and remount or rely on keys.
    // For now, we will just toggle them off and on to re-trigger initial constraints.
    setPanels({
      fingerprint: true,
      attention: true,
      layers: true,
      intervention: false,
      timeline: true
    });
  };

  // Handle map click to resolve watershed
  const handleMapClick = async (lngLat) => {
    const result = await watershedService.resolveWatershed({ lat: lngLat.lat, lng: lngLat.lng });
    if (result) {
      setSelectedWatershed(result);
      setMetadata({
        boundary: result.area ? `${result.area} km²` : '—',
        microWatersheds: result.childrenCount ? `${result.childrenCount} Active` : '—',
        latestPass: result.latestPass || '—',
        source: result.source || '—'
      });
    } else {
      console.log('No watershed resolved at this location.');
    }
  };

  const togglePanel = (panel) => {
    if (!panels[panel]) bringToFront(panel);
    setPanels(prev => ({ ...prev, [panel]: !prev[panel] }));
  };

  const toggleLayer = (layerKey) => {
    setActiveLayers(prev => ({ ...prev, [layerKey]: !prev[layerKey] }));
  };

  return (
    <div className="watershed-page-container">
      <AppNavigation />

      <main className="watershed-main-content">
        
        {/* TOP CONTEXT BAR */}
        <div className="watershed-top-bar glass-panel relative z-50">
          <div className="wtb-top-row flex justify-between items-center text-[10px] font-mono text-gray mb-2 tracking-widest">
            <div className="wtb-breadcrumbs flex items-center gap-2">
              <span>DHARAWATCH / </span>
              <span className="text-accent-blue font-bold">WATERSHED</span>
              {selectedWatershed && (
                <>
                  <span> / </span>
                  <span className="text-white">{selectedWatershed.id || selectedWatershed.name}</span>
                </>
              )}
            </div>
            <div className="wtb-status-badges flex items-center gap-6">
              <div className="flex items-center gap-1 text-success-mint">
                <Activity size={12} />
                ORBITAL SYNC ACTIVE
              </div>
              <div className="flex items-center gap-1">
                <Eye size={12} />
                CONSTELLATION: SENTINEL-2 / WORLDVIEW-3
              </div>
              <div className="border-l border-white/10 pl-4 text-right leading-tight">
                <span className="text-white">CDR. A. VANCE</span><br/>
                <span className="opacity-50">GEOINT SPEC // T1</span>
              </div>
            </div>
          </div>

          <div className="wtb-bottom-row flex items-end justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold tracking-wider">WATERSHED</h1>
              <div className="watershed-selector bg-black/40 border border-white/10 px-3 py-1.5 rounded flex items-center gap-2 cursor-pointer text-sm">
                <span className="text-accent-blue">●</span>
                {selectedWatershed ? selectedWatershed.name : 'Select Watershed...'}
                <ChevronRight size={14} className="rotate-90 text-gray" />
              </div>
            </div>
            
            <div className="wtb-actions flex gap-2">
              <div className="relative">
                <button 
                  className={`btn-command text-xs font-mono ${panelManagerOpen ? 'active' : ''}`}
                  onClick={() => setPanelManagerOpen(!panelManagerOpen)}
                >
                  <LayoutTemplate size={14} className="mr-2" />
                  WORKSPACE
                </button>
                
                <AnimatePresence>
                  {panelManagerOpen && (
                    <motion.div 
                      className="absolute top-full mt-2 right-0 w-48 glass-panel p-2 flex flex-col gap-1 border border-white/10 rounded shadow-xl"
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                    >
                      <div className="text-[10px] font-mono text-gray mb-1 px-2 uppercase">Panels</div>
                      {Object.keys(panels).map(p => (
                        <label key={p} className="flex items-center justify-between px-2 py-1.5 hover:bg-white/5 rounded cursor-pointer text-xs font-mono">
                          <span className="capitalize">{p}</span>
                          <input type="checkbox" checked={panels[p]} onChange={() => togglePanel(p)} className="accent-accent-blue"/>
                        </label>
                      ))}
                      <div className="border-t border-white/10 mt-1 pt-2">
                        <button onClick={resetWorkspace} className="w-full text-left px-2 py-1.5 text-xs font-mono text-gray hover:text-white hover:bg-white/5 rounded">
                          Reset Workspace
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <button className="btn-command text-xs font-mono" onClick={() => togglePanel('layers')}>
                <Layers size={14} className="mr-2" />
                LAYERS ({Object.values(activeLayers).filter(Boolean).length} ACTIVE)
              </button>
              <button className="btn-command icon-only">
                <Maximize size={14} />
              </button>
            </div>
          </div>
          
          <div className="wtb-metadata mt-2 pt-2 border-t border-white/5 text-[10px] font-mono text-gray flex gap-6">
            <div>BOUNDARY: <span className="text-white">{metadata.boundary}</span></div>
            <div>MICRO-WATERSHEDS: <span className="text-white">{metadata.microWatersheds}</span></div>
            <div>LATEST PASS: <span className="text-white">{metadata.latestPass}</span></div>
            <div>SOURCE: <span className="text-white">{metadata.source}</span></div>
          </div>
        </div>

        {/* MAP AREA */}
        <div className="watershed-map-area z-0">
          <MapViewport 
            center={[72.5714, 23.0225]} 
            zoom={11}
            hoverCoords={hoverCoords}
            setHoverCoords={setHoverCoords}
            onMapClick={handleMapClick}
          >
            {/* PANELS LAYERED OVER MAP */}
            <div className="watershed-panels-overlay pointer-events-none absolute inset-0 overflow-hidden">
              
              {/* FINGERPRINT PANEL */}
              <AnimatePresence>
                {panels.fingerprint && (
                  <FloatingPanel 
                    id="fingerprint"
                    title="Watershed Fingerprint"
                    icon={<Activity size={14}/>}
                    defaultPosition={DEFAULT_LAYOUT.fingerprint}
                    defaultSize={{ width: 340, height: 380 }}
                    onClose={() => togglePanel('fingerprint')}
                    zIndex={zIndices.fingerprint}
                    bringToFront={bringToFront}
                  >
                    <div className="flex flex-col gap-3">
                      <div className="fp-row">
                        <div className="fp-label"><span className="status-dot dot-blue"></span> WATER</div>
                        <div className="fp-value text-accent-blue font-bold text-[10px] font-mono">AVAILABLE</div>
                      </div>
                      <div className="fp-row">
                        <div className="fp-label"><span className="status-dot dot-cyan"></span> VEGETATION</div>
                        <div className="fp-value text-cyan-400 font-bold text-[10px] font-mono">PARTIAL (NDVI 0.44)</div>
                      </div>
                      <div className="fp-row">
                        <div className="fp-label"><span className="status-dot dot-gray"></span> LAND MORPH</div>
                        <div className="fp-value text-gray text-[10px] font-mono">STABLE</div>
                      </div>
                      <div className="fp-row">
                        <div className="fp-label"><span className="status-dot dot-blue"></span> DRAINAGE SYSTEM</div>
                        <div className="fp-value text-accent-blue font-bold text-[10px] font-mono">4TH ORDER (DENDRITIC)</div>
                      </div>
                      <div className="fp-row">
                        <div className="fp-label"><span className="status-dot dot-blue"></span> INTERVENTIONS</div>
                        <div className="fp-value text-gray text-[10px] font-mono">18 RECORDED</div>
                      </div>
                      <div className="fp-row">
                        <div className="fp-label"><span className="status-dot dot-green"></span> FIELD EVIDENCE</div>
                        <div className="fp-value text-success-mint font-bold text-[10px] font-mono">6 VERIFIED</div>
                      </div>
                      <div className="fp-row">
                        <div className="fp-label"><span className="status-dot dot-orange"></span> TEMPORAL CHANGE</div>
                        <div className="fp-value text-warning font-bold text-[10px] font-mono">DETECTED ⚠</div>
                      </div>
                      
                      <div className="flex items-center justify-between text-[8px] text-gray mt-2 pt-2 border-t border-white/10 font-mono">
                         <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-accent-blue"></span> AVAIL</span>
                         <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span> PARTIAL</span>
                         <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-warning"></span> PENDING</span>
                         <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span> NO DATA</span>
                      </div>
                    </div>
                  </FloatingPanel>
                )}
              </AnimatePresence>

              {/* ATTENTION PANEL */}
              <AnimatePresence>
                {panels.attention && (
                  <FloatingPanel 
                    id="attention"
                    title="Areas Needing Attention"
                    icon={<AlertTriangle size={14} className="text-warning"/>}
                    badge="3"
                    defaultPosition={DEFAULT_LAYOUT.attention}
                    defaultSize={{ width: 380, height: 280 }}
                    onClose={() => togglePanel('attention')}
                    zIndex={zIndices.attention}
                    bringToFront={bringToFront}
                  >
                    <div className="flex flex-col gap-4">
                      {/* Item 1 */}
                      <div className="flex flex-col gap-1 pb-3 border-b border-white/10">
                        <div className="flex justify-between items-start">
                          <span className="text-[11px] font-bold text-red-400 font-mono">[!] Gully Erosion Progression</span>
                          <span className="text-[10px] text-gray font-mono">Reach 04</span>
                        </div>
                        <div className="text-[11px] text-gray mb-1">Sediment plume widening · Evidence gap 14 months</div>
                        <div className="flex justify-between items-center text-[10px] font-mono">
                          <span className="text-gray">PRIORITY: HIGH</span>
                          <button className="text-accent-blue hover:text-white flex items-center gap-1">Plan Mission <ChevronRight size={10}/></button>
                        </div>
                      </div>
                      
                      {/* Item 2 */}
                      <div className="flex flex-col gap-1 pb-3 border-b border-white/10">
                        <div className="flex justify-between items-start">
                          <span className="text-[11px] font-bold text-warning font-mono">[~] Check Dam #009 Siltation</span>
                          <span className="text-[10px] text-gray font-mono">Trib 1</span>
                        </div>
                        <div className="text-[11px] text-gray mb-1">Capacity threshold breached · Satellite/field discrepancy</div>
                        <div className="flex justify-between items-center text-[10px] font-mono">
                          <span className="text-gray">DELTA: -32% VOL</span>
                          <button className="text-accent-blue hover:text-white flex items-center gap-1">Inspect Layer <ChevronRight size={10}/></button>
                        </div>
                      </div>

                      {/* Item 3 */}
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-start">
                          <span className="text-[11px] text-gray font-mono">[?] Unverified Bund Breach</span>
                          <span className="text-[10px] text-gray font-mono">Lower Basin</span>
                        </div>
                      </div>
                    </div>
                  </FloatingPanel>
                )}
              </AnimatePresence>

              {/* GEOSPATIAL LAYERS PANEL */}
              <AnimatePresence>
                {panels.layers && (
                  <FloatingPanel 
                    id="layers"
                    title="Geospatial Layers"
                    icon={<Layers size={14}/>}
                    defaultPosition={DEFAULT_LAYOUT.layers}
                    defaultSize={{ width: 300, height: 400 }}
                    onClose={() => togglePanel('layers')}
                    zIndex={zIndices.layers}
                    bringToFront={bringToFront}
                  >
                    <div className="flex flex-col gap-4">
                      <div className="layers-group">
                        <div className="text-[10px] font-mono text-accent-blue tracking-widest mb-2">HYDROLOGY</div>
                        <label className="flex items-center justify-between py-1 text-xs text-gray hover:text-white cursor-pointer">
                          <span>Watershed Boundary</span>
                          <input type="checkbox" checked={activeLayers.boundary} onChange={() => toggleLayer('boundary')} className="accent-accent-blue"/>
                        </label>
                        <label className="flex items-center justify-between py-1 text-xs text-gray hover:text-white cursor-pointer">
                          <span>Micro-watersheds (14)</span>
                          <input type="checkbox" checked={activeLayers.microWatersheds} onChange={() => toggleLayer('microWatersheds')} className="accent-accent-blue"/>
                        </label>
                        <label className="flex items-center justify-between py-1 text-xs text-gray hover:text-white cursor-pointer">
                          <span>Dendritic Drainage</span>
                          <input type="checkbox" checked={activeLayers.drainage} onChange={() => toggleLayer('drainage')} className="accent-accent-blue"/>
                        </label>
                      </div>

                      <div className="layers-group pt-2 border-t border-white/5">
                        <div className="text-[10px] font-mono text-success-mint tracking-widest mb-2">LAND & SPECTRAL</div>
                        <label className="flex items-center justify-between py-1 text-xs text-gray hover:text-white cursor-pointer">
                          <span>NDVI Vegetative Index</span>
                          <input type="checkbox" checked={activeLayers.ndvi} onChange={() => toggleLayer('ndvi')} className="accent-accent-blue"/>
                        </label>
                        <label className="flex items-center justify-between py-1 text-xs text-gray hover:text-white cursor-pointer">
                          <span>LULC Classification</span>
                          <input type="checkbox" checked={activeLayers.lulc} onChange={() => toggleLayer('lulc')} className="accent-accent-blue"/>
                        </label>
                      </div>

                      <div className="layers-group pt-2 border-t border-white/5">
                        <div className="text-[10px] font-mono text-warning tracking-widest mb-2">INTERVENTIONS & FIELD</div>
                        <label className="flex items-center justify-between py-1 text-xs text-gray hover:text-white cursor-pointer">
                          <span>Check Dams (8)</span>
                          <input type="checkbox" checked={activeLayers.interventions} onChange={() => toggleLayer('interventions')} className="accent-accent-blue"/>
                        </label>
                        <label className="flex items-center justify-between py-1 text-xs text-gray hover:text-white cursor-pointer">
                          <span>Field Photo Verification</span>
                          <input type="checkbox" checked={activeLayers.fieldEvidence} onChange={() => toggleLayer('fieldEvidence')} className="accent-accent-blue"/>
                        </label>
                      </div>
                    </div>
                  </FloatingPanel>
                )}
              </AnimatePresence>

              {/* INTERVENTION PASSPORT */}
              <AnimatePresence>
                {panels.intervention && (
                  <FloatingPanel 
                    id="intervention"
                    title="Intervention Passport"
                    icon={<FileText size={14}/>}
                    defaultPosition={DEFAULT_LAYOUT.intervention}
                    defaultSize={{ width: 380, height: 320 }}
                    onClose={() => togglePanel('intervention')}
                    zIndex={zIndices.intervention}
                    bringToFront={bringToFront}
                  >
                    <div className="flex flex-col gap-3">
                      <div className="flex justify-between items-center mb-1">
                        <h3 className="text-xl font-bold font-mono">#INT-014</h3>
                        <span className="bg-success-mint/20 text-success-mint px-2 py-0.5 rounded text-[10px] font-bold">VERIFIED</span>
                      </div>
                      
                      <div className="bg-black/30 p-3 rounded border border-white/5">
                        <div className="text-[10px] text-gray font-mono mb-1">STRUCTURE IDENTITY & SPEC</div>
                        <div className="text-xs font-mono">Masonry Check Dam (Grade II)</div>
                        <div className="text-xs font-mono text-gray">Micro-catchment Tributary 3 · Discharge zone 12</div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-black/30 p-2 rounded border border-white/5">
                          <div className="text-[9px] text-gray font-mono mb-1">COORDINATES</div>
                          <div className="text-[10px] font-mono">22°48'14"N<br/>86°11'05"E</div>
                        </div>
                        <div className="bg-black/30 p-2 rounded border border-white/5">
                          <div className="text-[9px] text-gray font-mono mb-1">ELEVATION</div>
                          <div className="text-[10px] font-mono">264m MSL</div>
                        </div>
                      </div>

                      <div className="flex gap-2 mt-2">
                        <button className="flex-1 bg-white/5 hover:bg-white/10 text-xs py-1.5 rounded flex items-center justify-center gap-2 transition-colors"><FileStack size={12}/> Compare</button>
                        <button className="flex-1 bg-white/5 hover:bg-white/10 text-xs py-1.5 rounded flex items-center justify-center gap-2 transition-colors"><ShieldCheck size={12}/> Evidence</button>
                      </div>
                      <button className="w-full bg-accent-blue text-white text-xs font-bold py-2 rounded flex items-center justify-center gap-2 mt-1 hover:bg-blue-600 transition-colors">
                        PLAN MISSION <ChevronRight size={14}/>
                      </button>
                    </div>
                  </FloatingPanel>
                )}
              </AnimatePresence>

              {/* TEMPORAL RIBBON */}
              <AnimatePresence>
                {panels.timeline && (
                  <FloatingPanel 
                    id="timeline"
                    title="Temporal Ribbon"
                    icon={<Clock size={14}/>}
                    defaultPosition={DEFAULT_LAYOUT.timeline}
                    defaultSize={{ width: 800, height: 110 }}
                    minSize={{ width: 400, height: 110 }}
                    onClose={() => togglePanel('timeline')}
                    zIndex={zIndices.timeline}
                    bringToFront={bringToFront}
                  >
                    <div className="flex flex-col gap-2 h-full justify-center">
                      <div className="flex justify-between items-center text-[10px] font-mono text-gray">
                        <div className="flex items-center gap-4">
                          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-accent-blue"></span> Passes</span>
                          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-success-mint"></span> Surveys</span>
                          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span> Works</span>
                        </div>
                        <div className="font-bold text-accent-blue border border-accent-blue/30 bg-accent-blue/10 px-2 py-0.5 rounded">CURRENT: SEP 2026</div>
                      </div>
                      
                      {/* Timeline Scrubber Mock */}
                      <div className="relative h-6 flex items-center mt-3">
                        <div className="absolute left-0 right-0 h-0.5 bg-white/20 rounded-full"></div>
                        
                        <div className="absolute left-[20%] flex flex-col items-center">
                          <div className="w-2 h-2 rounded-full bg-white/40 z-10"></div>
                          <span className="absolute top-4 text-[9px] font-mono text-gray">2024</span>
                        </div>
                        
                        <div className="absolute left-[50%] flex flex-col items-center">
                          <div className="w-2 h-2 rounded-full bg-white/40 z-10"></div>
                          <span className="absolute top-4 text-[9px] font-mono text-gray">2025</span>
                        </div>

                        <div className="absolute left-[85%] flex flex-col items-center">
                          <div className="w-4 h-4 rounded-full bg-accent-blue border-2 border-black z-20 shadow-[0_0_10px_rgba(59,130,246,0.8)]"></div>
                          <span className="absolute top-4 text-[10px] font-bold font-mono text-accent-blue">2026 ACTIVE</span>
                        </div>
                        
                        {/* Active segment */}
                        <div className="absolute left-[20%] right-[15%] h-1 bg-gradient-to-r from-accent-blue/10 to-accent-blue/80 translate-y-[-1px] rounded-full pointer-events-none"></div>
                      </div>
                    </div>
                  </FloatingPanel>
                )}
              </AnimatePresence>

            </div>
          </MapViewport>
          
          {/* BOTTOM ACTION DOCK (Fixed at bottom safe zone) */}
          <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-[100] flex items-center gap-2 bg-black/80 backdrop-blur-md border border-white/10 px-2 py-1.5 rounded-full shadow-2xl">
            <button className="flex items-center gap-2 text-xs font-mono text-gray hover:text-white px-4 py-2 transition-colors rounded-full hover:bg-white/10">
              <MapPin size={14} /> EXPLORE
            </button>
            <button className="flex items-center gap-2 text-xs font-mono text-gray hover:text-white px-4 py-2 transition-colors rounded-full hover:bg-white/10">
              <FileStack size={14} /> COMPARE
            </button>
            <button className="flex items-center gap-2 text-xs font-mono text-gray hover:text-white px-4 py-2 transition-colors rounded-full hover:bg-white/10">
              <MessageSquare size={14} /> ASK DHARAWATCH
            </button>
            <button className="flex items-center gap-2 text-xs font-mono text-gray hover:text-white px-4 py-2 transition-colors rounded-full hover:bg-white/10">
              <ShieldCheck size={14} /> EVIDENCE
            </button>
            <div className="w-px h-6 bg-white/10 mx-1"></div>
            <button className="bg-accent-blue hover:bg-blue-600 text-white text-xs font-bold font-mono py-2 px-5 rounded-full flex items-center gap-2 transition-colors">
              PLAN MISSION <ChevronRight size={14} />
            </button>
          </div>
          
        </div>

      </main>
    </div>
  );
}
