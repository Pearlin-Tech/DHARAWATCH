import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, ArrowUp, X, CheckCircle2, CircleDashed,
  Map as MapIcon, Minus, Plus, Crosshair, AlertTriangle,
  ShieldCheck, Layers, Compass, HelpCircle as HelpIcon,
  ChevronDown, ChevronUp, BookOpen, Cpu, Paperclip, Upload,
  MapPin, Sparkles, GripVertical, Square, RotateCcw
} from 'lucide-react';
import AppNavigation from '../../components/AppNavigation';
import MapViewport from '../../components/MapViewport';
import { aiService } from '../../services/aiService';
import { validateGeoTiffFile, processClientGeoTiff } from '../../utils/geotiffClient';
import './Ask.css';

function useDraggableResizable(initialPos, initialSize) {
  const [pos, setPos] = useState(initialPos);
  const [size, setSize] = useState(initialSize);
  const dragging = useRef(false);
  const resizing = useRef(false);
  const startRef = useRef({});

  const onDragStart = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragging.current = true;
    startRef.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
    const onMove = (ev) => {
      if (!dragging.current) return;
      setPos({ x: startRef.current.px + (ev.clientX - startRef.current.mx), y: startRef.current.py + (ev.clientY - startRef.current.my) });
    };
    const onUp = () => { dragging.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [pos]);

  const onResizeStart = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    resizing.current = true;
    startRef.current = { mx: e.clientX, my: e.clientY, w: size.w, h: size.h };
    const onMove = (ev) => {
      if (!resizing.current) return;
      setSize({ w: Math.max(320, startRef.current.w + (ev.clientX - startRef.current.mx)), h: Math.max(200, startRef.current.h + (ev.clientY - startRef.current.my)) });
    };
    const onUp = () => { resizing.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [size]);

  return { pos, size, onDragStart, onResizeStart };
}

const METRIC_LABELS = {
  roiAreaKm2: 'ROI Area', affectedAreaKm2: 'Affected Area',
  affectedPercent: 'Affected Share', changePercentage: 'Change Shift',
  baselineIndexValue: 'Baseline Index Value', targetIndexValue: 'Target Index Value',
  indexDelta: 'Index Delta', affectedArea: 'Affected Area',
  shareOfSelectedArea: 'Share of Selected Area', measurementChange: 'Measurement Change',
  candidateCount: 'Candidate Zones', candidateZones: 'Candidate Zones',
  visibleArea: 'Visible Area', hectares: 'Hectares', elevation: 'Elevation',
  totalArea: 'Total Area', diagonalDistance: 'Diagonal Distance',
  satellitePasses: 'Satellite Passes', imageDetail: 'Image Resolution',
  cloudCover: 'Cloud Cover', satelliteRevisit: 'Satellite Revisit',
  overallShift: 'Overall Shift', viewportAreaKm2: 'Viewport Area',
  totalScenesFound: 'Total Scenes Found', resolution: 'Spatial Resolution',
  changeMagnitude: 'Change Shift'
};

const fmtLabel = (key) => {
  if (!key) return '';
  if (METRIC_LABELS[key]) return METRIC_LABELS[key];
  return key.replace(/([A-Z])/g, ' $1').replace(/([0-9]+)/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase()).replace(/ Km 2/gi, ' (km²)').trim();
};

