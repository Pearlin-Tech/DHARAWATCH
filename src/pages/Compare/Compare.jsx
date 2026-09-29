import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Crosshair, AlertTriangle, Play, Pause, ChevronLeft, ChevronRight as IconChevronRight, CheckCircle, XCircle, ArrowRight, TrendingUp, TrendingDown } from 'lucide-react';
import AppNavigation from '../../components/AppNavigation';
import MapViewport from '../../components/MapViewport';
import './Compare.css';

export default function Compare() {
  const routerLocation = useLocation();
  const initialCoords = routerLocation.state?.coords || { lng: 72.5714, lat: 23.0225 };

  const [map1, setMap1] = useState(null);
  const [map2, setMap2] = useState(null);
  const [mode, setMode] = useState('split');
  const [splitPos, setSplitPos] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverCoords, setHoverCoords] = useState(null);
  const [markerCoords, setMarkerCoords] = useState(initialCoords);
  const [flickerActive, setFlickerActive] = useState(false);
  const [flickerState, setFlickerState] = useState('before');

  // Default: baseline ~5 years ago, current = today
  const [baselineDate, setBaselineDate] = useState('2021-01-15');
  const [timelineDate, setTimelineDate] = useState(new Date().toISOString().split('T')[0]);
  const [draggingDot, setDraggingDot] = useState(null);

  // Committed dates: only update (and trigger API) when user releases the dot
  const [committedBaseline, setCommittedBaseline] = useState('2021-01-15');
  const [committedCurrent, setCommittedCurrent] = useState(new Date().toISOString().split('T')[0]);

  const MIN_DATE = new Date('2019-01-01').getTime();
  const MAX_DATE = new Date('2026-12-31').getTime();

  const getPercentage = useCallback((dateStr) => {
    const t = new Date(dateStr).getTime();
    if (isNaN(t)) return 0;
    return Math.max(0, Math.min(100, ((t - MIN_DATE) / (MAX_DATE - MIN_DATE)) * 100));
  }, []);

  const getDateFromPercentage = useCallback((percent) => {
    const t = MIN_DATE + (percent / 100) * (MAX_DATE - MIN_DATE);
    return new Date(t).toISOString().split('T')[0];
  }, []);

  const formatDisplayDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const [analysisState, setAnalysisState] = useState('processing');
  const [apiResult, setApiResult] = useState(null);
  const [showEvidence, setShowEvidence] = useState(false);
  const [baselineTileUrl, setBaselineTileUrl] = useState(null);
  const [currentTileUrl, setCurrentTileUrl] = useState(null);

  const sliderRef = useRef(null);
  const isSyncingLeft = useRef(false);
  const isSyncingRight = useRef(false);
  const abortControllerRef = useRef(null);

  // Sync maps
  useEffect(() => {
    if (!map1 || !map2) return;
    const syncLeft = () => {
      if (isSyncingRight.current) return;
      isSyncingLeft.current = true;
      map2.jumpTo({ center: map1.getCenter(), zoom: map1.getZoom(), bearing: map1.getBearing(), pitch: map1.getPitch() });
      isSyncingLeft.current = false;
    };
    const syncRight = () => {
      if (isSyncingLeft.current) return;
      isSyncingRight.current = true;
      map1.jumpTo({ center: map2.getCenter(), zoom: map2.getZoom(), bearing: map2.getBearing(), pitch: map2.getPitch() });
      isSyncingRight.current = false;
    };
    map1.on('move', syncLeft);
    map2.on('move', syncRight);
    return () => { map1.off('move', syncLeft); map2.off('move', syncRight); };
  }, [map1, map2]);

  // Split divider
  const handlePointerDown = (e) => { if (mode !== 'split') return; setIsDragging(true); e.target.setPointerCapture(e.pointerId); };
  const handlePointerMove = useCallback((e) => {
    if (!isDragging || !sliderRef.current) return;
    const rect = sliderRef.current.parentElement.getBoundingClientRect();
    setSplitPos(Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100)));
  }, [isDragging]);
  const handlePointerUp = (e) => { setIsDragging(false); e.target.releasePointerCapture(e.pointerId); };

  // Flicker
  useEffect(() => {
    if (mode !== 'flicker' || !flickerActive) return;
    const interval = setInterval(() => setFlickerState(s => s === 'before' ? 'after' : 'before'), 800);
    return () => clearInterval(interval);
  }, [mode, flickerActive]);

  // Timeline dots dragging (both freely movable)
  const handleTimelinePointerDown = (e, type) => {
    setDraggingDot(type);
    e.target.setPointerCapture(e.pointerId);
    e.stopPropagation();
  };
  const handleTimelinePointerMove = useCallback((e) => {
    if (!draggingDot) return;
    const track = document.getElementById('compare-timeline-track');
    if (!track) return;
    const rect = track.getBoundingClientRect();
    let pos = ((e.clientX - rect.left) / rect.width) * 100;
    pos = Math.max(0, Math.min(100, pos));

    if (draggingDot === 'baseline') {
      const currentPos = getPercentage(timelineDate);
      if (pos > currentPos - 1) pos = currentPos - 1;
      setBaselineDate(getDateFromPercentage(pos));
    } else {
      const baselinePos = getPercentage(baselineDate);
      if (pos < baselinePos + 1) pos = baselinePos + 1;
      setTimelineDate(getDateFromPercentage(pos));
    }
  }, [draggingDot, baselineDate, timelineDate, getPercentage, getDateFromPercentage]);
  const handleTimelinePointerUp = (e) => {
    if (draggingDot) {
      // Commit on release — this triggers the API call
      setCommittedBaseline(baselineDate);
      setCommittedCurrent(timelineDate);
      setDraggingDot(null);
      e.target.releasePointerCapture(e.pointerId);
    }
  };

  const getMapBounds = () => {
    if (map1) { const b = map1.getBounds(); return { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() }; }
    return null;
  };

  // Years difference
  const yearsDiff = () => {
    const diff = (new Date(timelineDate).getTime() - new Date(baselineDate).getTime()) / (365.25 * 86400000);
    return diff.toFixed(1);
  };

  // API call — only fires when committed dates change (on pointer-up), not while dragging
  useEffect(() => {
    setShowEvidence(false);
    setAnalysisState('processing');
    const timeoutId = setTimeout(async () => {
      // Always use committed dates for the actual query
      const queryBaseline = committedBaseline;
      const queryCurrent = committedCurrent;
      if (abortControllerRef.current) abortControllerRef.current.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      try {
        const response = await fetch('/api/compare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({ baselineDate: queryBaseline, currentDate: queryCurrent, coords: markerCoords, bounds: getMapBounds(), indicator: 'generic' })
        });
        if (controller.signal.aborted) return;
        if (!response.ok) { setAnalysisState('error'); setApiResult({ status: 'error', message: `HTTP ${response.status}` }); return; }
        const data = await response.json();
        if (controller.signal.aborted) return;
        setApiResult(data);
        switch (data.status) {
          case 'success':
            setAnalysisState('success');
            if (data.baseline?.tileUrl) setBaselineTileUrl(data.baseline.tileUrl);
            if (data.current?.tileUrl) setCurrentTileUrl(data.current.tileUrl);
            break;
          case 'insufficient_data': setAnalysisState('insufficient'); break;
          case 'invalid': setAnalysisState('invalid'); break;
          default: setAnalysisState('error');
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
        setAnalysisState('error');
        setApiResult({ status: 'error', message: err.message });
      }
    }, 600);
    return () => { clearTimeout(timeoutId); if (abortControllerRef.current) abortControllerRef.current.abort(); };
  }, [committedBaseline, committedCurrent, markerCoords]);

  return (
    <div className="compare-container">
      <AppNavigation />

      {/* TOP BAR */}
      <div className="compare-top-bar glass-panel text-xs font-mono text-gray">
        <div className="flex items-center gap-5">
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-dim uppercase mb-0.5">Location</span>
            <span className="text-white flex items-center gap-2">
              <Crosshair size={12} className="text-accent-blue" />
              {markerCoords.lat.toFixed(4)}°N, {markerCoords.lng.toFixed(4)}°E
            </span>
          </div>
          <div className="h-6 w-px bg-white/10"></div>
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-dim uppercase mb-0.5">Before</span>
            <span className="text-white font-bold">{formatDisplayDate(baselineDate)}</span>
            {apiResult?.baseline?.actualDate && <span className="text-[9px] text-accent-blue">Sat: {apiResult.baseline.actualDate}</span>}
          </div>
          <ArrowRight size={14} className="text-accent-blue" />
          <div className="flex flex-col">
            <span className="text-[10px] text-accent-blue uppercase mb-0.5">After ({yearsDiff()} yrs)</span>
            <span className="text-white font-bold">{formatDisplayDate(timelineDate)}</span>
            {apiResult?.current?.actualDate && <span className="text-[9px] text-accent-blue">Sat: {apiResult.current.actualDate}</span>}
          </div>
          <div className="h-6 w-px bg-white/10"></div>
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-dim uppercase mb-0.5">Sensor</span>
            <span className="text-white">Sentinel-2 MSI</span>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-black/40 p-1 rounded-md border border-white/5">
          <button className={`px-3 py-1.5 rounded-sm transition-colors ${mode === 'split' ? 'bg-accent-blue text-white' : 'text-gray hover:text-white'}`} onClick={() => setMode('split')}>Split</button>
          <button className={`px-3 py-1.5 rounded-sm transition-colors ${mode === 'difference' ? 'bg-accent-blue text-white' : 'text-gray hover:text-white'}`} onClick={() => setMode('difference')}>Difference</button>
          <button className={`px-3 py-1.5 rounded-sm transition-colors ${mode === 'flicker' ? 'bg-accent-blue text-white' : 'text-gray hover:text-white'}`} onClick={() => { setMode('flicker'); setFlickerActive(true); }}>Flicker</button>
        </div>
      </div>

      {/* MAPS */}
      <div className="compare-maps-wrapper" ref={sliderRef} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
        {/* LEFT: BEFORE */}
        <div className="map-layer baseline-layer" style={{ opacity: 1 }}>
          <MapViewport center={[initialCoords.lng, initialCoords.lat]} zoom={13} onMapLoad={setMap1} hoverCoords={hoverCoords} setHoverCoords={setHoverCoords} markerCoords={markerCoords} onMapClick={setMarkerCoords} tileUrl={baselineTileUrl} />
          {mode === 'split' && (
            <div className="layer-label glass-panel">BEFORE — {apiResult?.baseline?.actualDate || formatDisplayDate(baselineDate)}</div>
          )}
        </div>

        {/* RIGHT: AFTER */}
        <div className="map-layer current-layer" style={{
          clipPath: mode === 'split' ? `inset(0 0 0 ${splitPos}%)` : 'none',
          opacity: mode === 'difference' ? 0.4 : (mode === 'flicker' && flickerState === 'before') ? 0 : 1,
          pointerEvents: mode === 'split' ? 'auto' : 'none',
          mixBlendMode: mode === 'difference' ? 'screen' : 'normal'
        }}>
          <MapViewport center={[initialCoords.lng, initialCoords.lat]} zoom={13} onMapLoad={setMap2} tileUrl={currentTileUrl} />
          {mode === 'split' && (
            <div className="layer-label right glass-panel">AFTER — {apiResult?.current?.actualDate || formatDisplayDate(timelineDate)}</div>
          )}
        </div>

        {/* SPLIT DIVIDER */}
        {mode === 'split' && (
          <div className="split-divider" style={{ left: `${splitPos}%` }} onPointerDown={handlePointerDown}>
            <div className="split-handle">
              <ChevronLeft size={14} className="text-gray" />
              <div className="w-px h-4 bg-white/20 mx-0.5"></div>
              <IconChevronRight size={14} className="text-gray" />
            </div>
          </div>
        )}

        {mode === 'difference' && (analysisState === 'insufficient' || analysisState === 'error') && (
          <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
            <div className="bg-black/80 px-4 py-2 rounded text-sm font-mono text-warning border border-warning/30 backdrop-blur-md">
              {analysisState === 'error' ? apiResult?.message : 'NO RELIABLE OBSERVATION'}
            </div>
          </div>
        )}
      </div>

      {/* TIMELINE — both dots freely draggable */}
      <div className="compare-timeline glass-panel">
        <div className="flex items-center gap-4 w-full">
          <div className="flex items-center gap-2">
            <button className="p-1.5 text-gray hover:text-white transition-colors" onClick={() => {
              const d = new Date(timelineDate); d.setMonth(d.getMonth() - 6);
              if (d.getTime() > new Date(baselineDate).getTime()) setTimelineDate(d.toISOString().split('T')[0]);
            }}><ChevronLeft size={16} /></button>
            <button className="p-2 bg-white/10 hover:bg-accent-blue text-white rounded-full transition-colors"
              onClick={() => { if (mode === 'flicker') setFlickerActive(!flickerActive); }}>
              {mode === 'flicker' && flickerActive ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
            </button>
            <button className="p-1.5 text-gray hover:text-white transition-colors" onClick={() => {
              const d = new Date(timelineDate); d.setMonth(d.getMonth() + 6);
              setTimelineDate(d.toISOString().split('T')[0]);
            }}><IconChevronRight size={16} /></button>
          </div>

          <div className="timeline-track-container flex-1">
            <div className="text-[10px] font-mono text-gray-dim uppercase mb-2 flex justify-between">
              <span>Timeline: 2019 — 2026 · Drag both nodes freely</span>
              <span className="text-accent-blue">{yearsDiff()} years apart</span>
            </div>

            <div
              id="compare-timeline-track"
              className="timeline-track mb-6"
              style={{ position: 'relative', width: '100%', height: '6px', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '9999px', marginTop: '8px' }}
              onPointerMove={handleTimelinePointerMove}
              onPointerUp={handleTimelinePointerUp}
              onPointerLeave={handleTimelinePointerUp}
            >
              {/* Filled range between dots */}
              <div style={{ position: 'absolute', top: 0, height: '100%', left: `${getPercentage(baselineDate)}%`, right: `${100 - getPercentage(timelineDate)}%`, background: 'linear-gradient(90deg, rgba(156,163,175,0.3), rgba(37,99,235,0.4))', borderRadius: '9999px', pointerEvents: 'none' }}></div>

              {/* Year ticks */}
              {[2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map(y => {
                const pct = getPercentage(`${y}-01-01`);
                return (
                  <div key={y} style={{ position: 'absolute', top: '-3px', left: `${pct}%`, width: '1px', height: '12px', backgroundColor: 'rgba(255,255,255,0.12)', pointerEvents: 'none' }}>
                    <div style={{ position: 'absolute', top: '18px', left: '50%', transform: 'translateX(-50%)', fontSize: '8px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.2)' }}>{y}</div>
                  </div>
                );
              })}

              {/* BEFORE dot (gray, draggable) */}
              <div
                className="cursor-ew-resize hover:scale-125 transition-transform"
                style={{ position: 'absolute', top: '50%', left: `${getPercentage(baselineDate)}%`, transform: 'translate(-50%, -50%)', width: '16px', height: '16px', backgroundColor: '#9ca3af', borderRadius: '50%', border: '3px solid #111', zIndex: draggingDot === 'baseline' ? 20 : 10 }}
                onPointerDown={(e) => handleTimelinePointerDown(e, 'baseline')}
              ></div>

              {/* AFTER dot (blue, draggable) */}
              <div
                className="cursor-ew-resize hover:scale-125 transition-transform"
                style={{ position: 'absolute', top: '50%', left: `${getPercentage(timelineDate)}%`, transform: 'translate(-50%, -50%)', width: '16px', height: '16px', backgroundColor: '#2563eb', borderRadius: '50%', border: '3px solid #111', zIndex: draggingDot === 'current' ? 20 : 11, boxShadow: '0 0 10px rgba(37,99,235,0.7)' }}
                onPointerDown={(e) => handleTimelinePointerDown(e, 'current')}
              ></div>

              {/* BEFORE label */}
              <div className="whitespace-nowrap pointer-events-none" style={{ position: 'absolute', top: '22px', left: `${getPercentage(baselineDate)}%`, transform: 'translateX(-50%)', fontSize: '9px', fontFamily: 'monospace', color: '#9ca3af' }}>
                {formatDisplayDate(baselineDate)}
              </div>
              {/* AFTER label */}
              <div className="whitespace-nowrap font-bold pointer-events-none" style={{ position: 'absolute', top: '22px', left: `${getPercentage(timelineDate)}%`, transform: 'translateX(-50%)', fontSize: '9px', fontFamily: 'monospace', color: 'white' }}>
                {formatDisplayDate(timelineDate)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RESULTS PANEL */}
      <AnimatePresence>
        {analysisState === 'processing' && (
          <motion.div className="compare-result-panel glass-panel" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
            <div className="flex items-center gap-3 text-white text-sm">
              <div className="w-4 h-4 border-2 border-accent-blue border-t-transparent rounded-full animate-spin"></div>
              Querying Earth Engine...
            </div>
            <div className="text-[10px] text-gray-dim mt-2 font-mono">Comparing {formatDisplayDate(baselineDate)} vs {formatDisplayDate(timelineDate)}</div>
          </motion.div>
        )}

        {analysisState === 'error' && (
          <motion.div className="compare-result-panel glass-panel border border-red-500/50" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
            <div className="text-red-400 font-bold mb-2 flex items-center gap-2 text-sm"><XCircle size={16} /> ERROR</div>
            <div className="text-sm text-gray">{apiResult?.message}</div>
          </motion.div>
        )}

        {analysisState === 'invalid' && (
          <motion.div className="compare-result-panel glass-panel border border-warning/50" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
            <div className="text-warning font-bold mb-2 flex items-center gap-2 text-sm"><AlertTriangle size={16} /> INVALID</div>
            <div className="text-sm text-gray">{apiResult?.message}</div>
          </motion.div>
        )}

        {analysisState === 'insufficient' && (
          <motion.div className="compare-result-panel glass-panel border border-warning/30" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
            <div className="text-warning font-bold mb-2 flex items-center gap-2 text-sm"><AlertTriangle size={16} /> INSUFFICIENT DATA</div>
            <div className="text-sm text-gray">{apiResult?.message}</div>
          </motion.div>
        )}

        {analysisState === 'success' && apiResult && (
          <motion.div className="compare-result-panel glass-panel border border-green-500/20" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} style={{ maxHeight: '80vh', overflowY: 'auto' }}>

            <div className="text-green-400 font-bold mb-3 flex items-center gap-2 text-xs uppercase">
              <CheckCircle size={14} /> Analysis Complete
              {apiResult.executionTimeMs && <span className="text-gray-dim font-normal ml-auto">{(apiResult.executionTimeMs / 1000).toFixed(1)}s</span>}
            </div>

            {/* Date comparison */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '8px', alignItems: 'center', marginBottom: '14px', padding: '10px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '9px', color: '#6b7280', textTransform: 'uppercase' }}>Before</div>
                <div style={{ fontSize: '13px', color: 'white', fontWeight: 700 }}>{apiResult.baseline.actualDate}</div>
                {apiResult.baseline.offsetDays !== 0 && <div style={{ fontSize: '9px', color: '#f59e0b' }}>offset: {apiResult.baseline.offsetDays > 0 ? '+' : ''}{apiResult.baseline.offsetDays}d</div>}
              </div>
              <ArrowRight size={16} style={{ color: '#2563eb' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '9px', color: '#2563eb', textTransform: 'uppercase' }}>After</div>
                <div style={{ fontSize: '13px', color: 'white', fontWeight: 700 }}>{apiResult.current.actualDate}</div>
                {apiResult.current.offsetDays !== 0 && <div style={{ fontSize: '9px', color: '#f59e0b' }}>offset: {apiResult.current.offsetDays > 0 ? '+' : ''}{apiResult.current.offsetDays}d</div>}
              </div>
            </div>

            {/* Calculations */}
            {apiResult.analysis && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', marginBottom: '8px', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
                  Calculations — {apiResult.analysis.type === 'spectral_change' ? 'Spectral Change' : apiResult.analysis.type}
                </div>

                {apiResult.analysis.type === 'spectral_change' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <div style={{ padding: '10px', backgroundColor: 'rgba(37,99,235,0.08)', borderRadius: '8px', border: '1px solid rgba(37,99,235,0.15)' }}>
                      <div style={{ fontSize: '9px', color: '#6b7280', textTransform: 'uppercase', fontFamily: 'monospace' }}>Mean Distance</div>
                      <div style={{ fontSize: '18px', color: 'white', fontWeight: 700, fontFamily: 'monospace' }}>{apiResult.analysis.meanSpectralDistance}</div>
                    </div>
                    <div style={{ padding: '10px', backgroundColor: 'rgba(37,99,235,0.08)', borderRadius: '8px', border: '1px solid rgba(37,99,235,0.15)' }}>
                      <div style={{ fontSize: '9px', color: '#6b7280', textTransform: 'uppercase', fontFamily: 'monospace' }}>Median</div>
                      <div style={{ fontSize: '18px', color: 'white', fontWeight: 700, fontFamily: 'monospace' }}>{apiResult.analysis.medianSpectralDistance}</div>
                    </div>
                    <div style={{ padding: '10px', backgroundColor: apiResult.analysis.affectedPercent > 50 ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)', borderRadius: '8px', border: `1px solid ${apiResult.analysis.affectedPercent > 50 ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}` }}>
                      <div style={{ fontSize: '9px', color: '#6b7280', textTransform: 'uppercase', fontFamily: 'monospace' }}>Changed Area</div>
                      <div style={{ fontSize: '16px', color: apiResult.analysis.affectedPercent > 50 ? '#ef4444' : '#22c55e', fontWeight: 700, fontFamily: 'monospace' }}>{apiResult.analysis.affectedAreaKm2} km²</div>
                      <div style={{ fontSize: '9px', color: '#9ca3af', fontFamily: 'monospace' }}>{apiResult.analysis.affectedPercent}% of ROI</div>
                    </div>
                    <div style={{ padding: '10px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '9px', color: '#6b7280', textTransform: 'uppercase', fontFamily: 'monospace' }}>ROI Area</div>
                      <div style={{ fontSize: '16px', color: 'white', fontWeight: 700, fontFamily: 'monospace' }}>{apiResult.analysis.roiAreaKm2} km²</div>
                      <div style={{ fontSize: '9px', color: '#9ca3af', fontFamily: 'monospace' }}>Threshold: {apiResult.analysis.changeThreshold}</div>
                    </div>
                  </div>
                )}

                {apiResult.analysis.type === 'NDVI' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <div style={{ padding: '10px', backgroundColor: 'rgba(34,197,94,0.08)', borderRadius: '8px', border: '1px solid rgba(34,197,94,0.15)' }}>
                      <div style={{ fontSize: '9px', color: '#6b7280', textTransform: 'uppercase', fontFamily: 'monospace' }}>Before NDVI</div>
                      <div style={{ fontSize: '18px', color: '#22c55e', fontWeight: 700, fontFamily: 'monospace' }}>{apiResult.analysis.baselineValue}</div>
                    </div>
                    <div style={{ padding: '10px', backgroundColor: 'rgba(34,197,94,0.08)', borderRadius: '8px', border: '1px solid rgba(34,197,94,0.15)' }}>
                      <div style={{ fontSize: '9px', color: '#6b7280', textTransform: 'uppercase', fontFamily: 'monospace' }}>After NDVI</div>
                      <div style={{ fontSize: '18px', color: '#22c55e', fontWeight: 700, fontFamily: 'monospace' }}>{apiResult.analysis.currentValue}</div>
                    </div>
                    <div style={{ padding: '10px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '9px', color: '#6b7280', textTransform: 'uppercase', fontFamily: 'monospace' }}>Difference</div>
                      <div style={{ fontSize: '16px', color: apiResult.analysis.difference > 0 ? '#22c55e' : '#ef4444', fontWeight: 700, fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {apiResult.analysis.difference > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        {apiResult.analysis.difference > 0 ? '+' : ''}{apiResult.analysis.difference}
                      </div>
                    </div>
                    <div style={{ padding: '10px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '9px', color: '#6b7280', textTransform: 'uppercase', fontFamily: 'monospace' }}>Changed Area</div>
                      <div style={{ fontSize: '16px', color: 'white', fontWeight: 700, fontFamily: 'monospace' }}>{apiResult.analysis.affectedAreaKm2} km²</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Quality bar */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', fontSize: '9px', fontFamily: 'monospace' }}>
              <div style={{ flex: 1, padding: '5px 8px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                <span style={{ color: '#6b7280' }}>BEFORE PX </span><span style={{ color: '#22c55e' }}>{apiResult.baseline.validPixelPercentage}%</span>
              </div>
              <div style={{ flex: 1, padding: '5px 8px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                <span style={{ color: '#6b7280' }}>AFTER PX </span><span style={{ color: '#22c55e' }}>{apiResult.current.validPixelPercentage}%</span>
              </div>
            </div>

            {/* Evidence */}
            <button style={{ width: '100%', padding: '8px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: 'white', fontSize: '10px', fontFamily: 'monospace', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }} onClick={() => setShowEvidence(!showEvidence)}>
              {showEvidence ? 'HIDE' : 'VIEW'} EVIDENCE <IconChevronRight size={12} style={{ transform: showEvidence ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>

            <AnimatePresence>
              {showEvidence && apiResult.evidence && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: '9px', fontFamily: 'monospace', color: '#9ca3af', overflow: 'hidden' }}>
                  <div style={{ marginBottom: '4px' }}><span style={{ color: '#4b5563' }}>BEFORE IMAGE: </span><span style={{ color: 'white', wordBreak: 'break-all', fontSize: '8px' }}>{apiResult.evidence.baselineImageId}</span></div>
                  <div style={{ marginBottom: '4px' }}><span style={{ color: '#4b5563' }}>AFTER IMAGE: </span><span style={{ color: 'white', wordBreak: 'break-all', fontSize: '8px' }}>{apiResult.evidence.currentImageId}</span></div>
                  <div style={{ marginBottom: '4px' }}><span style={{ color: '#4b5563' }}>METHOD: </span><span style={{ color: 'white' }}>{apiResult.evidence.analysisMethod}</span></div>
                  <div style={{ marginBottom: '4px' }}><span style={{ color: '#4b5563' }}>SOURCE: </span><span style={{ color: 'white' }}>{apiResult.evidence.source}</span></div>
                  <div style={{ marginBottom: '4px' }}><span style={{ color: '#4b5563' }}>CLOUD MASK: </span><span style={{ color: 'white' }}>{apiResult.quality?.cloudMaskMethod}</span></div>
                  <div style={{ marginBottom: '4px' }}><span style={{ color: '#4b5563' }}>ROI: </span><span style={{ color: 'white' }}>{apiResult.evidence.roiAreaKm2} km²</span></div>
                  {apiResult.requestId && <div><span style={{ color: '#4b5563' }}>ID: </span><span style={{ color: 'white' }}>{apiResult.requestId}</span></div>}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
