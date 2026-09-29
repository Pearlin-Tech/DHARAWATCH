import React, { useState, useEffect, useRef, useCallback, Component } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Droplet, Leaf, Building2, HardHat, Navigation, Flame,
  Square, Hexagon, CircleDashed, Download, Focus, Eye, EyeOff,
  X, Search, AlertCircle, MousePointer2, TrendingUp, BarChart2
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts';

import AppNavigation from '../../components/AppNavigation';
import MapViewport from '../../components/MapViewport';
import { detect, TARGET_REGISTRY, detectRouter } from '../../services/detectionService';
import './Detect.css';

// ─── Error Boundary ───────────────────────────────────────────────────────────
class DetectErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[DetectErrorBoundary] Caught:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, color: '#fff', background: '#1a1a2e', borderRadius: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', marginBottom: 8 }}>RESULT DISPLAY ERROR</div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 16 }}>{this.state.error?.message}</div>
          <button
            style={{ padding: '6px 14px', fontSize: 11, background: '#222', border: '1px solid #444', color: '#fff', borderRadius: 4, cursor: 'pointer', marginRight: 8 }}
            onClick={() => this.setState({ hasError: false, error: null })}
          >Retry Display</button>
          <button
            style={{ padding: '6px 14px', fontSize: 11, background: '#222', border: '1px solid #444', color: '#fff', borderRadius: 4, cursor: 'pointer' }}
            onClick={() => { this.setState({ hasError: false, error: null }); this.props.onRunAgain?.(); }}
          >Run Again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── State machine constants ────────────────────────────────────────────────
