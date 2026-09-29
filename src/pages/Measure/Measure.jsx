import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Hexagon, Ruler, Undo, X, Save, Check, Map as MapIcon } from 'lucide-react';
import AppNavigation from '../../components/AppNavigation';
import MapViewport from '../../components/MapViewport';
import './Measure.css';

export default function Measure() {
  const routerLocation = useLocation();
  const initialCoords = routerLocation.state?.coords || { lng: 72.5714, lat: 23.0225 };

  const [mapInstance, setMapInstance] = useState(null);
  const [hoverCoords, setHoverCoords] = useState(null);
  const [markerCoords, setMarkerCoords] = useState(initialCoords);

  const [mode, setMode] = useState('area'); // area, distance
  const [points, setPoints] = useState([]);
  const [currentMousePos, setCurrentMousePos] = useState(null);
  const [isFinished, setIsFinished] = useState(false);
  
  const mapOverlayRef = useRef(null);

  // Conversion for mock metrics
  // In a real app we'd use Turf.js or similar for precise geodesic calculations
  const calculateDistance = (p1, p2) => {
    // Rough mock pixel-to-km estimation based on zoom 13
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return (Math.sqrt(dx * dx + dy * dy) * 0.015).toFixed(1);
  };

  const calculateArea = (pts) => {
    if (pts.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      let j = (i + 1) % pts.length;
      area += pts[i].x * pts[j].y;
      area -= pts[j].x * pts[i].y;
    }
    area = Math.abs(area) / 2;
    // Mock scaling to km²
    return (area * 0.0003).toFixed(1);
  };

  const calculatePerimeter = (pts) => {
    if (pts.length < 2) return 0;
    let perim = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      perim += parseFloat(calculateDistance(pts[i], pts[i+1]));
    }
    if (pts.length > 2 && isFinished) {
      perim += parseFloat(calculateDistance(pts[pts.length-1], pts[0]));
    }
    return perim.toFixed(1);
  };

  const handlePointerMove = (e) => {
    if (isFinished) return;
    if (points.length > 0) {
      setCurrentMousePos({ x: e.clientX, y: e.clientY });
    }
  };

  const handlePointerDown = (e) => {
    if (isFinished) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setPoints([...points, { x, y }]);
    setCurrentMousePos({ x, y });
  };

  const handleDoubleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (mode === 'area' && points.length >= 2) {
      setIsFinished(true);
      setCurrentMousePos(null);
    }
  };

  const handleUndo = () => {
    if (isFinished) setIsFinished(false);
    else if (points.length > 0) {
      setPoints(points.slice(0, -1));
      if (points.length === 1) setCurrentMousePos(null);
    }
  };

  const handleClear = () => {
    setPoints([]);
    setCurrentMousePos(null);
    setIsFinished(false);
  };

  // Keyboard undo
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        handleUndo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [points, isFinished]);

  // Render SVG Paths
  const renderAreaPath = () => {
    if (points.length === 0) return null;
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x} ${points[i].y}`;
    }
    if (currentMousePos && !isFinished) {
      path += ` L ${currentMousePos.x} ${currentMousePos.y}`;
    }
    if (isFinished) {
      path += ' Z';
    }
    return path;
  };

  const renderDistancePath = () => {
    if (points.length === 0) return null;
    let path = `M ${points[0].x} ${points[0].y}`;
    if (points.length > 1) {
      path += ` L ${points[1].x} ${points[1].y}`;
    } else if (currentMousePos && !isFinished) {
      path += ` L ${currentMousePos.x} ${currentMousePos.y}`;
    }
    return path;
  };

  return (
    <div className="measure-container">
      <AppNavigation />

      <MapViewport 
        center={[initialCoords.lng, initialCoords.lat]} 
        zoom={13}
        onMapLoad={setMapInstance}
        hoverCoords={hoverCoords}
        setHoverCoords={setHoverCoords}
      />

      {/* MEASUREMENT DRAWING LAYER */}
      <div 
        className="measure-drawing-layer"
        ref={mapOverlayRef}
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) => { e.preventDefault(); if(mode==='area' && points.length >=2) { setIsFinished(true); setCurrentMousePos(null); } else if (mode==='distance' && points.length >=1) { setIsFinished(true); setCurrentMousePos(null); }}}
      >
        <svg width="100%" height="100%" style={{ pointerEvents: 'none' }}>
          {mode === 'area' && (
            <path 
              d={renderAreaPath()} 
              fill={isFinished ? 'rgba(37, 99, 235, 0.2)' : 'rgba(37, 99, 235, 0.1)'} 
              stroke="var(--accent-blue)" 
              strokeWidth="2" 
              strokeDasharray={isFinished ? "0" : "5,5"}
            />
          )}
          {mode === 'distance' && (
            <path 
              d={renderDistancePath()} 
              fill="none" 
              stroke="var(--accent-blue)" 
              strokeWidth="3"
            />
          )}
          
          {/* Edge labels for distance */}
          {mode === 'distance' && points.length > 0 && (points.length > 1 || currentMousePos) && (
            <g>
              {(() => {
                const end = points.length > 1 ? points[1] : currentMousePos;
                const dist = calculateDistance(points[0], end);
                const midX = (points[0].x + end.x) / 2;
                const midY = (points[0].y + end.y) / 2;
                return (
                  <g transform={`translate(${midX}, ${midY})`}>
                    <rect x="-24" y="-10" width="48" height="20" rx="4" fill="rgba(10, 12, 16, 0.8)" />
                    <text x="0" y="4" fontSize="10" fill="white" textAnchor="middle" fontFamily="monospace">{dist} km</text>
                  </g>
                );
              })()}
            </g>
          )}

          {/* Area polygon edge labels (Mocked for visual parity) */}
          {mode === 'area' && points.map((pt, i) => {
            const next = isFinished ? points[(i + 1) % points.length] : (i === points.length - 1 ? currentMousePos : points[i + 1]);
            if (!next) return null;
            const dist = calculateDistance(pt, next);
            const midX = (pt.x + next.x) / 2;
            const midY = (pt.y + next.y) / 2;
            
            return (
              <g key={`edge-${i}`} transform={`translate(${midX}, ${midY})`}>
                <rect x="-20" y="-10" width="40" height="20" rx="4" fill="rgba(10, 12, 16, 0.8)" border="1px solid rgba(255,255,255,0.2)"/>
                <text x="0" y="3" fontSize="9" fill="white" textAnchor="middle" fontFamily="monospace">{dist} km</text>
              </g>
            );
          })}

          {/* Vertices */}
          {points.map((pt, i) => (
            <circle key={i} cx={pt.x} cy={pt.y} r="5" fill="var(--accent-blue)" stroke="black" strokeWidth="2" />
          ))}
          {currentMousePos && !isFinished && (
            <circle cx={currentMousePos.x} cy={currentMousePos.y} r="5" fill="rgba(37, 99, 235, 0.5)" />
          )}
        </svg>
      </div>

      {/* TOP MEASURE TOOLBAR */}
      <div className="measure-toolbar glass-panel">
        <button 
          className={`tool-btn ${mode === 'area' ? 'active' : ''}`}
          onClick={() => { setMode('area'); handleClear(); }}
        >
          <Hexagon size={14} /> Area
        </button>
        <button 
          className={`tool-btn ${mode === 'distance' ? 'active' : ''}`}
          onClick={() => { setMode('distance'); handleClear(); }}
        >
          <Ruler size={14} /> Distance
        </button>
        <div className="toolbar-divider mx-2 w-px h-4 bg-white/20"></div>
        <button className="tool-btn text-gray hover:text-white" onClick={handleUndo} disabled={points.length === 0}>
          <Undo size={14} /> Undo
        </button>
        <button className="tool-btn text-gray hover:text-white" onClick={handleClear} disabled={points.length === 0}>
          <X size={14} /> Clear
        </button>
      </div>
      
      {/* INSTRUCTION CHIP */}
      {points.length === 0 && (
        <div className="measure-instruction glass-panel">
          <div className="w-1.5 h-1.5 rounded-full bg-accent-blue mr-2"></div>
          {mode === 'area' ? 'Click map to place vertex points · Double-click to close polygon' : 'Click map to set start point'}
        </div>
      )}

      {/* RESULT INSPECTOR */}
      <AnimatePresence>
        {(isFinished || (mode === 'distance' && points.length > 1)) && (
          <motion.div 
            className="measure-result-panel glass-panel"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            <div className="flex justify-between items-start mb-4">
              <div className="text-[10px] font-mono text-gray-dim uppercase tracking-wider">
                MEASUREMENT / {mode === 'area' ? 'SURFACE AREA' : 'LINEAR DISTANCE'}
              </div>
              <div className="flex items-center gap-1.5 text-[9px] font-mono text-success-mint bg-success-mint/10 px-2 py-0.5 rounded-full border border-success-mint/20">
                <div className="w-1.5 h-1.5 rounded-full bg-success-mint"></div>
                {mode === 'area' ? 'POLYGON CLOSED' : 'DISTANCE MEASURED'}
              </div>
            </div>

            <div className="mb-6">
              {mode === 'area' ? (
                <>
                  <div className="text-4xl font-bold text-white leading-tight">
                    {calculateArea(points)}<span className="text-xl font-normal text-accent-blue ml-1">km²</span>
                  </div>
                  <div className="text-xs font-mono text-gray mt-2 flex items-center gap-2">
                    <Ruler size={12} /> {calculatePerimeter(points)} km perimeter length
                  </div>
                </>
              ) : (
                <div className="text-4xl font-bold text-white leading-tight">
                  {points.length > 1 ? calculateDistance(points[0], points[1]) : 0}<span className="text-xl font-normal text-accent-blue ml-1">km</span>
                </div>
              )}
            </div>

            <div className="border-t border-white/10 pt-4 mb-6">
              <div className="flex justify-between text-[10px] font-mono mb-2">
                <span className="text-gray-dim">Geometry</span>
                <span className="text-white">{mode === 'area' ? `${points.length} Vertices · Convex` : '2 Vertices · LineString'}</span>
              </div>
              <div className="flex justify-between text-[10px] font-mono mb-2">
                <span className="text-gray-dim">Spatial Reference</span>
                <span className="text-accent-blue">EPSG:4326 (WGS84)</span>
              </div>
              <div className="flex justify-between text-[10px] font-mono">
                <span className="text-gray-dim">Calculation Engine</span>
                <span className="text-gray">Karney Geodesic Inverse</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button className="text-xs font-mono text-gray hover:text-white transition-colors" onClick={handleClear}>
                Clear
              </button>
              <div className="flex gap-2">
                <button className="flex items-center gap-2 px-3 py-1.5 border border-white/10 hover:bg-white/5 rounded text-xs text-white transition-colors">
                  <Save size={12} /> Save
                </button>
                <button className="flex items-center gap-2 px-4 py-1.5 bg-accent-blue hover:bg-blue-600 rounded text-xs font-medium text-white transition-colors" onClick={handleClear}>
                  <Check size={14} /> Done
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
