import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Pause, Play, SkipBack, SkipForward, Satellite, Activity, X, ArrowRight, Crosshair, MapPin, Eye } from 'lucide-react';
import AppNavigation from '../../components/AppNavigation';
import MapViewport from '../../components/MapViewport';
import './Timeline.css';

export default function Timeline() {
  const navigate = useNavigate();
  const [mapInstance, setMapInstance] = useState(null);
  const trackRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState('1x');
  const [progress, setProgress] = useState(0.65); // 0 to 1
  const [isDragging, setIsDragging] = useState(false);
  
  const [activeEvent, setActiveEvent] = useState(null); // ID of clicked event

  const events = [
    { id: 'ev-1', pos: 0.15, date: '12 May 2022', title: 'Desiccation Surge', type: 'Drought', color: 'bg-warning-amber' },
    { id: 'ev-2', pos: 0.65, date: '18 Aug 2024', title: 'Plume Outflow', type: 'Surface Hydrology', color: 'bg-accent-blue', active: true },
    { id: 'ev-3', pos: 0.85, date: '04 Nov 2025', title: 'Regrowth Vector', type: 'Vegetation', color: 'bg-success-mint' }
  ];

  const currentDateText = '18 AUG 2024';
  const currentTimeText = '10:42 UTC';
  
  // Scrubber drag logic
  const handlePointerDown = (e) => {
    setIsDragging(true);
    updateProgress(e.clientX);
  };

  const handlePointerMove = (e) => {
    if (isDragging) {
      updateProgress(e.clientX);
    }
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  const updateProgress = (clientX) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    let p = (clientX - rect.left) / rect.width;
    p = Math.max(0, Math.min(1, p));
    setProgress(p);
  };

  // Playback effect
  useEffect(() => {
    let interval;
    if (isPlaying) {
      const step = speed === '1x' ? 0.001 : speed === '2x' ? 0.002 : 0.005;
      interval = setInterval(() => {
        setProgress(prev => {
          if (prev + step >= 1) {
            setIsPlaying(false);
            return 1;
          }
          return prev + step;
        });
      }, 50);
    }
    return () => clearInterval(interval);
  }, [isPlaying, speed]);

  const handleCompare = () => {
    navigate('/compare', { state: { date: currentDateText } });
  };

  const handleWatch = () => {
    navigate('/watch/new');
  };
  
  const handleEvidence = () => {
    navigate('/evidence/ev-0428');
  };

  return (
    <div 
      className="timeline-container"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <AppNavigation />
      
      <MapViewport 
        center={[4.4, 43.5]} 
        zoom={11}
        onMapLoad={setMapInstance}
      />

      {/* TOP CONTROLS */}
      <div className="timeline-top-controls">
        <div className="timeline-header-panel glass-panel bg-black/60 backdrop-blur-md">
          <div className="w-1.5 h-6 bg-success-mint rounded-full"></div>
          <div>
            <div className="text-sm font-bold text-white leading-tight">Camargue<br/>Estuary Delta</div>
          </div>
          <div className="h-8 w-px bg-white/10 mx-2"></div>
          <div className="text-[10px] font-mono text-accent-blue flex flex-col gap-1">
            <span>43°32'18"N</span>
            <span>04°30'44"E</span>
          </div>
          <div className="h-8 w-px bg-white/10 mx-2"></div>
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-mono text-gray-dim uppercase">GSD: 10m MS</span>
            <span className="text-[11px] font-mono text-success-mint font-medium">&lt; 1.2% CLOUD</span>
          </div>
        </div>
        
        <div className="timeline-header-panel glass-panel bg-black/60 backdrop-blur-md">
          <Satellite size={16} className="text-gray" />
          <div className="text-sm font-mono text-white font-medium uppercase tracking-wider">
            Sentinel-2 MSI +<br/>Landsat-8 Composite
          </div>
        </div>

        <div className="timeline-header-panel glass-panel bg-black/60 backdrop-blur-md ml-auto">
          <div className="flex gap-4 items-center">
            <div className="text-[10px] font-mono text-gray-dim uppercase text-right leading-relaxed">
              Timeline<br/>Span:
            </div>
            <div className="text-xs font-mono text-white leading-relaxed">
              2021 — 2026 (6-yr<br/>Time Series)
            </div>
          </div>
        </div>
      </div>

      {/* MOCK MAP GEOMETRY (Plume) */}
      <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
        <div className="absolute" style={{ top: '65%', left: '55%' }}>
          <div className="text-[9px] font-mono text-success-mint flex items-center gap-1 border border-success-mint/30 bg-black/40 px-1.5 py-0.5 rounded">
            <Activity size={10} /> DELTA OUTFLOW
          </div>
        </div>
        <svg width="100%" height="100%" className="absolute inset-0">
          <path 
            d="M 500 500 Q 600 600 750 650 Q 800 550 650 450 Z" 
            fill="rgba(74, 222, 128, 0.1)" 
            stroke="var(--success-mint)" 
            strokeWidth="1"
            strokeDasharray="4 2"
          />
        </svg>
      </div>

      {/* EVENT INSPECTOR PANEL */}
      <AnimatePresence>
        {activeEvent === 'ev-2' && (
          <motion.div 
            className="event-inspector-panel glass-panel bg-black/80 backdrop-blur-xl border border-white/10"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
          >
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2 text-[9px] font-mono text-accent-blue uppercase tracking-widest bg-accent-blue/10 px-2 py-1 rounded">
                Event #04 · 18 Aug 2024 <span className="bg-white/10 text-white px-1 ml-1 rounded">Surface Hydrology</span>
              </div>
              <button className="text-gray hover:text-white" onClick={() => setActiveEvent(null)}>
                <X size={14} />
              </button>
            </div>
            
            <h3 className="text-lg font-bold text-white mb-2">Rapid River Delta Outflow & Sediment Plume</h3>
            <p className="text-xs text-gray-dim leading-relaxed mb-6">
              Heavy alpine glacial meltwater combined with seasonal rain surges flushed dense suspended particulate matter into the coastal shelf basin.
            </p>
            
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <div className="text-[9px] font-mono text-gray-dim uppercase mb-1">Delta Extent Shift</div>
                <div className="text-lg font-bold text-success-mint">+34.2 km²</div>
                <div className="text-[10px] text-success-mint/70">(+18.4% vs 2021)</div>
              </div>
              <div>
                <div className="text-[9px] font-mono text-gray-dim uppercase mb-1">Turbidity Index</div>
                <div className="text-lg font-bold text-accent-blue">0.68 NTU</div>
                <div className="text-[10px] text-accent-blue/70">High Runoff Spike</div>
              </div>
            </div>
            
            <div className="text-[10px] font-mono text-gray-dim flex items-center gap-2 mb-6">
              <Satellite size={12} /> Sentinel-2 MSI · Band B03/B08 NDWI differential
            </div>
            
            <div className="flex justify-between items-center border-t border-white/10 pt-4">
              <button className="text-xs font-mono text-gray hover:text-white flex items-center gap-1 transition-colors" onClick={handleCompare}>
                Compare with 2021 baseline <ArrowRight size={12} />
              </button>
              <div className="flex gap-2">
                 <button className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded border border-white/10 text-xs text-white transition-colors flex items-center gap-1" onClick={handleEvidence}>
                  <Activity size={12} /> Proof
                </button>
                <button className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded border border-white/10 text-xs text-white transition-colors flex items-center gap-1" onClick={handleWatch}>
                  <Eye size={12} /> Watch
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* BOTTOM TIMELINE CONTROL */}
      <div className="timeline-bottom-controls glass-panel bg-black/80 backdrop-blur-xl border border-white/10">
        
        <div className="timeline-playback-row justify-between">
          <div className="flex items-center gap-4">
            <button className="w-10 h-10 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-lg text-white transition-colors">
              <Pause size={16} className="opacity-0" /> {/* Spacer */}
              <SkipBack size={16} className="absolute" />
            </button>
            <button 
              className="timeline-playback-btn"
              onClick={() => setIsPlaying(!isPlaying)}
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-1" />}
            </button>
            <button className="w-10 h-10 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-lg text-white transition-colors">
              <SkipForward size={16} />
            </button>
            
            <div className="speed-toggle ml-2">
              {['1x', '2x', '5x'].map(s => (
                <button 
                  key={s} 
                  className={speed === s ? 'active' : ''}
                  onClick={() => setSpeed(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-accent-blue rounded-full shadow-[0_0_8px_var(--accent-blue)]"></div>
            <div className="text-sm font-bold font-mono text-white tracking-widest">{currentDateText} <span className="text-gray-dim mx-2">·</span> {currentTimeText}</div>
            <div className="text-[10px] font-mono text-accent-blue ml-2 border-l border-white/10 pl-3">PASS #2,108</div>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-gray-dim uppercase">Cadence:</span>
            <div className="text-[10px] font-mono bg-white/5 text-white px-2 py-1 rounded">Monthly composite</div>
            <div className="text-[10px] font-mono bg-transparent text-gray px-2 py-1">Orbits</div>
            <div className="text-[10px] font-mono bg-transparent text-gray px-2 py-1">Seasonal</div>
          </div>
        </div>

        <div className="timeline-scrubber-area">
          <div className="timeline-track" ref={trackRef} onPointerDown={handlePointerDown}></div>
          <div className="timeline-fill" style={{ width: `${progress * 100}%` }}></div>
          
          {events.map(ev => (
            <React.Fragment key={ev.id}>
              <div 
                className={`timeline-event-tick ${ev.color}`} 
                style={{ left: `${ev.pos * 100}%` }}
                onClick={() => setActiveEvent(ev.id)}
              ></div>
              {/* Optional labels above ticks */}
              {ev.pos > 0.1 && ev.pos < 0.9 && (
                <div 
                  className="absolute text-[9px] font-mono flex flex-col items-center"
                  style={{ left: `${ev.pos * 100}%`, top: '-16px', transform: 'translateX(-50%)' }}
                >
                  <span className={`${ev.color.replace('bg-', 'text-')} whitespace-nowrap`}>
                    {ev.active && <span className="text-white px-1 mr-1 bg-white/10 rounded">{ev.date}</span>}
                    {ev.title} {ev.active && '[ACTIVE]'}
                  </span>
                </div>
              )}
            </React.Fragment>
          ))}

          <div 
            className="timeline-thumb" 
            style={{ left: `${progress * 100}%` }}
            onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e); }}
          ></div>

          <div className="timeline-years-row">
            {['2021', '2022', '2023', '2024', '2025', '2026'].map(year => (
              <div key={year} className="timeline-year-marker">
                <span className="year">{year}</span>
                <div className="quarters">
                  <span>Q1</span>
                  <span>Q2</span>
                  <span>Q3</span>
                  <span>Q4</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        
      </div>
    </div>
  );
}