const S = {
  IDLE: 'idle',
  SELECTING: 'selecting',
  SELECTED: 'selected',
  RUNNING: 'running',
  READY: 'ready',
  EMPTY: 'empty',
  ERROR: 'error',
  UNSUPPORTED: 'unsupported',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function bboxFromGeometry(geometry) {
  const coords =
    geometry.type === 'Polygon' ? geometry.coordinates[0] : geometry.coordinates;
  let minLng = 180, minLat = 90, maxLng = -180, maxLat = -90;
  coords.forEach(([lng, lat]) => {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  });
  return [minLng, minLat, maxLng, maxLat];
}

function boxToGeoJSON(minLng, minLat, maxLng, maxLat) {
  return {
    type: 'Polygon',
    coordinates: [[
      [minLng, minLat],
      [maxLng, minLat],
      [maxLng, maxLat],
      [minLng, maxLat],
      [minLng, minLat],
    ]],
  };
}

// ─── NDVIGraph Component ─────────────────────────────────────────────────────
function NDVIGraph({ bins }) {
  if (!Array.isArray(bins) || bins.length === 0) {
    return (
      <div className="text-xs text-gray text-center py-4">No histogram data available.</div>
    );
  }
  const data = bins.map(b => ({
    name: `${b.rangeStart?.toFixed(1) ?? ''}`,
    count: b.pixelCount ?? 0,
    rangeStart: b.rangeStart ?? 0
  }));
  return (
    <div style={{ width: '100%', height: 120 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#888' }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 9, fill: '#888' }} />
          <Tooltip
            contentStyle={{ background: '#111', border: '1px solid #333', fontSize: 11 }}
            itemStyle={{ color: '#10b981' }}
            formatter={(val) => [val.toLocaleString(), 'Pixels']}
          />
          <Bar dataKey="count" radius={[2, 2, 0, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.rangeStart >= 0.3 ? '#10b981' : entry.rangeStart >= 0 ? '#6ee7b7' : '#4b5563'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── ResultPanel Component ────────────────────────────────────────────────────
function ResultPanel({
  result, activeTarget, selectedFeatureId, setSelectedFeatureId,
  setHoveredFeatureId, maskVisible, setMaskVisible, mapRef, handleClear, handleFocusAOI
}) {
  const def = TARGET_REGISTRY[activeTarget] ?? {};
  const summary = result?.summary ?? {};
  const analysis = result?.analysis ?? {};
  const acquisition = result?.acquisition ?? {};
  const dataset = result?.dataset ?? {};
  const graph = result?.graph ?? null;
  const detections = result?.detections ?? {};
  const features = detections?.features ?? [];

  const acquiredDate = acquisition?.timestamp
    ? new Date(acquisition.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

  return (
    <>
      {/* Header */}
      <div className="results-header">
        <div className="flex items-center gap-2">
          <div className="indicator" style={{ background: def.color || '#10b981' }}></div>
          <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: def.color || '#10b981' }}>
            {def.label ?? activeTarget} Detected
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <button className="text-xs font-mono flex items-center gap-1 hover:text-white transition-colors" onClick={() => setMaskVisible(v => !v)}>
            {maskVisible ? <Eye size={13} className="text-accent-blue" /> : <EyeOff size={13} />} Layer
          </button>
          <button className="text-xs text-gray hover:text-white" onClick={handleClear}><X size={13} /></button>
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 gap-2 mt-3">
        {[
          ['Regions', summary.detectionCount ?? features.length],
          ['Total Area', `${(summary.totalAreaKm2 ?? 0).toFixed(2)} km²`],
          ['Mean Index', analysis.mean != null ? analysis.mean.toFixed(3) : '—'],
          ['Cloud %', acquisition.cloudPercentage != null ? `${acquisition.cloudPercentage.toFixed(1)}%` : '—'],
        ].map(([label, val]) => (
          <div key={label} className="bg-[#0d0d0d] border border-[#222] rounded p-2">
            <div className="text-[10px] text-gray uppercase tracking-wider mb-1">{label}</div>
            <div className="text-sm font-bold font-mono">{val}</div>
          </div>
        ))}
      </div>

      {/* Scene info */}
      <div className="text-[10px] font-mono text-gray mt-2 flex gap-4">
        <span>{dataset.name ?? 'Sentinel-2'}</span>
        <span>{acquiredDate}</span>
        {dataset.sceneId && <span className="truncate">{dataset.sceneId.slice(0, 22)}…</span>}
      </div>

      {/* NDVI/Index stats */}
      {(analysis.min != null || analysis.max != null) && (
        <div className="mt-3 grid grid-cols-3 gap-1 text-[10px] font-mono">
          {[
            ['Min', analysis.min?.toFixed(3)],
            ['Mean', analysis.mean?.toFixed(3)],
            ['Max', analysis.max?.toFixed(3)],
          ].map(([k, v]) => v != null && (
            <div key={k} className="bg-[#0d0d0d] border border-[#222] rounded p-1.5 text-center">
              <div className="text-gray mb-0.5">{k} {analysis.index ?? ''}</div>
              <div className="text-white">{v}</div>
            </div>
          ))}
        </div>
      )}

      {/* NDVI Distribution Graph */}
      {graph?.bins?.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] font-mono text-gray uppercase tracking-wider mb-1 flex items-center gap-1">
            <BarChart2 size={10} /> {analysis.index ?? 'Index'} Distribution
          </div>
          <NDVIGraph bins={graph.bins} />
        </div>
      )}

      {/* Region cards */}
      <div className="mt-3 text-[10px] font-mono text-gray uppercase tracking-wider mb-1">
        Detected Regions ({features.length})
      </div>
      <div className="results-grid max-h-48 overflow-y-auto pr-1 custom-scrollbar">
        {features.map((feature, idx) => {
          const props = feature?.properties ?? {};
          const aKm2 = props.areaKm2 ?? props.area ?? 0;
          const ndvi = props.meanNDVI;
          const fid = feature.id ?? idx;
          return (
            <div
              key={fid}
              className={`result-card ${selectedFeatureId === fid ? 'selected' : ''}`}
              onClick={() => {
                setSelectedFeatureId(fid);
                if (feature.geometry) {
                  const bbox = bboxFromGeometry(feature.geometry);
                  mapRef.current?.fitBounds(bbox, { padding: 150, maxZoom: 17 });
                }
              }}
              onMouseEnter={() => setHoveredFeatureId(fid)}
              onMouseLeave={() => setHoveredFeatureId(null)}
            >
              <div className="card-header">
                <span className="text-xs font-mono text-gray-dim uppercase">{String(idx + 1).padStart(2, '0')}</span>
                <span className="status-pill success">Confirmed</span>
              </div>
              <h4 className="text-sm mt-1 font-medium">{props.label ?? `Region ${idx + 1}`}</h4>
              <div className="flex justify-between items-end mt-2">
                <div className="text-base font-bold">{aKm2.toFixed(2)} <span className="text-xs font-normal text-gray">km²</span></div>
                {ndvi != null && <div className="text-xs font-mono text-gray">NDVI {ndvi.toFixed(3)}</div>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="results-footer mt-3 flex justify-between items-center border-t border-white-10 pt-3">
        <button className="text-xs text-gray hover:text-white flex items-center gap-2 transition-colors" onClick={handleClear}>
          <X size={13} /> Clear
        </button>
        <button className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-2 text-gray" onClick={handleFocusAOI}>
          <Focus size={13} /> Focus AOI
        </button>
      </div>
    </>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function Detect() {
  const routerLocation = useLocation();
  const navigate = useNavigate();

  const initialCoords = routerLocation.state?.coords || { lng: 72.5714, lat: 23.0225 };
  const [markerCoords, setMarkerCoords] = useState(initialCoords);
  const [mapInstance, setMapInstance] = useState(null);
  const mapRef = useRef(null); // always-current ref to mapInstance

  // ── Detection state machine ──
  const [status, setStatus] = useState(S.IDLE);
  const [selectionMode, setSelectionMode] = useState('box');
  const [activeTarget, setActiveTarget] = useState('water');
  const [searchQuery, setSearchQuery] = useState('');
  const [aoiGeometry, setAoiGeometry] = useState(null);
  const [detectionResult, setDetectionResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [processingStatus, setProcessingStatus] = useState('');
  const [selectedFeatureId, setSelectedFeatureId] = useState(null);
  const [hoveredFeatureId, setHoveredFeatureId] = useState(null);
  const [maskVisible, setMaskVisible] = useState(true);

  // ── Draw state (refs to avoid stale closures in event handlers) ──
  const drawingRef = useRef(false);
  const startLngLatRef = useRef(null);
  const polygonVerticesRef = useRef([]);
  const selectionModeRef = useRef('box');
  const statusRef = useRef(S.IDLE);
  const tempLayerAdded = useRef(false);

  // Keep refs in sync with state
  useEffect(() => { selectionModeRef.current = selectionMode; }, [selectionMode]);
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { mapRef.current = mapInstance; }, [mapInstance]);

  const targets = Object.values(TARGET_REGISTRY);

  // ─── Natural language routing ─────────────────────────────────────────────
  const handleSearchChange = (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (q.trim()) {
      const routed = detectRouter(q);
      if (routed && routed !== 'unsupported' && TARGET_REGISTRY[routed]) {
        setActiveTarget(routed);
      }
    }
  };

  const handleSearchSubmit = () => {
    if (!aoiGeometry) {
      // nudge user to draw first
      setStatus(S.IDLE);
      return;
    }
    triggerRunDetection();
  };

  // ─── Map layer helpers ────────────────────────────────────────────────────
  const removeTempLayers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    ['temp-aoi-fill', 'temp-aoi-outline', 'temp-poly-line', 'temp-poly-vertices'].forEach(id => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    ['temp-aoi-source', 'temp-poly-source'].forEach(id => {
      if (map.getSource(id)) map.removeSource(id);
    });
    tempLayerAdded.current = false;
  }, []);

  const removeDetectionLayers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    ['detection-fill', 'detection-outline'].forEach(id => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource('detection-source')) map.removeSource('detection-source');
  }, []);

  const renderTempBox = useCallback((minLng, minLat, maxLng, maxLat) => {
    const map = mapRef.current;
    if (!map) return;
    const geom = boxToGeoJSON(minLng, minLat, maxLng, maxLat);
    const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: geom, properties: {} }] };

    if (!map.getSource('temp-aoi-source')) {
      map.addSource('temp-aoi-source', { type: 'geojson', data: fc });
      map.addLayer({ id: 'temp-aoi-fill', type: 'fill', source: 'temp-aoi-source', paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.15 } });
      map.addLayer({ id: 'temp-aoi-outline', type: 'line', source: 'temp-aoi-source', paint: { 'line-color': '#3b82f6', 'line-width': 2, 'line-dasharray': [2, 2] } });
      tempLayerAdded.current = true;
    } else {
      map.getSource('temp-aoi-source').setData(fc);
    }
  }, []);

  const renderTempPolygon = useCallback((vertices) => {
    const map = mapRef.current;
    if (!map || vertices.length < 1) return;

    const lineCoords = vertices.length > 1 ? vertices : [];
    const polyCoords = vertices.length >= 3 ? [[...vertices, vertices[0]]] : null;

    const features = [];
    if (lineCoords.length >= 2) {
      features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: lineCoords }, properties: { t: 'line' } });
    }
    if (polyCoords) {
      features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: polyCoords }, properties: { t: 'poly' } });
    }
    // Vertex dots
    vertices.forEach((v, i) => {
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: v }, properties: { t: 'vertex', idx: i } });
    });

    const fc = { type: 'FeatureCollection', features };

    if (!map.getSource('temp-poly-source')) {
      map.addSource('temp-poly-source', { type: 'geojson', data: fc });
      map.addLayer({ id: 'temp-poly-line', type: 'line', source: 'temp-poly-source', filter: ['==', ['get', 't'], 'line'], paint: { 'line-color': '#a855f7', 'line-width': 2 } });
      map.addLayer({ id: 'temp-poly-fill', type: 'fill', source: 'temp-poly-source', filter: ['==', ['get', 't'], 'poly'], paint: { 'fill-color': '#a855f7', 'fill-opacity': 0.15 } });
      map.addLayer({ id: 'temp-poly-vertices', type: 'circle', source: 'temp-poly-source', filter: ['==', ['get', 't'], 'vertex'], paint: { 'circle-radius': 5, 'circle-color': '#a855f7', 'circle-stroke-color': 'white', 'circle-stroke-width': 2 } });
    } else {
      map.getSource('temp-poly-source').setData(fc);
    }
  }, []);

  const updateDetectionLayers = useCallback((featureCollection, targetId) => {
    const map = mapRef.current;
    if (!map) return;
    removeDetectionLayers();

    const targetDef = TARGET_REGISTRY[targetId];
    const color = targetDef?.color || '#3b82f6';

    map.addSource('detection-source', { type: 'geojson', data: featureCollection, generateId: true });

    if (targetDef?.resultType === 'LineString') {
      map.addLayer({ id: 'detection-fill', type: 'line', source: 'detection-source', paint: { 'line-color': color, 'line-width': 3 } });
    } else {
      map.addLayer({
        id: 'detection-fill', type: 'fill', source: 'detection-source',
        filter: ['==', '$type', 'Polygon'],
        paint: {
          'fill-color': color,
          'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.55, ['boolean', ['feature-state', 'selected'], false], 0.65, targetDef?.fillOpacity || 0.3]
        }
      });
    }
    map.addLayer({
      id: 'detection-outline', type: 'line', source: 'detection-source',
      paint: { 'line-color': color, 'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, 1.5] }
    });
  }, [removeDetectionLayers]);

  // ─── Native Box Drawing ──────────────────────────────────────────────────
  const boxDownHandler = useRef(null);
  const boxMoveHandler = useRef(null);
  const boxUpHandler = useRef(null);

  const cleanupBoxHandlers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    if (boxDownHandler.current) { map.off('mousedown', boxDownHandler.current); boxDownHandler.current = null; }
    if (boxMoveHandler.current) { map.off('mousemove', boxMoveHandler.current); boxMoveHandler.current = null; }
    if (boxUpHandler.current) { map.off('mouseup', boxUpHandler.current); boxUpHandler.current = null; }
    map.dragPan.enable();
    map.getCanvas().style.cursor = '';
  }, []);

  const activateBoxDrawing = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    cleanupBoxHandlers();
    map.dragPan.disable();
    map.getCanvas().style.cursor = 'crosshair';

    boxDownHandler.current = (e) => {
      if (statusRef.current !== S.SELECTING) return;
      drawingRef.current = true;
      startLngLatRef.current = e.lngLat;
      renderTempBox(e.lngLat.lng, e.lngLat.lat, e.lngLat.lng, e.lngLat.lat);
    };

    boxMoveHandler.current = (e) => {
      if (!drawingRef.current || !startLngLatRef.current) return;
      const s = startLngLatRef.current;
      const c = e.lngLat;
      renderTempBox(
        Math.min(s.lng, c.lng), Math.min(s.lat, c.lat),
        Math.max(s.lng, c.lng), Math.max(s.lat, c.lat)
      );
    };

    boxUpHandler.current = (e) => {
      if (!drawingRef.current || !startLngLatRef.current) return;
      drawingRef.current = false;
      const s = startLngLatRef.current;
      const c = e.lngLat;

      if (Math.abs(s.lng - c.lng) < 0.0001 && Math.abs(s.lat - c.lat) < 0.0001) {
        // Too small, ignore
        removeTempLayers();
        return;
      }

      const geom = boxToGeoJSON(
        Math.min(s.lng, c.lng), Math.min(s.lat, c.lat),
        Math.max(s.lng, c.lng), Math.max(s.lat, c.lat)
      );

      // Keep temp layer visible but stop editing
      cleanupBoxHandlers();
      setAoiGeometry(geom);
      setStatus(S.SELECTED);
    };

    map.on('mousedown', boxDownHandler.current);
    map.on('mousemove', boxMoveHandler.current);
    map.on('mouseup', boxUpHandler.current);
  }, [cleanupBoxHandlers, renderTempBox, removeTempLayers]);

  // ─── Native Polygon Drawing ──────────────────────────────────────────────
  const polyClickHandler = useRef(null);
  const polyMoveHandler = useRef(null);
  const polyDblClickHandler = useRef(null);
  const polyKeyHandler = useRef(null);

  const cleanupPolyHandlers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    if (polyClickHandler.current) { map.off('click', polyClickHandler.current); polyClickHandler.current = null; }
    if (polyMoveHandler.current) { map.off('mousemove', polyMoveHandler.current); polyMoveHandler.current = null; }
    if (polyDblClickHandler.current) { map.off('dblclick', polyDblClickHandler.current); polyDblClickHandler.current = null; }
    if (polyKeyHandler.current) { document.removeEventListener('keydown', polyKeyHandler.current); polyKeyHandler.current = null; }
    map.doubleClickZoom.enable();
    map.getCanvas().style.cursor = '';
  }, []);

  const activatePolygonDrawing = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    cleanupPolyHandlers();
    polygonVerticesRef.current = [];
    map.doubleClickZoom.disable();
    map.getCanvas().style.cursor = 'crosshair';

    polyClickHandler.current = (e) => {
      if (statusRef.current !== S.SELECTING) return;
      polygonVerticesRef.current = [...polygonVerticesRef.current, [e.lngLat.lng, e.lngLat.lat]];
      renderTempPolygon(polygonVerticesRef.current);
    };

    polyMoveHandler.current = (e) => {
      if (statusRef.current !== S.SELECTING || polygonVerticesRef.current.length === 0) return;
      const preview = [...polygonVerticesRef.current, [e.lngLat.lng, e.lngLat.lat]];
      renderTempPolygon(preview);
    };

    polyDblClickHandler.current = (e) => {
      e.preventDefault();
      const verts = polygonVerticesRef.current;
      if (verts.length < 3) {
        alert('Please click at least 3 points to form a polygon.');
        return;
      }
      const geom = {
        type: 'Polygon',
        coordinates: [[...verts, verts[0]]],
      };
      cleanupPolyHandlers();
      // Re-render as solid AOI
      removeTempLayers();
      renderTempBox(
        Math.min(...verts.map(v => v[0])),
        Math.min(...verts.map(v => v[1])),
        Math.max(...verts.map(v => v[0])),
        Math.max(...verts.map(v => v[1]))
      );
      setAoiGeometry(geom);
      setStatus(S.SELECTED);
    };

    polyKeyHandler.current = (e) => {
      if (e.key === 'Escape') {
        cleanupPolyHandlers();
        removeTempLayers();
        polygonVerticesRef.current = [];
        setStatus(S.IDLE);
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        polygonVerticesRef.current = polygonVerticesRef.current.slice(0, -1);
        renderTempPolygon(polygonVerticesRef.current);
      }
    };

    map.on('click', polyClickHandler.current);
    map.on('mousemove', polyMoveHandler.current);
    map.on('dblclick', polyDblClickHandler.current);
    document.addEventListener('keydown', polyKeyHandler.current);
  }, [cleanupPolyHandlers, renderTempPolygon, removeTempLayers, renderTempBox]);

  // ─── Start drawing ────────────────────────────────────────────────────────
  const startDrawing = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear previous session
    removeTempLayers();
    removeDetectionLayers();
    setAoiGeometry(null);
    setDetectionResult(null);
    setSelectedFeatureId(null);
    setHoveredFeatureId(null);
    setErrorMsg('');
    setStatus(S.SELECTING);

    if (selectionModeRef.current === 'box') {
      activateBoxDrawing();
    } else {
      activatePolygonDrawing();
    }
  }, [removeTempLayers, removeDetectionLayers, activateBoxDrawing, activatePolygonDrawing]);

  const handleClear = useCallback(() => {
    cleanupBoxHandlers();
    cleanupPolyHandlers();
    removeTempLayers();
    removeDetectionLayers();
    setAoiGeometry(null);
    setDetectionResult(null);
    setSelectedFeatureId(null);
    setStatus(S.IDLE);
    setSearchQuery('');
  }, [cleanupBoxHandlers, cleanupPolyHandlers, removeTempLayers, removeDetectionLayers]);

  // ─── Detection result map interaction ─────────────────────────────────────
  useEffect(() => {
    const map = mapInstance;
    if (!map) return;

    const onMove = (e) => {
      if (!e.features?.length) return;
      map.getCanvas().style.cursor = 'pointer';
      setHoveredFeatureId(e.features[0].id);
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = '';
      setHoveredFeatureId(null);
    };
    const onClick = (e) => {
      if (!e.features?.length) return;
      const fid = e.features[0].id;
      setSelectedFeatureId(fid);
      const bbox = bboxFromGeometry(e.features[0].geometry);
      map.fitBounds(bbox, { padding: 150, maxZoom: 17 });
    };

    map.on('mousemove', 'detection-fill', onMove);
    map.on('mouseleave', 'detection-fill', onLeave);
    map.on('click', 'detection-fill', onClick);

    return () => {
      map.off('mousemove', 'detection-fill', onMove);
      map.off('mouseleave', 'detection-fill', onLeave);
      map.off('click', 'detection-fill', onClick);
    };
  }, [mapInstance]);

  // Sync hover/select feature states
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !detectionResult?.detections || !map.getSource('detection-source')) return;
    detectionResult.detections.features.forEach((f) => {
      map.setFeatureState({ source: 'detection-source', id: f.id }, { hover: false, selected: false });
    });
    if (hoveredFeatureId !== null) map.setFeatureState({ source: 'detection-source', id: hoveredFeatureId }, { hover: true });
    if (selectedFeatureId !== null) map.setFeatureState({ source: 'detection-source', id: selectedFeatureId }, { selected: true });
  }, [hoveredFeatureId, selectedFeatureId, detectionResult]);

  // Mask toggle
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer('detection-fill')) return;
    const vis = maskVisible ? 'visible' : 'none';
    map.setLayoutProperty('detection-fill', 'visibility', vis);
    if (map.getLayer('detection-outline')) map.setLayoutProperty('detection-outline', 'visibility', vis);
  }, [maskVisible]);

  // ─── Run Detection ────────────────────────────────────────────────────────
  const triggerRunDetection = useCallback(async () => {
    const geo = aoiGeometry;
    const target = activeTarget;
    if (!geo || !target || status === S.RUNNING) return;

    setStatus(S.RUNNING);
    setProcessingStatus('Preparing imagery...');
    setSelectedFeatureId(null);

    try {
      const request = {
        query: searchQuery,
        targetType: target,
        geometry: geo,
        selectionMode: selectionModeRef.current,
        dataset: 'Sentinel-2',
        date: new Date().toISOString().split('T')[0],
      };

      console.log('[DETECT] Sending request:', { targetType: request.targetType, hasGeometry: !!request.geometry, dataset: request.dataset, date: request.date });

      const res = await detect(request, (s) => {
        const statuses = {
          'queued': 'Queueing request...',
          'searching_imagery': 'Searching imagery...',
          'analysing': 'Analysing signatures...',
          'vectorising': 'Vectorising results...',
          'measuring': 'Calculating metrics...',
          'saving': 'Saving results...'
        };
        if (statuses[s]) setProcessingStatus(statuses[s]);
      });

      console.log('[DETECT] Response:', res);

      if (res.status === 'error' || res.status === 'failed') {
        setErrorMsg(res.message);
        setStatus(res.error === 'UNSUPPORTED_TARGET' ? S.UNSUPPORTED : S.ERROR);
        return;
      }
      
      if (res.status === 'timeout') {
        setErrorMsg(res.message);
        setStatus(S.ERROR);
        return;
      }

      setDetectionResult(res);
      if (res.targetType) setActiveTarget(res.targetType);

      if (res.detections?.features?.length > 0) {
        setStatus(S.READY);
        updateDetectionLayers(res.detections, res.targetType);
      } else if (res.status === 'no_imagery') {
        setStatus(S.ERROR);
        setErrorMsg(res.reason || 'No suitable imagery found for this area with low cloud cover.');
      } else {
        setStatus(S.EMPTY);
      }
    } catch (err) {
      console.error('[DETECT] Detection error:', err);
      setErrorMsg(err.message || 'An unexpected error occurred.');
      setStatus(S.ERROR);
    }
  }, [aoiGeometry, activeTarget, searchQuery, status, updateDetectionLayers]);

  const handleFocusAOI = () => {
    if (aoiGeometry && mapRef.current) {
      mapRef.current.fitBounds(bboxFromGeometry(aoiGeometry), { padding: 100 });
    }
  };

  // ─── Icon helper ──────────────────────────────────────────────────────────
  const getTargetIcon = (id) => {
    const icons = { water: Droplet, vegetation: Leaf, buildings: Building2, construction: HardHat, roads: Navigation, burn: Flame };
    return icons[id] || Search;
  };

  const TargetIcon = getTargetIcon(activeTarget);
  const selectedFeature = detectionResult?.detections?.features?.find(f => f.id === selectedFeatureId);
  const canRun = !!aoiGeometry && !!activeTarget && status === S.SELECTED;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="detect-container">
      <AppNavigation />

      <MapViewport
        center={[initialCoords.lng, initialCoords.lat]}
        zoom={13}
        markerCoords={status === S.SELECTING ? null : markerCoords}
        onMapClick={(coords) => {
          if (status === S.SELECTING) return;
          setMarkerCoords(coords);
        }}
        onMapLoad={setMapInstance}
      >
        {/* TOP STATUS BAR */}
        <div className="detect-top-bar glass-panel text-xs font-mono text-gray" style={{ pointerEvents: 'none' }}>
          <div className="flex items-center gap-4">
            <span className={`font-bold flex items-center ${status === S.DETECTING ? 'text-warning' : 'text-success-mint'}`}>
              <div className="indicator mr-2" style={{ background: status === S.DETECTING ? '#f59e0b' : '#10b981' }}></div>
              {status === S.DETECTING ? 'PROCESSING ANALYSIS' : (detectionResult ? 'LATEST SENTINEL-2' : 'LIVE SATELLITE ANALYSIS')}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span>LAT: {markerCoords.lat.toFixed(4)}°</span>
            <span>LON: {markerCoords.lng.toFixed(4)}°</span>
            <span className="text-gray-dim">10M/PX</span>
          </div>
        </div>

        {/* ── DEBUG STATUS (always visible, tiny) ── */}
        <div className="detect-debug-bar" style={{ pointerEvents: 'none' }}>
          T:{activeTarget || '—'} · M:{selectionMode} · AOI:{aoiGeometry ? 'yes' : 'no'} · S:{status}
        </div>

        {/* ── DETECT WORKSPACE PANEL ── */}
        <motion.div
          className="detect-toolbar glass-panel"
          drag
          dragMomentum={false}
          dragElastic={0}
          style={{ cursor: 'grab' }}
        >
          <div className="toolbar-header">
            <span className="workspace-label">Detect Workspace</span>
            <h2>What are you looking for?</h2>
          </div>

          {/* Search */}
          <div className="search-target-wrapper">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder='e.g. "ponds", "forests"...'
              value={searchQuery}
              onChange={handleSearchChange}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearchSubmit(); }}
              onClick={(e) => e.stopPropagation()}
            />
            <button
              className="search-btn"
              onClick={(e) => { e.stopPropagation(); handleSearchSubmit(); }}
            >
              Search
            </button>
          </div>

          {/* Target chips */}
          <div className="suggested-label">Target:</div>
          <div className="target-selector">
            {targets.map(t => {
              const Icon = getTargetIcon(t.id);
              const isAvailable = t.available !== false;
              return (
                <button
                  key={t.id}
                  className={`target-btn ${activeTarget === t.id ? 'active' : ''} ${!isAvailable ? 'opacity-50' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isAvailable) return;
                    setActiveTarget(t.id); setSearchQuery('');
                  }}
                  title={isAvailable ? t.description : `Coming Soon — ${t.description}`}
                  style={!isAvailable ? { cursor: 'not-allowed' } : {}}
                >
                  <Icon size={13} />
                  {t.label}
                  {!isAvailable && <span style={{ fontSize: 8, marginLeft: 2, opacity: 0.7 }}>●</span>}
                </button>
              );
            })}

          </div>

          <div className="toolbar-divider" />

          {/* Mode + action row */}
          <div className="selection-mode-container">
            <div className="selection-mode">
              <button
                className={`mode-btn ${selectionMode === 'box' ? 'active' : ''}`}
                onClick={(e) => { e.stopPropagation(); setSelectionMode('box'); selectionModeRef.current = 'box'; }}
              >
                <Square size={13} /> Box
              </button>
              <button
                className={`mode-btn ${selectionMode === 'polygon' ? 'active' : ''}`}
                onClick={(e) => { e.stopPropagation(); setSelectionMode('polygon'); selectionModeRef.current = 'polygon'; }}
              >
                <Hexagon size={13} /> Polygon
              </button>
            </div>

            {/* Action button — context-sensitive */}
            {status === S.IDLE && (
              <button className="btn-primary text-xs py-1.5 px-4" onClick={(e) => { e.stopPropagation(); startDrawing(); }}>
                Draw Area
              </button>
            )}
            {status === S.SELECTING && (
              <div className="draw-hint">
                <MousePointer2 size={13} />
                {selectionMode === 'box' ? 'Drag on map' : 'Click vertices · Dbl-click to close'}
              </div>
            )}
            {status === S.SELECTED && (
              <button
                className="btn-run"
                onClick={(e) => { e.stopPropagation(); triggerRunDetection(); }}
              >
                ▶ Run Detection
              </button>
            )}
            {status === S.RUNNING && (
              <div className="text-xs py-1.5 px-3 text-accent-blue flex items-center gap-2">
                <CircleDashed size={13} className="animate-spin" /> {processingStatus}
              </div>
            )}
            {[S.READY, S.EMPTY, S.ERROR, S.UNSUPPORTED].includes(status) && (
              <button className="btn-secondary text-xs py-1.5 px-3" onClick={(e) => { e.stopPropagation(); handleClear(); }}>
                Reset
              </button>
            )}
          </div>

          {/* Polygon undo hint */}
          {status === S.SELECTING && selectionMode === 'polygon' && (
            <div className="poly-hint">
              Press <kbd>Backspace</kbd> to undo vertex · <kbd>Esc</kbd> to cancel
            </div>
          )}
        </motion.div>

        {/* ── RESULT DRAWER ── */}
        <AnimatePresence>
          {[S.RUNNING, S.EMPTY, S.ERROR, S.UNSUPPORTED, S.READY].includes(status) && (
            <motion.div
              className="detection-results glass-panel"
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            >
              {status === S.RUNNING && (
                <div className="flex flex-col items-center justify-center py-8">
                  <CircleDashed size={24} className="animate-spin text-accent-blue mb-4" />
                  <div className="text-sm font-mono tracking-wider text-accent-blue">{processingStatus.toUpperCase()}</div>
                </div>
              )}

              {status === S.EMPTY && (
                <div className="flex flex-col items-center justify-center py-6 overflow-y-auto">
                  <EyeOff size={24} className="text-gray mb-3" />
                  <div className="text-sm font-bold mb-1">
                    {detectionResult?.status === 'no_candidate_pixels' ? 'NO CANDIDATE PIXELS' : 
                     (detectionResult?.status === 'no_detections' ? 'NO DETECTIONS FORMED' : 'NO DETECTIONS FOUND')}
                  </div>
                  <div className="text-xs text-gray max-w-md text-center mb-4">
                    {detectionResult?.message || `No ${TARGET_REGISTRY[activeTarget]?.label} objects found in the selected AOI.`}
                  </div>
                  
                  {detectionResult?.analysis && (
                    <div className="text-xs font-mono bg-[#111111] p-3 rounded text-left w-full max-w-sm mb-4 border border-[#333]">
                      <div className="text-white mb-2 border-b border-[#333] pb-1 uppercase tracking-wider">Analysis Diagnostics</div>
                      <div className="grid grid-cols-2 gap-2 text-gray">
                        <div><span className="text-gray-dim">Index:</span> {detectionResult.method?.index || 'NDWI'}</div>
                        <div><span className="text-gray-dim">Thresh:</span> {detectionResult.method?.threshold ?? 0}</div>
                        <div><span className="text-gray-dim">Min:</span> {detectionResult.analysis.min?.toFixed(3)}</div>
                        <div><span className="text-gray-dim">Max:</span> {detectionResult.analysis.max?.toFixed(3)}</div>
                        <div><span className="text-gray-dim">Mean:</span> {detectionResult.analysis.mean?.toFixed(3)}</div>
                        <div><span className="text-gray-dim">Pixels:</span> {Math.round(detectionResult.analysis.candidatePixels || 0)}</div>
                      </div>
                    </div>
                  )}
                  
                  <button className="btn-secondary text-xs py-1.5 px-4" onClick={startDrawing}>Try Another Area</button>
                </div>
              )}

              {status === S.ERROR && (
                <div className="flex flex-col items-center justify-center py-8">
                  <AlertCircle size={24} className="text-danger mb-4" />
                  <div className="text-sm font-bold text-danger mb-2">DETECTION FAILED</div>
                  <div className="text-xs text-gray max-w-md text-center">{errorMsg}</div>
                  <button className="btn-secondary mt-4 text-xs py-1.5 px-4" onClick={triggerRunDetection}>Retry</button>
                </div>
              )}

              {status === S.UNSUPPORTED && (
                <div className="flex flex-col items-center justify-center py-8">
                  <AlertCircle size={24} className="text-warning mb-4" />
                  <div className="text-sm font-bold text-warning mb-2">UNSUPPORTED TARGET</div>
                  <div className="text-xs text-gray max-w-md text-center">{errorMsg}</div>
                  <button className="btn-secondary mt-4 text-xs py-1.5 px-4" onClick={() => { setActiveTarget('water'); setStatus(S.SELECTED); }}>
                    Use Water (Supported)
                  </button>
                </div>
              )}

              {status === S.READY && detectionResult && (
                <DetectErrorBoundary onRunAgain={triggerRunDetection}>
                  <ResultPanel
                    result={detectionResult}
                    activeTarget={activeTarget}
                    selectedFeatureId={selectedFeatureId}
                    setSelectedFeatureId={setSelectedFeatureId}
                    setHoveredFeatureId={setHoveredFeatureId}
                    maskVisible={maskVisible}
                    setMaskVisible={setMaskVisible}
                    mapRef={mapRef}
                    handleClear={handleClear}
                    handleFocusAOI={handleFocusAOI}
                  />
                </DetectErrorBoundary>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {selectedFeatureId !== null && selectedFeature && (
            <motion.div
              className="detection-inspector glass-panel"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <TargetIcon size={15} style={{ color: TARGET_REGISTRY[activeTarget]?.color }} />
                  {selectedFeature.properties?.label ?? 'Region'}
                </h3>
                <button onClick={() => setSelectedFeatureId(null)} className="text-gray hover:text-white"><X size={15} /></button>
              </div>

              <div className="space-y-3 text-xs mb-6 font-mono">
                {[
                  ['AREA', `${(selectedFeature.properties?.areaKm2 ?? selectedFeature.properties?.area ?? 0).toFixed(3)} km²`],
                  ...(selectedFeature.properties?.meanNDVI != null ? [['MEAN NDVI', selectedFeature.properties.meanNDVI.toFixed(3)]] : []),
                  ['STATUS', selectedFeature.properties?.status ?? 'Unknown'],
                  ['DATASET', detectionResult?.dataset?.name ?? 'Sentinel-2'],
                  ['ACQUIRED', detectionResult?.acquisition?.timestamp ? new Date(detectionResult.acquisition.timestamp).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : '—'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-gray-dim">{k}</span>
                    <span className="text-white">{v}</span>
                  </div>
                ))}
                {detectionResult?.evidenceId && (
                  <div className="flex justify-between pt-1">
                    <span className="text-gray-dim">EVIDENCE</span>
                    <span className="underline cursor-pointer hover:text-white transition-colors"
                      onClick={() => navigate(`/evidence/${detectionResult.evidenceId}`)}>
                      {detectionResult.evidenceId.substring(0, 10)}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <button
                  className="btn-primary text-xs py-2 flex items-center justify-center gap-2"
                  onClick={() => navigate('/ask', { state: { coords: markerCoords, context: 'detect-handoff' } })}
                >
                  <Search size={13} /> Ask about this
                </button>
                <button
                  className="btn-secondary text-xs py-2 flex items-center justify-center gap-2"
                  onClick={() => navigate('/watch/new', { state: { geometry: selectedFeature.geometry, target: activeTarget } })}
                >
                  <Eye size={13} /> Create Watch
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </MapViewport>
    </div>
  );
}
