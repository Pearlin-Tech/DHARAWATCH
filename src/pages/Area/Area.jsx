import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Map as MapIcon, Plus, Minus, X, Download, MessageSquare, Eye, Crosshair, ArrowRight } from 'lucide-react';
import AppNavigation from '../../components/AppNavigation';
import MapViewport from '../../components/MapViewport';
import './Area.css';

export default function Area() {
  const routerLocation = useLocation();
  const navigate = useNavigate();
  const initialCoords = routerLocation.state?.coords || { lng: 4.8197, lat: 43.3524 }; // Default to Camargue/Rhone area based on ref

  const [mapInstance, setMapInstance] = useState(null);
  const [hoverCoords, setHoverCoords] = useState(null);
  
  const [query, setQuery] = useState('Show everything within 5 km of this river.');
  const [radius, setRadius] = useState(5.0);
  const [status, setStatus] = useState('idle'); // idle, processing, complete
  
  // Handlers
  const handleUpdate = () => {
    if (!query) return;
    setStatus('processing');
    setTimeout(() => {
      setStatus('complete');
    }, 1500);
  };

  const handleClear = () => {
    setStatus('idle');
    setQuery('');
    setRadius(5.0);
  };

  const adjustRadius = (amount) => {
    setRadius(prev => Math.max(0.5, prev + amount));
  };

  const handleAsk = () => {
    navigate('/ask', { state: { coords: initialCoords, geometry: 'area-buffer' } });
  };

  const handleWatch = () => {
    navigate('/watch/new', { state: { coords: initialCoords, geometry: 'area-buffer' } });
  };

  const presets = [
    '5 km river buffer',
    '10 km coastal perimeter',
    '2 km flood basin offset'
  ];

  return (
    <div className="area-container">
      <AppNavigation />

      <MapViewport 
        center={[initialCoords.lng, initialCoords.lat]} 
        zoom={12}
        onMapLoad={setMapInstance}
        hoverCoords={hoverCoords}
        setHoverCoords={setHoverCoords}
      />

      {/* MOCK MAP OVERLAY (Shows when complete) */}
      <AnimatePresence>
        {status === 'complete' && (
          <motion.div 
            className="absolute inset-0 pointer-events-none z-10 overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Very rough mock of the SVG buffer geometry */}
            <svg width="100%" height="100%" className="absolute inset-0 pointer-events-none">
              <path 
                d="M 300 400 Q 500 200 800 600" 
                fill="none" 
                stroke="rgba(255,255,255,0.8)" 
                strokeWidth="3"
                strokeDasharray="4 4"
              />
              <path 
                d="M 280 350 Q 480 150 780 550 L 820 650 Q 520 250 320 450 Z" 
                fill="rgba(37, 99, 235, 0.15)" 
                stroke="var(--accent-blue)" 
                strokeWidth="2"
                strokeDasharray="8 4"
              />
              <circle cx="500" cy="350" r="4" fill="var(--accent-blue)" />
              <line x1="500" y1="350" x2="600" y2="250" stroke="white" strokeWidth="1" strokeDasharray="2 2" />
              <g transform="translate(600, 240)">
                <rect x="0" y="0" width="180" height="24" rx="4" fill="rgba(10,12,16,0.9)" />
                <circle cx="12" cy="12" r="3" fill="var(--accent-blue)" />
                <text x="22" y="16" fill="white" fontSize="9" fontFamily="monospace" letterSpacing="1">OFFSET: +{radius.toFixed(3)} KM</text>
              </g>
            </svg>
            
            <div className="absolute bottom-10 left-[120px] glass-panel px-4 py-3 rounded-lg flex flex-col gap-1">
              <div className="flex items-center gap-2 text-[10px] font-mono text-success-mint tracking-wider uppercase">
                <div className="w-1.5 h-1.5 rounded-full bg-success-mint animate-pulse"></div>
                SPATIAL ENVELOPE <span className="text-gray-dim ml-1">EPSG:4326</span>
              </div>
              <div className="text-white text-xs font-medium font-mono">
                BUFFER ZONE // River Rhone Estuary · {radius.toFixed(1)} km radius · 142.6 km²
              </div>
              <div className="text-[10px] font-mono text-gray-dim">
                LAT: {initialCoords.lat.toFixed(4)}° N   LON: {initialCoords.lng.toFixed(4)}° E   GSD: 0.5m / PXL
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* TOP QUERY PANEL */}
      <div className="area-top-panel">
        <div className="area-query-bar glass-panel">
          <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center text-accent-blue mr-3 shrink-0">
            <Search size={16} />
          </div>
          <input 
            type="text" 
            className="area-input"
            placeholder="Describe the area you want to create."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleUpdate()}
          />
          {query && (
            <button className="p-2 text-gray hover:text-white transition-colors" onClick={handleClear}>
              <X size={16} />
            </button>
          )}
          <button 
            className="area-submit-btn bg-accent-blue hover:bg-blue-600 text-white font-medium flex items-center gap-2 transition-colors ml-2"
            onClick={handleUpdate}
          >
            Update <ArrowRight size={14} />
          </button>
        </div>
        
        <div className="area-controls mt-3 flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono text-gray-dim uppercase tracking-wider">PRESETS:</span>
            {presets.map(p => (
              <button 
                key={p} 
                className="text-[10px] font-mono bg-white/5 hover:bg-white/10 text-gray hover:text-white px-2 py-1 rounded transition-colors"
                onClick={() => setQuery(p)}
              >
                {p}
              </button>
            ))}
          </div>
          
          <div className="flex items-center gap-3 bg-black/40 px-3 py-1.5 rounded-lg border border-white/5">
            <span className="text-[10px] font-mono text-gray-dim uppercase tracking-wider">RADIUS</span>
            <button className="text-gray hover:text-white" onClick={() => adjustRadius(-0.5)}><Minus size={14} /></button>
            <span className="text-white font-mono text-xs w-12 text-center">{radius.toFixed(1)} km</span>
            <button className="text-gray hover:text-white" onClick={() => adjustRadius(0.5)}><Plus size={14} /></button>
          </div>
        </div>
      </div>

      {/* RESULT INSPECTOR */}
      <AnimatePresence>
        {status === 'complete' && (
          <motion.div 
            className="area-result-panel glass-panel"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
          >
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2 text-xs font-mono text-white font-medium tracking-wide">
                <div className="w-2 h-2 rounded-full bg-success-mint"></div>
                AREA CREATED
              </div>
              <div className="text-[10px] font-mono text-accent-blue uppercase">READY</div>
            </div>

            <div className="bg-white/5 p-4 rounded-lg mb-4">
              <div className="text-[10px] font-mono text-gray-dim uppercase mb-1">Target Geometry</div>
              <div className="text-sm font-medium text-white">Rhone Main Distributary Channel</div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-white/5 p-4 rounded-lg">
                <div className="text-[10px] font-mono text-gray-dim uppercase mb-1">Buffer Radius</div>
                <div className="text-xl font-bold text-white">{radius.toFixed(1)} <span className="text-xs font-normal text-gray">km</span></div>
              </div>
              <div className="bg-white/5 p-4 rounded-lg">
                <div className="text-[10px] font-mono text-gray-dim uppercase mb-1">Enclosed Area</div>
                <div className="text-xl font-bold text-white">142.6 <span className="text-xs font-normal text-gray">km²</span></div>
              </div>
              <div className="bg-white/5 p-4 rounded-lg">
                <div className="text-[10px] font-mono text-gray-dim uppercase mb-1">Perimeter Bound</div>
                <div className="text-sm font-medium text-white">64.8 <span className="text-xs font-normal text-gray">km</span></div>
              </div>
              <div className="bg-white/5 p-4 rounded-lg">
                <div className="text-[10px] font-mono text-gray-dim uppercase mb-1">Feature Vertices</div>
                <div className="text-sm font-medium text-white">1,418 <span className="text-xs font-normal text-gray">pts</span></div>
              </div>
            </div>

            <div className="flex gap-3 mb-6">
              <button 
                className="flex-1 bg-accent-blue hover:bg-blue-600 text-white py-3 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors"
                onClick={handleAsk}
              >
                <MessageSquare size={16} /> Ask Area
              </button>
              <button 
                className="flex-1 bg-white/5 hover:bg-white/10 text-white py-3 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors border border-white/5"
                onClick={handleWatch}
              >
                <Eye size={16} className="text-accent-blue" /> Watch
              </button>
            </div>

            <div className="flex justify-between items-center text-xs font-mono">
              <button className="flex items-center gap-2 text-gray hover:text-white transition-colors">
                <Download size={14} /> Export GeoJSON
              </button>
              <button className="flex items-center gap-2 text-gray hover:text-white transition-colors" onClick={handleClear}>
                <X size={14} /> Clear Area
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