export default function Ask() {
  const routerLocation = useLocation();
  const navigate = useNavigate();
  const initialCoords = routerLocation.state?.coords || { lng: 72.5714, lat: 23.0225 };
  const [mode, setMode] = useState(() => localStorage.getItem('satquery_ai_mode') || 'explorer');
  const [selectedLocation, setSelectedLocation] = useState(() =>
    routerLocation.state?.selectedLocation ||
    (routerLocation.state?.entryPoint === 'selected_location' ? routerLocation.state?.coords : null));
  const [entryPoint, setEntryPoint] = useState(() => routerLocation.state?.entryPoint || 'direct_navigation');
  const [dataset] = useState(() => routerLocation.state?.dataset || 'Sentinel-2');
  const [selectedDate] = useState(() => routerLocation.state?.selectedDate || '24 Sep 2026');
  const [hoverCoords, setHoverCoords] = useState(null);
  const [markerCoords, setMarkerCoords] = useState(initialCoords);
  const [query, setQuery] = useState('');

  // drawMode: 'idle' | 'drawing' | 'drawn'
  const [drawMode, setDrawMode] = useState('idle');
  const [drawStart, setDrawStart] = useState(null);
  const [drawEnd, setDrawEnd] = useState(null);
  const [drawnBounds, setDrawnBounds] = useState(null);
  const drawingRef = useRef(false);

  const [flowState, setFlowState] = useState('idle');
  const [result, setResult] = useState(null);
  const [showEvidence, setShowEvidence] = useState(false);
  const [showTechDetails, setShowTechDetails] = useState(false);
  const [expandedLearnItem, setExpandedLearnItem] = useState(null);
  const [history, setHistory] = useState([]);
  const [mapInstance, setMapInstance] = useState(null);

  const [attachmentState, setAttachmentState] = useState('IDLE');
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [attachmentMeta, setAttachmentMeta] = useState(null);
  const [attachmentError, setAttachmentError] = useState(null);
  const [isFileDragging, setIsFileDragging] = useState(false);

  const startDrawMode = () => {
    setDrawMode('drawing');
    setDrawStart(null);
    setDrawEnd(null);
    setDrawnBounds(null);
  };

  const cancelDraw = useCallback(() => {
    setDrawMode('idle');
    setDrawStart(null);
    setDrawEnd(null);
    setDrawnBounds(null);
    if (mapInstance) {
      try {
        if (mapInstance.getLayer('draw-fill')) mapInstance.removeLayer('draw-fill');
        if (mapInstance.getLayer('draw-outline')) mapInstance.removeLayer('draw-outline');
        if (mapInstance.getSource('draw-area')) mapInstance.removeSource('draw-area');
      } catch (_) {}
    }
  }, [mapInstance]);

  const pixelRectToGeoBounds = useCallback((x1, y1, x2, y2) => {
    if (!mapInstance) return null;
    const rect = mapInstance.getContainer().getBoundingClientRect();
    const sw = mapInstance.unproject([Math.min(x1, x2) - rect.left, Math.max(y1, y2) - rect.top]);
    const ne = mapInstance.unproject([Math.max(x1, x2) - rect.left, Math.min(y1, y2) - rect.top]);
    return { west: sw.lng, south: sw.lat, east: ne.lng, north: ne.lat };
  }, [mapInstance]);

  const renderDrawBox = useCallback((bounds) => {
    if (!mapInstance || !bounds) return;
    const { west, south, east, north } = bounds;
    const data = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] } };
    try {
      if (mapInstance.getSource('draw-area')) {
        mapInstance.getSource('draw-area').setData(data);
      } else {
        mapInstance.addSource('draw-area', { type: 'geojson', data });
        mapInstance.addLayer({ id: 'draw-fill', type: 'fill', source: 'draw-area', paint: { 'fill-color': '#00F0FF', 'fill-opacity': 0.15 } });
        mapInstance.addLayer({ id: 'draw-outline', type: 'line', source: 'draw-area', paint: { 'line-color': '#00F0FF', 'line-width': 2.5, 'line-dasharray': [5, 3] } });
      }
    } catch (_) {}
  }, [mapInstance]);

  const handleMapMouseDown = useCallback((e) => {
    if (drawMode !== 'drawing') return;
    e.preventDefault();
    drawingRef.current = true;
    setDrawStart({ x: e.clientX, y: e.clientY });
    setDrawEnd({ x: e.clientX, y: e.clientY });
  }, [drawMode]);

  const handleMapMouseMove = useCallback((e) => {
    if (!drawingRef.current) return;
    setDrawEnd({ x: e.clientX, y: e.clientY });
  }, []);

  const handleMapMouseUp = useCallback((e) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const endPt = { x: e.clientX, y: e.clientY };
    setDrawStart(prev => {
      if (!prev) return prev;
      const dx = Math.abs(endPt.x - prev.x);
      const dy = Math.abs(endPt.y - prev.y);
      if (dx > 20 && dy > 20) {
        const bounds = pixelRectToGeoBounds(prev.x, prev.y, endPt.x, endPt.y);
        if (bounds) {
          setDrawnBounds(bounds);
          setDrawMode('drawn');
          renderDrawBox(bounds);
          if (mapInstance) {
            mapInstance.fitBounds([[bounds.west, bounds.south], [bounds.east, bounds.north]], { padding: 80, duration: 700 });
          }
        }
      } else {
        setDrawMode('drawing');
      }
      return prev;
    });
    setDrawEnd(endPt);
  }, [pixelRectToGeoBounds, renderDrawBox, mapInstance]);

  useEffect(() => {
    if (drawMode !== 'drawing') return;
    window.addEventListener('mouseup', handleMapMouseUp);
    window.addEventListener('mousemove', handleMapMouseMove);
    return () => {
      window.removeEventListener('mouseup', handleMapMouseUp);
      window.removeEventListener('mousemove', handleMapMouseMove);
    };
  }, [drawMode, handleMapMouseUp, handleMapMouseMove]);

  const handleFileSelect = async (file) => {
    if (!file) return;
    setAttachmentError(null); setAttachmentState('VALIDATING');
    const val = validateGeoTiffFile(file);
    if (!val.valid) { setAttachmentError(val.error); setAttachmentState('ERROR'); return; }
    try {
      setAttachmentState('PROCESSING');
      const clientMeta = await processClientGeoTiff(file);
      setAttachmentState('UPLOADING');
      const uploadRes = await aiService.uploadRaster(file);
      setAttachmentMeta({ ...clientMeta, ...uploadRes.metadata, attachmentId: uploadRes.attachmentId, filename: uploadRes.filename, sizeMb: uploadRes.sizeMb });
      setAttachmentFile(file);
      setAttachmentState('READY');
    } catch (err) {
      setAttachmentError(err.message || 'Could not read TIFF file.');
      setAttachmentState('ERROR');
    }
  };
  const clearAttachment = () => { setAttachmentState('IDLE'); setAttachmentFile(null); setAttachmentMeta(null); setAttachmentError(null); };
  const handleModeChange = (m) => { setMode(m); localStorage.setItem('satquery_ai_mode', m); };

  const executeAskQuery = async (questionText) => {
    if (!questionText) return;
    setFlowState('understanding');
    try {
      await new Promise(r => setTimeout(r, 200));
      setFlowState('analysing');
      const mapBounds = mapInstance ? (() => { const b = mapInstance.getBounds(); return { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() }; })() : null;
      const mapContext = {
        center: { lat: markerCoords.lat, lon: markerCoords.lng ?? markerCoords.lon },
        zoom: mapInstance ? mapInstance.getZoom() : 13,
        bounds: drawnBounds || mapBounds,
        drawnArea: drawnBounds || null
      };
      await new Promise(r => setTimeout(r, 200));
      setFlowState('verifying');
      const resData = await aiService.ask({
        question: questionText, mapContext, mode, history,
        attachment: attachmentMeta ? { attachmentId: attachmentMeta.attachmentId, filename: attachmentMeta.filename } : null,
        selectedLocation: selectedLocation ? { lat: selectedLocation.lat, lon: selectedLocation.lon || selectedLocation.lng } : null,
        entryPoint, dataset, selectedDate
      });
      setFlowState('ready');
      setResult(resData);
      setHistory(prev => [...prev, { question: questionText, analysisType: resData.analysisType, result: resData }]);
      
      if (resData.location && mapInstance) mapInstance.flyTo({ center: [resData.location.lon, resData.location.lat], zoom: 13, duration: 1500 });
    } catch (err) {
      console.error('Ask error:', err);
      setFlowState('ready');
      setResult({ status: 'ERROR', title: 'Backend Offline', answer: 'Cannot reach backend. Run `node server.js`.', evidence: [], sources: [] });
    }
  };

  const resetFlow = useCallback(() => {
    setFlowState('idle'); setResult(null); setQuery(''); setShowEvidence(false);
    setDrawMode('idle'); setDrawnBounds(null); setDrawStart(null); setDrawEnd(null);
    if (mapInstance) {
      ['ai-result-fill', 'ai-result-outline', 'draw-fill', 'draw-outline'].forEach(l => { try { mapInstance.removeLayer(l); } catch (_) {} });
      ['ai-result', 'draw-area'].forEach(s => { try { mapInstance.removeSource(s); } catch (_) {} });
    }
  }, [mapInstance]);

  const highlightMapResult = () => {
    if (result?.location && mapInstance) mapInstance.flyTo({ center: [result.location.lon, result.location.lat], zoom: 14, duration: 1500 });
  };

  const overlayRasterOnMap = () => {
    if (!result?.overlayCoordinates || !mapInstance) return;
    try {
      const imageUrl = result.attachment?.metadata?.previewUrl || result.attachment?.metadata?.previewDataUrl;
      ['uploaded-raster-layer'].forEach(l => { try { mapInstance.removeLayer(l); } catch (_) {} });
      ['uploaded-raster-source'].forEach(s => { try { mapInstance.removeSource(s); } catch (_) {} });
      if (imageUrl) {
        mapInstance.addSource('uploaded-raster-source', { type: 'image', url: imageUrl, coordinates: result.overlayCoordinates });
        mapInstance.addLayer({ id: 'uploaded-raster-layer', type: 'raster', source: 'uploaded-raster-source', paint: { 'raster-opacity': 0.85 } });
      }
      const c = result.overlayCoordinates;
      mapInstance.fitBounds([[c[0][0], c[2][1]], [c[1][0], c[0][1]]], { padding: 80, duration: 2000 });
    } catch (_) {}
  };

  const activeView = result ? (mode === 'expert' ? (result.expert || result) : (result.explorer || result)) : null;

  const drawRect = drawStart && drawEnd ? {
    left: Math.min(drawStart.x, drawEnd.x), top: Math.min(drawStart.y, drawEnd.y),
    width: Math.abs(drawEnd.x - drawStart.x), height: Math.abs(drawEnd.y - drawStart.y),
  } : null;

  return (
    <div className="ask-container">
      <AppNavigation />
      <MapViewport
        center={[initialCoords.lng, initialCoords.lat]} zoom={13}
        hoverCoords={hoverCoords} setHoverCoords={setHoverCoords}
        markerCoords={markerCoords}
        onMapClick={(coords) => {
          if (drawMode === 'drawing' || drawMode === 'drawn') return;
          setMarkerCoords(coords);
          setSelectedLocation({ lat: coords.lat, lon: coords.lng });
          setEntryPoint('selected_location');
        }}
        onMapLoad={setMapInstance}
      >
        {/* TOP STATUS BAR */}
        <div className="ask-top-bar glass-panel text-xs font-mono text-gray">
          <div className="flex items-center gap-4">
            <span><div className="indicator mr-2" style={{ backgroundColor: 'var(--accent-blue)', display:'inline-block', width:8, height:8, borderRadius:'50%' }} />Sentinel-2 / Landsat Pass</span>
            <span className="text-gray-dim">10m GSD</span>
          </div>
          <div className="flex items-center bg-black/60 p-1 rounded-lg border border-white/10 gap-1 font-sans">
            <button className={`px-3 py-1 rounded text-xs font-semibold transition-all flex items-center gap-1.5 ${mode === 'explorer' ? 'bg-accent-blue text-black font-bold' : 'text-gray hover:text-white'}`} onClick={() => handleModeChange('explorer')}><Compass size={13} /> Explorer</button>
            <button className={`px-3 py-1 rounded text-xs font-semibold transition-all flex items-center gap-1.5 ${mode === 'expert' ? 'bg-accent-blue text-black font-bold' : 'text-gray hover:text-white'}`} onClick={() => handleModeChange('expert')}><Cpu size={13} /> Expert</button>
          </div>
          <div className="flex items-center gap-4">
            <span>LAT: {markerCoords.lat.toFixed(4)}°</span>
            <span>LON: {markerCoords.lng.toFixed(4)}°</span>
          </div>
        </div>

        {/* MAP CONTROLS */}
        <div className="map-controls">
          <button className="control-btn glass-panel" onClick={() => mapInstance?.zoomIn()}><Plus size={18} /></button>
          <button className="control-btn glass-panel" onClick={() => mapInstance?.zoomOut()}><Minus size={18} /></button>
          <button className="control-btn glass-panel mt-2" onClick={() => mapInstance?.flyTo({ center: [initialCoords.lng, initialCoords.lat] })}><Crosshair size={18} /></button>
        </div>

        {/* LIVE DRAW RECT */}
        {drawMode === 'drawing' && drawRect && drawRect.width > 5 && (
          <div style={{ position: 'fixed', pointerEvents: 'none', zIndex: 35, left: drawRect.left, top: drawRect.top, width: drawRect.width, height: drawRect.height, border: '2px dashed #00F0FF', background: 'rgba(0,240,255,0.08)' }} />
        )}

        {/* DRAW CURSOR OVERLAY */}
        {drawMode === 'drawing' && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 30, cursor: 'crosshair' }} onMouseDown={handleMapMouseDown} />
        )}

        {/* BOTTOM CENTER */}
        <div className="ask-bottom-center">
          <AnimatePresence mode="wait">

            {/* IDLE: invite to draw */}
            {flowState === 'idle' && drawMode === 'idle' && (
              <motion.div key="draw-invite" className="draw-invite glass-panel"
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} transition={{ duration: 0.3 }}>
                <div className="draw-invite-icon"><Square size={26} className="text-accent-blue" strokeWidth={1.5} /></div>
                <div className="flex-1">
                  <div className="text-sm font-bold text-white mb-0.5">Draw an area to analyze</div>
                  <div className="text-xs text-gray-dim">Click and drag on the map to select a region, then ask your question</div>
                </div>
                <button className="btn-primary draw-start-btn" onClick={startDrawMode}><Square size={14} /> Draw Area</button>
              </motion.div>
            )}

            {/* DRAWING: show hint */}
            {flowState === 'idle' && drawMode === 'drawing' && (
              <motion.div key="draw-hint" className="draw-hint glass-panel"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div className="flex items-center gap-3">
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#00F0FF' }} className="animate-pulse" />
                  <span className="text-sm font-mono text-white">Click and drag on the map to draw your area of interest</span>
                </div>
                <button className="text-xs text-gray hover:text-white flex items-center gap-1 ml-4" onClick={cancelDraw}><X size={13} /> Cancel</button>
              </motion.div>
            )}

            {/* DRAWN: query input */}
            {flowState === 'idle' && drawMode === 'drawn' && (
              <motion.div key="query-composer" className={`query-composer glass-panel ${isFileDragging ? 'drag-active' : ''}`}
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.3 }}
                onDragOver={(e) => { e.preventDefault(); setIsFileDragging(true); }}
                onDragLeave={() => setIsFileDragging(false)}
                onDrop={(e) => { e.preventDefault(); setIsFileDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handleFileSelect(f); }}>
                {isFileDragging && <div className="drop-overlay"><Upload size={22} className="animate-bounce" /> Drop GeoTIFF Here</div>}

                {/* AREA CHIP */}
                {drawnBounds && (
                  <div className="area-chip">
                    <Square size={11} className="text-accent-blue" />
                    <span className="text-accent-blue font-mono font-bold text-xs">Area Selected</span>
                    <span className="text-gray-dim">·</span>
                    <span className="text-gray font-mono text-[10px]">
                      {Math.abs(drawnBounds.north - drawnBounds.south).toFixed(3)}° × {Math.abs(drawnBounds.east - drawnBounds.west).toFixed(3)}°
                    </span>
                    <button className="ml-auto text-gray hover:text-white" onClick={cancelDraw} title="Redraw area"><RotateCcw size={11} /></button>
                  </div>
                )}

                {/* LOCATION CHIP */}
                {selectedLocation && (
                  <div className="flex items-center justify-between bg-black/60 px-3 py-1.5 rounded-lg border border-accent-blue/30 mb-2.5 text-xs font-mono">
                    <div className="flex items-center gap-2 text-white truncate">
                      <span className="flex items-center gap-1 text-accent-blue font-bold"><MapPin size={12} /> {selectedLocation.lat.toFixed(4)}° N, {(selectedLocation.lon || selectedLocation.lng).toFixed(4)}° E</span>
                      <span className="text-gray-dim">·</span>
                      <span className="text-gray flex items-center gap-1"><Sparkles size={10} className="text-accent-blue" /> {dataset}</span>
                      <span className="text-gray-dim">·</span>
                      <span className="text-gray">{selectedDate}</span>
                    </div>
                    <button className="text-gray hover:text-white p-0.5 ml-2" onClick={() => setSelectedLocation(null)}><X size={12} /></button>
                  </div>
                )}

                {/* ATTACHMENT */}
                {attachmentMeta && (
                  <div className="attached-file-badge">
                    {attachmentMeta.previewUrl ? <img src={attachmentMeta.previewUrl} alt="preview" className="attachment-thumb" /> : <div className="attachment-icon-fallback">TIFF</div>}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-white truncate text-xs">{attachmentMeta.filename}</div>
                      <div className="text-[10px] text-gray-dim flex items-center gap-2">
                        <span>{attachmentMeta.sizeMb} MB</span><span>·</span><span>{attachmentMeta.dimensions || '4 Bands'}</span><span>·</span>
                        <span className="text-accent-blue font-bold">{attachmentMeta.isGeoreferenced !== false ? 'GeoTIFF' : 'TIFF (No CRS)'}</span>
                      </div>
                    </div>
                    <button onClick={clearAttachment} className="text-gray hover:text-white p-1"><X size={13} /></button>
                  </div>
                )}
                {attachmentState === 'VALIDATING' && <div className="text-xs text-accent-blue animate-pulse mb-1 font-mono">Checking TIFF header…</div>}
                {attachmentState === 'PROCESSING' && <div className="text-xs text-accent-blue animate-pulse mb-1 font-mono">Reading raster metadata…</div>}
                {attachmentState === 'UPLOADING' && <div className="text-xs text-accent-blue animate-pulse mb-1 font-mono">Uploading GeoTIFF…</div>}
                {attachmentError && <div className="text-xs text-amber-400 mb-1 font-mono">{attachmentError}</div>}

                <form onSubmit={(e) => { e.preventDefault(); if (query.trim()) executeAskQuery(query.trim()); }} className="query-form">
                  <label htmlFor="geotiff-upload-input" className="attach-btn" title="Upload GeoTIFF"><Paperclip size={17} /></label>
                  <input id="geotiff-upload-input" type="file" accept=".tif,.tiff,.geotiff" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])} />
                  <Search size={19} className="text-accent-blue flex-shrink-0" />
                  <input type="text" placeholder={attachmentMeta ? "Ask about this image…" : "What changed in this area?"} value={query} onChange={(e) => setQuery(e.target.value)} className="query-input" style={{ minWidth: 0 }} autoFocus />
                  <button type="submit" className="btn-primary ask-submit-btn flex-shrink-0" disabled={(!query.trim() && !attachmentMeta) || attachmentState === 'UPLOADING' || attachmentState === 'PROCESSING'}>
                    Analyze <ArrowUp size={15} className="ml-1" />
                  </button>
                </form>

                <div className="suggested-prompts">
                  {['What changed here?', 'Find water expansion', 'Check vegetation health', 'Detect new infrastructure'].map(p => (
                    <button key={p} type="button" className="prompt-pill" onClick={() => { setQuery(p); executeAskQuery(p); }}>{p}</button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ANALYSING */}
            {flowState !== 'idle' && flowState !== 'ready' && (
              <motion.div key="loading" className="analysis-progress glass-panel"
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div className="progress-steps text-xs font-mono">
                  {[['understanding','Understanding'],['analysing','Analysing'],['verifying','Verifying'],['ready','Ready']].map(([s, label], i, arr) => {
                    const order = ['understanding','analysing','verifying','ready'];
                    const cur = order.indexOf(flowState);
                    const mine = order.indexOf(s);
                    return (
                      <React.Fragment key={s}>
                        <div className={`step ${cur === mine ? 'active' : mine < cur ? 'complete' : 'pending'}`}>
                          {cur === mine ? <CircleDashed size={13} className="animate-spin text-accent-blue" /> : mine < cur ? <CheckCircle2 size={13} className="text-success-mint" /> : <CircleDashed size={13} className="text-gray-dim" />}
                          {label}
                        </div>
                        {i < arr.length - 1 && <div className="step-divider">/</div>}
                      </React.Fragment>
                    );
                  })}
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* RESULT PANEL — draggable + resizable */}
        {flowState === 'ready' && result?.status === 'VERIFIED' && activeView && (
          <ResultPanel
            activeView={activeView} result={result} mode={mode}
            showTechDetails={showTechDetails} setShowTechDetails={setShowTechDetails}
            expandedLearnItem={expandedLearnItem} setExpandedLearnItem={setExpandedLearnItem}
            handleModeChange={handleModeChange} setShowEvidence={setShowEvidence}
            overlayRasterOnMap={overlayRasterOnMap} highlightMapResult={highlightMapResult}
            resetFlow={resetFlow} executeAskQuery={executeAskQuery}
          />
        )}

        {/* ERROR PANEL */}
        <AnimatePresence>
          {flowState === 'ready' && (result?.status === 'INSUFFICIENT_DATA' || result?.status === 'UNSUPPORTED' || result?.status === 'ERROR') && (
            <motion.div key="err" style={{ position:'fixed', bottom:120, left:'50%', transform:'translateX(-50%)', width:520, zIndex:50, padding:24 }}
              className="glass-panel" initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}>
              <div className="flex items-center gap-2 mb-3"><AlertTriangle size={17} className="text-warning" /><h3 className="text-sm font-bold text-warning">{result.title || 'Analysis Limit'}</h3></div>
              <p className="text-sm text-gray leading-relaxed mb-4">{result.answer || result.summary}</p>
              <button className="btn-secondary py-2 px-4 text-xs font-bold" onClick={resetFlow}>Draw New Area & Try Again</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* EVIDENCE PANEL */}
        <AnimatePresence>
          {showEvidence && result && <EvidencePanel result={result} onClose={() => setShowEvidence(false)} />}
        </AnimatePresence>

      </MapViewport>
    </div>
  );
}

function ResultPanel({ activeView, result, mode, showTechDetails, setShowTechDetails,
  expandedLearnItem, setExpandedLearnItem, handleModeChange,
  setShowEvidence, overlayRasterOnMap, highlightMapResult, resetFlow, executeAskQuery }) {
  const { pos, size, onDragStart, onResizeStart } = useDraggableResizable(
    { x: Math.max(80, window.innerWidth / 2 - 300), y: Math.max(80, window.innerHeight - 520) },
    { w: 600, h: 460 }
  );
  return (
    <motion.div
      style={{ position:'fixed', left:pos.x, top:pos.y, width:size.w, height:size.h, zIndex:50, display:'flex', flexDirection:'column' }}
      className="result-panel glass-panel"
      initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} transition={{ duration:0.3 }}>
      <div className="drag-handle" onMouseDown={onDragStart}>
        <div className="flex items-center gap-2">
          <GripVertical size={15} className="text-gray-dim" />
          <ShieldCheck size={14} className="text-accent-blue" />
          <span className="text-sm font-bold truncate">{activeView.title || result.title || 'Analysis Result'}</span>
        </div>
        <div className="flex items-center bg-black/60 p-0.5 rounded border border-white/10 gap-0.5">
          <button className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${mode==='explorer'?'bg-accent-blue text-black font-bold':'text-gray hover:text-white'}`} onClick={() => handleModeChange('explorer')}>Explorer</button>
          <button className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${mode==='expert'?'bg-accent-blue text-black font-bold':'text-gray hover:text-white'}`} onClick={() => handleModeChange('expert')}>Expert</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 min-h-0 space-y-4">
        {mode === 'explorer' ? (
          <div className="space-y-4">
            <div><div className="text-xs font-mono text-accent-blue uppercase tracking-wider mb-1 font-bold">WHAT I FOUND</div><p className="text-sm text-white font-medium leading-relaxed bg-accent-blue/5 p-3 rounded border border-accent-blue/20">{activeView.summary}</p></div>
            {activeView.whatChanged && <div><div className="text-xs font-mono text-gray-dim uppercase tracking-wider mb-1">WHAT CHANGED?</div><p className="text-xs text-gray leading-relaxed">{activeView.whatChanged}</p></div>}
            {activeView.where && <div><div className="text-xs font-mono text-gray-dim uppercase tracking-wider mb-1">WHERE?</div><p className="text-xs text-gray leading-relaxed">{activeView.where}</p></div>}
            {activeView.howMuch && (
              <div><div className="text-xs font-mono text-gray-dim uppercase tracking-wider mb-2">HOW MUCH?</div>
                <div className="grid grid-cols-2 gap-2">
                  {typeof activeView.howMuch === 'object' ? Object.entries(activeView.howMuch).map(([k,v]) => (
                    <div key={k} className="bg-black/40 p-2 rounded border border-white/10 text-center"><div className="text-[10px] font-mono text-gray-dim uppercase mb-0.5">{fmtLabel(k)}</div><div className="text-sm font-bold text-white">{v}</div></div>
                  )) : <div className="text-xs text-white font-bold">{activeView.howMuch}</div>}
                </div>
              </div>
            )}
            {activeView.meaning && <div className="bg-black/30 p-3 rounded border border-white/5"><div className="text-xs font-mono text-success-mint font-bold uppercase mb-1">WHAT DOES THIS MEAN?</div><p className="text-xs text-gray leading-relaxed">{activeView.meaning}</p></div>}
            {activeView.whatWeCantTell && <div className="bg-black/30 p-3 rounded border border-white/5"><div className="text-xs font-mono text-warning font-bold uppercase mb-1">WHAT WE CAN'T TELL FOR SURE</div><p className="text-xs text-gray leading-relaxed">{activeView.whatWeCantTell}</p></div>}
            <div className="pt-1">
              <button className="text-xs font-mono text-accent-blue hover:underline flex items-center gap-1" onClick={() => setShowTechDetails(!showTechDetails)}>
                {showTechDetails ? <ChevronUp size={13}/> : <ChevronDown size={13}/>} {showTechDetails ? 'Hide Technical Details' : 'Show Technical Details'}
              </button>
              {showTechDetails && result.metrics && (
                <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }} className="mt-2 p-3 bg-black/50 rounded border border-white/10 font-mono text-xs space-y-1">
                  <div className="text-gray-dim font-bold mb-1">RAW SATELLITE METRICS:</div>
                  {Object.entries(result.metrics).map(([k,v]) => <div key={k} className="flex justify-between"><span className="text-gray-dim">{fmtLabel(k)}:</span><span className="text-white">{v}</span></div>)}
                </motion.div>
              )}
            </div>
            {activeView.learnMore?.length > 0 && (
              <div className="pt-2 border-t border-white/10">
                <div className="text-xs font-mono text-gray-dim uppercase tracking-wider mb-2 flex items-center gap-1"><BookOpen size={12} className="text-accent-blue"/> LEARN AS YOU EXPLORE</div>
                {activeView.learnMore.map((item, idx) => (
                  <div key={idx} className="bg-black/30 rounded border border-white/5 text-xs mb-1.5">
                    <button className="w-full text-left p-2 font-medium flex items-center justify-between text-gray hover:text-white" onClick={() => setExpandedLearnItem(expandedLearnItem===idx?null:idx)}>
                      <span className="flex items-center gap-1.5"><HelpIcon size={11} className="text-accent-blue"/> {item.term}</span>
                      {expandedLearnItem===idx ? <ChevronUp size={11}/> : <ChevronDown size={11}/>}
                    </button>
                    {expandedLearnItem===idx && <div className="px-2.5 pb-2 text-gray-dim text-[11px] leading-relaxed border-t border-white/5 pt-1.5">{item.explanation}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div><div className="text-xs font-mono text-accent-blue uppercase tracking-wider mb-1 font-bold">SUMMARY</div><p className="text-sm text-white font-medium leading-relaxed bg-black/40 p-3 rounded border border-white/10">{activeView.summary}</p></div>
            {activeView.technicalFinding && <div><div className="text-xs font-mono text-gray-dim uppercase tracking-wider mb-1">TECHNICAL FINDING</div><p className="text-xs text-gray font-mono leading-relaxed bg-black/30 p-2.5 rounded border border-white/5">{activeView.technicalFinding}</p></div>}
            {activeView.spatialDistribution && <div><div className="text-xs font-mono text-gray-dim uppercase tracking-wider mb-1">SPATIAL DISTRIBUTION</div><p className="text-xs text-gray leading-relaxed">{activeView.spatialDistribution}</p></div>}
            {activeView.metrics && <div><div className="text-xs font-mono text-gray-dim uppercase tracking-wider mb-1">METRICS & INDEX DELTAS</div><div className="font-mono bg-black/50 p-3 rounded border border-white/10 text-xs space-y-1">{Object.entries(activeView.metrics).map(([k,v]) => <div key={k} className="flex justify-between"><span className="text-gray-dim">{fmtLabel(k)}:</span><span className="text-white font-semibold">{v}</span></div>)}</div></div>}
            {activeView.methodology && <div><div className="text-xs font-mono text-gray-dim uppercase tracking-wider mb-1">METHODOLOGY</div><p className="text-xs text-gray leading-relaxed">{activeView.methodology}</p></div>}
            <div className="space-y-2 bg-black/30 p-3 rounded border border-white/5 text-xs">
              {activeView.directlyObserved && <div><span className="font-mono text-accent-blue font-bold uppercase mr-2">DIRECTLY OBSERVED:</span><span className="text-gray">{activeView.directlyObserved}</span></div>}
              {activeView.supportedInterpretation && <div><span className="font-mono text-success-mint font-bold uppercase mr-2">SUPPORTED INTERPRETATION:</span><span className="text-gray">{activeView.supportedInterpretation}</span></div>}
              {activeView.uncertainty && <div><span className="font-mono text-warning font-bold uppercase mr-2">UNCERTAINTY:</span><span className="text-gray">{activeView.uncertainty}</span></div>}
            </div>
            {activeView.datasetAndSensor && <div className="text-xs font-mono text-gray-dim border-t border-white/10 pt-2">{activeView.datasetAndSensor}</div>}
          </div>
        )}
      </div>
      <div className="p-3 border-t border-white/10 flex flex-col gap-2 flex-shrink-0">
        <div className="flex gap-2">
          <button className="btn-primary flex-1 justify-center py-2 text-xs font-bold" onClick={() => setShowEvidence(true)}>View Evidence <ArrowUp size={12} className="ml-1 rotate-45"/></button>
          {result?.overlayCoordinates
            ? <button className="btn-secondary flex-1 justify-center py-2 text-xs font-bold text-accent-blue" onClick={overlayRasterOnMap}><Layers size={12} className="mr-1"/> Overlay Map</button>
            : <button className="btn-secondary flex-1 justify-center py-2 text-xs font-bold" onClick={highlightMapResult}><MapIcon size={12} className="mr-1 text-gray"/> Show on Map</button>}
          <button className="btn-secondary py-2 px-3 text-xs" onClick={resetFlow}>New Area</button>
        </div>
        {activeView.actions?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs font-mono text-gray-dim self-center">Explore:</span>
            {activeView.actions.map((act, idx) => (
              act.action==='overlay_raster' ? <button key={idx} className="prompt-pill text-xs py-0.5 px-2 bg-accent-blue/10 border-accent-blue/30 text-accent-blue font-bold" onClick={overlayRasterOnMap}>{act.label}</button>
              : act.query ? <button key={idx} className="prompt-pill text-xs py-0.5 px-2" onClick={() => executeAskQuery(act.query)}>{act.label}</button>
              : null
            ))}
          </div>
        )}
      </div>
      <div className="resize-handle" onMouseDown={onResizeStart} title="Resize" />
    </motion.div>
  );
}

function EvidencePanel({ result, onClose }) {
  const { pos, size, onDragStart, onResizeStart } = useDraggableResizable(
    { x: Math.max(80, window.innerWidth - 420), y: 80 },
    { w: 380, h: 540 }
  );
  return (
    <motion.div
      style={{ position:'fixed', left:pos.x, top:pos.y, width:size.w, height:size.h, zIndex:60, display:'flex', flexDirection:'column' }}
      className="glass-panel evidence-floating"
      initial={{ opacity:0, x:30 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:30 }} transition={{ duration:0.25 }}>
      <div className="drag-handle" onMouseDown={onDragStart}>
        <div className="flex items-center gap-2"><GripVertical size={15} className="text-gray-dim"/><span className="text-sm font-bold tracking-wider">VERIFIED SATELLITE EVIDENCE</span></div>
        <button onClick={onClose} className="text-gray hover:text-white p-1 rounded hover:bg-white/10"><X size={15}/></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs min-h-0">
        <div><div className="text-gray-dim font-mono mb-1 uppercase">DATASET & SENSOR</div><div className="font-semibold text-accent-blue text-sm">{result.sources?.[0]?.name || 'Sentinel-2 MSI Harmonized'}</div><div className="text-gray-dim text-[11px] mt-0.5">10m GSD · Multispectral</div></div>
        <div><div className="text-gray-dim font-mono mb-1 uppercase">OBSERVATION WINDOW</div>
          <div className="font-mono bg-black/40 p-2.5 rounded border border-white/10 flex justify-between">
            <div><span className="text-gray-dim">Baseline:</span> {result.timeRange?.start}</div>
            <div><span className="text-gray-dim">Target:</span> {result.timeRange?.end}</div>
          </div>
        </div>
        <div><div className="text-gray-dim font-mono mb-1 uppercase">ANALYSIS METHOD</div><div className="font-semibold text-white">{result.analysisType}</div></div>
        {result.observedVsInterpreted && (
          <div className="space-y-2">
            <div className="bg-black/30 p-2.5 rounded border border-white/5"><div className="font-mono text-accent-blue mb-1 font-bold">DIRECTLY OBSERVED:</div><div className="text-gray leading-relaxed">{result.observedVsInterpreted.observed}</div></div>
            <div className="bg-black/30 p-2.5 rounded border border-white/5"><div className="font-mono text-success-mint mb-1 font-bold">SUPPORTED INTERPRETATION:</div><div className="text-gray leading-relaxed">{result.observedVsInterpreted.interpreted}</div></div>
            <div className="bg-black/30 p-2.5 rounded border border-white/5"><div className="font-mono text-warning mb-1 font-bold">UNCERTAIN / UNPROVEN:</div><div className="text-gray leading-relaxed">{result.observedVsInterpreted.uncertain}</div></div>
          </div>
        )}
        {result.metrics && (
          <div><div className="text-gray-dim font-mono mb-1 uppercase">RAW CALCULATED METRICS</div>
            <div className="font-mono bg-black/40 p-3 rounded text-xs border border-white/10 space-y-1.5">
              {Object.entries(result.metrics).map(([k,v]) => <div key={k} className="flex justify-between"><span className="text-gray-dim">{fmtLabel(k)}:</span><span className="text-white font-semibold">{v}</span></div>)}
            </div>
          </div>
        )}
        {result.limitations?.length > 0 && (
          <div><div className="text-gray-dim font-mono mb-1 uppercase">DATA LIMITATIONS</div>
            <ul className="list-disc list-inside text-gray space-y-1 pl-1">{result.limitations.map((l,i) => <li key={i}>{l}</li>)}</ul>
          </div>
        )}
      </div>
      <div className="resize-handle" onMouseDown={onResizeStart} title="Resize"/>
    </motion.div>
  );
}
