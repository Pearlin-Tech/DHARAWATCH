import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Maximize, MapPin, Activity, AlertTriangle, TrendingUp, ChevronDown, CheckCircle2, Pause, Edit3, Settings } from 'lucide-react';
import AppNavigation from '../../components/AppNavigation';
import MapViewport from '../../components/MapViewport';
import './Watch.css';

export default function WatchDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [mapInstance, setMapInstance] = useState(null);
  const [activePass, setActivePass] = useState(142);
  const [isPaused, setIsPaused] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  const passes = [
    { id: 142, time: '1h ago', val: '142.8 km²', change: '+4.2%', alert: false },
    { id: 141, time: '3d ago', val: '138.1 km²', change: '+0.8%', alert: false },
    { id: 140, time: '8d ago', val: '151.4 km²', change: '+10.5%', alert: true, reason: 'Surface surge threshold breached' },
    { id: 139, time: '13d ago', val: '137.0 km²', change: 'Baseline', alert: false },
  ];

  const currentPassData = passes.find(p => p.id === activePass) || passes[0];

  return (
    <div className="watch-container">
      <AppNavigation />
      
      <div className="watch-detail-layout">
        {/* MAP AREA */}
        <div className="watch-map-area">
          <div className="absolute top-6 left-6 z-20 flex gap-2">
            <button 
              className="flex items-center gap-2 px-3 py-1.5 bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/10 rounded-lg text-xs font-mono text-white transition-colors"
              onClick={() => navigate('/watch')}
            >
              <ArrowLeft size={14} /> WATCHES
            </button>
            <div className="flex items-center gap-2 px-4 py-1.5 bg-black/60 backdrop-blur-md border border-white/10 rounded-lg text-xs font-mono text-gray-dim">
              <span className="text-accent-blue">#02</span> / <span className="text-white">Camargue Estuary</span> · River Delta
            </div>
            <div className="flex items-center gap-2 px-4 py-1.5 bg-black/60 backdrop-blur-md border border-white/10 rounded-lg text-[10px] font-mono text-gray-dim uppercase">
              <MapPin size={12} /> 43°32'N 04°30'E · 850 km² AOI
            </div>
          </div>
          
          <div className="absolute top-16 left-6 z-20 flex gap-2">
            <div className="flex items-center gap-2 px-4 py-1.5 bg-black/60 backdrop-blur-md border border-white/10 rounded-lg text-[10px] font-mono text-gray-dim uppercase">
              <div className="w-1.5 h-1.5 rounded-full bg-success-mint"></div>
              SENTINEL-2 MSI · GSD 10m · Next: <span className="text-accent-blue">Tomorrow 09:40 UTC</span>
            </div>
            <button className="p-1.5 bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/10 rounded-lg text-gray transition-colors">
              <Maximize size={14} />
            </button>
          </div>

          <MapViewport 
            center={[4.5, 43.5333]} 
            zoom={11}
            onMapLoad={setMapInstance}
          />

          {/* MOCK MAP GEOMETRY OVERLAY */}
          <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
            <svg width="100%" height="100%" className="absolute inset-0">
              <path 
                d="M 400 200 L 600 150 L 700 300 L 650 600 L 450 700 L 350 500 Z" 
                fill="rgba(37, 99, 235, 0.05)" 
                stroke="var(--accent-blue)" 
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
              <circle cx="400" cy="200" r="3" fill="var(--accent-blue)" />
              <circle cx="600" cy="150" r="3" fill="var(--accent-blue)" />
              <circle cx="700" cy="300" r="3" fill="var(--accent-blue)" />
              <circle cx="650" cy="600" r="3" fill="var(--accent-blue)" />
              <circle cx="450" cy="700" r="3" fill="var(--accent-blue)" />
              <circle cx="350" cy="500" r="3" fill="var(--accent-blue)" />
            </svg>
            <div className="absolute" style={{ top: '35%', left: '48%' }}>
              <div className="text-[10px] font-mono text-accent-blue bg-black/60 px-2 py-1 rounded border border-accent-blue/30 flex items-center gap-1">
                <Activity size={10} /> CAMARGUE_SECTOR_DELTA · AOI-850
              </div>
            </div>
          </div>
        </div>

        {/* SIDE PANEL */}
        <div className="watch-side-panel">
          <div className="watch-panel-header">
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-success-mint">
                <div className="w-1.5 h-1.5 rounded-full bg-success-mint animate-pulse"></div>
                {isPaused ? <span className="text-warning-amber">PAUSED</span> : 'ACTIVE SURVEILLANCE'}
                <span className="text-gray-dim ml-2">ID: WT-0428</span>
              </div>
              <Activity size={14} className="text-gray" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-1">Flood change monitoring</h2>
            <p className="text-xs text-gray-dim">Automated SAR & NDWI multi-spectral differential</p>
          </div>

          <div className="watch-panel-content">
            {/* Rule Summary */}
            <div className="mb-6 p-4 bg-white/5 rounded-lg border border-white/5">
              <div className="flex justify-between items-center text-[10px] font-mono text-gray-dim uppercase mb-2">
                <span>Active Trigger Rule</span>
                <span className="text-accent-blue bg-accent-blue/10 px-1.5 rounded">B03 + B08 INDEX</span>
              </div>
              <div className="text-sm font-medium text-white mb-4">
                Surface Area &gt; +10% <span className="text-xs font-mono text-gray-dim font-normal ml-2">(SAR NDWI verification)</span>
              </div>
              <div className="text-[10px] font-mono text-gray-dim flex items-center gap-1">
                <ClockIcon size={10} /> Last checked 1h ago <span className="mx-2 text-white/20">|</span> 24 Sep 2026, 14:22 UTC
              </div>
            </div>

            {/* Current Metrics */}
            <div className="mb-8">
              <div className="flex justify-between items-end mb-2">
                <div className="text-[10px] font-mono text-gray-dim uppercase tracking-wider">Live Water Extent</div>
                <div className={`text-[10px] font-mono uppercase ${currentPassData.alert ? 'text-danger-red' : 'text-success-mint'}`}>
                  {currentPassData.alert ? 'Threshold Breached' : 'Nominal · No Breach'}
                </div>
              </div>
              
              <div className="flex items-end gap-4 mb-3">
                <div className="text-4xl font-bold text-white leading-none">{currentPassData.val.split(' ')[0]} <span className="text-sm font-normal text-gray">km²</span></div>
                <div className={`text-sm font-medium font-mono flex items-center gap-1 ${currentPassData.alert ? 'text-danger-red' : 'text-accent-blue'}`}>
                  <TrendingUp size={14} /> {currentPassData.change} vs base
                </div>
              </div>

              {/* Progress bar mock */}
              <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden mb-2 relative">
                <div className="absolute top-0 left-0 h-full bg-success-mint" style={{ width: '40%' }}></div>
                <div className="absolute top-0 left-[60%] h-full w-0.5 bg-warning-amber z-10"></div>
              </div>
              <div className="flex justify-between text-[10px] font-mono text-gray-dim">
                <span>Base: 137.0 km²</span>
                <span className="text-warning-amber">Alert: 150.7 km² (+10%)</span>
              </div>
            </div>

            {/* Mini Trend Chart Mock */}
            <div className="mb-8">
              <div className="flex justify-between text-[10px] font-mono text-gray-dim mb-4">
                <span>NDWI Index Trend</span>
                <span>μ = 0.442</span>
              </div>
              <div className="h-16 w-full border-b border-l border-white/10 relative">
                <svg width="100%" height="100%" preserveAspectRatio="none">
                  <path d="M 0 50 Q 50 40 100 50 T 200 45 T 250 10 T 300 20 L 300 64 L 0 64 Z" fill="rgba(37,99,235,0.1)" />
                  <path d="M 0 50 Q 50 40 100 50 T 200 45 T 250 10 T 300 20" fill="none" stroke="var(--accent-blue)" strokeWidth="2" />
                  <circle cx="250" cy="10" r="3" fill="var(--danger-red)" />
                  <circle cx="300" cy="20" r="3" fill="var(--accent-blue)" />
                </svg>
                <div className="absolute top-1/2 left-0 w-full border-t border-dashed border-warning-amber/50"></div>
              </div>
            </div>

            {/* Pass Audit Trail */}
            <div className="mb-6">
              <div className="flex justify-between text-[10px] font-mono text-gray-dim uppercase mb-4">
                <span>Pass Audit Trail</span>
                <span>Last 4 Re-orbits</span>
              </div>
              
              <div className="flex flex-col gap-2">
                {passes.map(p => (
                  <div 
                    key={p.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      activePass === p.id 
                        ? p.alert ? 'bg-danger-red/10 border-danger-red/30' : 'bg-white/10 border-white/20'
                        : 'border-transparent hover:bg-white/5'
                    }`}
                    onClick={() => setActivePass(p.id)}
                  >
                    <div className="mt-1">
                      <div className={`w-2 h-2 rounded-full ${p.alert ? 'bg-danger-red' : p.id === activePass ? 'bg-success-mint' : 'bg-gray'}`}></div>
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-center mb-1">
                        <div className="text-xs font-bold text-white font-mono">Pass {p.id} <span className="text-[10px] text-gray ml-2 font-normal">· {p.time}</span></div>
                        <div className={`text-xs font-mono font-medium ${p.alert ? 'text-danger-red' : 'text-white'}`}>
                          {p.val} <span className="text-gray-dim ml-1">({p.change})</span>
                        </div>
                      </div>
                      {p.alert && (
                        <div className="text-[10px] text-danger-red flex items-center gap-1 mt-1">
                          <AlertTriangle size={10} /> Alert triggered: {p.reason}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button className="w-full flex justify-between items-center p-3 bg-white/5 rounded-lg text-xs font-mono text-gray-dim hover:text-white transition-colors">
              <div className="flex items-center gap-2"><Settings size={14} /> STAC PAYLOAD & PIPELINE SPECS</div>
              <ChevronDown size={14} />
            </button>
          </div>

          <div className="p-4 border-t border-white/5 flex gap-3">
            <button 
              className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-medium text-white transition-colors flex items-center justify-center gap-2"
              onClick={() => setIsPaused(!isPaused)}
            >
              {isPaused ? <Play size={14} className="text-success-mint" /> : <Pause size={14} className="text-warning-amber" />}
              {isPaused ? 'Resume Watch' : 'Pause Watch'}
            </button>
            <button className="flex-1 py-2.5 bg-accent-blue hover:bg-blue-600 rounded-lg text-xs font-medium text-white transition-colors flex items-center justify-center gap-2">
              <Edit3 size={14} /> Edit Rule
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Quick fallback for missing icon
function ClockIcon({ size }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
}
