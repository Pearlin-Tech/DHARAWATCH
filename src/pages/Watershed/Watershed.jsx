import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import maplibregl from '../../lib/maplibre';
import FloatingPanel from '../../components/FloatingPanel';
import AppNavigation from '../../components/AppNavigation';
import {
  resolveWatershed, searchWatersheds, listSavedWatersheds,
  getFingerprint, getAttention, getTimeline,
  getAvailableLayers, getLayerTile,
  saveCustomWatershed, importWatershed, deleteWatershed
} from '../../services/watershedClient';
import {
  Search, Layers, Activity, AlertTriangle, Clock, Target,
  ArrowRight, Plus, Download, Trash2, Eye, EyeOff,
  ZoomIn, ZoomOut, Maximize, MapPin, ChevronDown, ChevronRight,
  Upload, Pen, Crosshair, X, Check, RefreshCw, Play, Pause,
  SkipBack, SkipForward, Info, ExternalLink, Navigation
} from 'lucide-react';
import './Watershed.css';

// ─── LAYER REGISTRY (client-side display metadata) ───────────────
const LAYER_REGISTRY = {
  boundary:     { group: 'WATERSHED',    color: '#38bdf8', displayName: 'Watershed Boundary', type: 'vector' },
  drainage:     { group: 'WATERSHED',    color: '#6366f1', displayName: 'Drainage Network',    type: 'vector' },
  ndvi:         { group: 'ENVIRONMENT',  color: '#10b981', displayName: 'Vegetation (NDVI)',   type: 'raster', hasOpacity: true },
  ndwi:         { group: 'ENVIRONMENT',  color: '#3b82f6', displayName: 'Surface Water (NDWI)',type: 'raster', hasOpacity: true },
  lulc:         { group: 'ENVIRONMENT',  color: '#f59e0b', displayName: 'Land Cover (DW)',     type: 'raster', hasOpacity: true, hasLegend: true },
  terrain:      { group: 'ENVIRONMENT',  color: '#d97706', displayName: 'Terrain / Elevation', type: 'raster', hasOpacity: true },
  soil_moisture:{ group: 'ENVIRONMENT',  color: '#8b5cf6', displayName: 'Soil Moisture (SMAP ~9km)', type: 'raster', hasOpacity: true, coarse: true },
  true_color:   { group: 'BASE',         color: '#9ca3af', displayName: 'Sentinel-2 True Color', type: 'raster', hasOpacity: true },
};

const LULC_LEGEND = [
  { label: 'Water',       color: '#419BDF' },
  { label: 'Trees',       color: '#397D49' },
  { label: 'Grass',       color: '#88B053' },
  { label: 'Flooded Veg', color: '#7A87C6' },
  { label: 'Crops',       color: '#E49635' },
  { label: 'Shrub/Scrub', color: '#DFC35A' },
  { label: 'Built Area',  color: '#C4281B' },
  { label: 'Bare Ground', color: '#A59B8F' },
  { label: 'Snow/Ice',    color: '#B39FE1' },
];

// ─── DEFAULT PANEL LAYOUT ─────────────────────────────────────────
const DEFAULT_PANELS = {
  fingerprint:   { open: true, pinned: false, zIndex: 10, defaultPosition: { x: 24, y: 80 },  defaultSize: { width: 300, height: 'auto' } },
  attention:     { open: true, pinned: false, zIndex: 10, defaultPosition: { x: 'calc(100% - 340px)', y: 80 },  defaultSize: { width: 316, height: 'auto' } },
  layers:        { open: true, pinned: false, zIndex: 10, defaultPosition: { x: 24, y: 440 }, defaultSize: { width: 280, height: 'auto' } },
  intervention:  { open: true, pinned: false, zIndex: 10, defaultPosition: { x: 'calc(100% - 340px)', y: 340 }, defaultSize: { width: 316, height: 'auto' } },
  timeline:      { open: true, pinned: false, zIndex: 10, defaultPosition: { x: '50%', y: 'calc(100% - 240px)' }, defaultSize: { width: 700, height: 140 } },
};

export default function Watershed() {
  const navigate = useNavigate();
  const location = useLocation();
  const mapContainer = useRef(null);
  const map = useRef(null);
  const drawRef = useRef(null);
  const abortRef = useRef(null);
  const layerMapRef = useRef({}); // maplibre layer IDs keyed by layerId

  // ─── Watershed Context (single source of truth) ───────────────
  const [wsCtx, setWsCtx] = useState(null);
  const [wsLoading, setWsLoading] = useState(false);
  const [wsError, setWsError] = useState(null);

  // ─── Panel data (each loads independently) ────────────────────
  const [fingerprint, setFingerprint] = useState(null);
  const [fpStatus, setFpStatus] = useState('IDLE'); // IDLE | LOADING | AVAILABLE | PENDING | ERROR
  const [attention, setAttention] = useState(null);
  const [attStatus, setAttStatus] = useState('IDLE');
  const [timeline, setTimeline] = useState(null);
  const [tlStatus, setTlStatus] = useState('IDLE');
  const [availableLayers, setAvailableLayers] = useState([]);

  // ─── Panel visibility & z-index ───────────────────────────────
  const [panels, setPanels] = useState(DEFAULT_PANELS);
  const [maxZ, setMaxZ] = useState(10);

  // ─── Active map layers ────────────────────────────────────────
  const [activeLayers, setActiveLayers] = useState({});     // { layerId: { opacity, tileUrl, status } }
  const [layerLoading, setLayerLoading] = useState({});     // { layerId: bool }

  // ─── Search / Resolve UI ──────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [savedWatersheds, setSavedWatersheds] = useState([]);
  const [savedOpen, setSavedOpen] = useState(false);

  // ─── Map click popup ──────────────────────────────────────────
  const [clickPopup, setClickPopup] = useState(null); // { lat, lon, x, y }
  const popupRef = useRef(null);

  // ─── Custom watershed builder ─────────────────────────────────
  const [builderMode, setBuilderMode] = useState(null); // null | 'draw' | 'import' | 'pour'
  const [drawPolygon, setDrawPolygon] = useState(null);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [saveNameInput, setSaveNameInput] = useState('');
  const [savingWs, setSavingWs] = useState(false);

  // ─── Timeline controls ────────────────────────────────────────
  const [tlSelectedIdx, setTlSelectedIdx] = useState(null);
  const [tlPlaying, setTlPlaying] = useState(false);
  const tlPlayRef = useRef(null);

  // ─── Map init ─────────────────────────────────────────────────
  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          satellite: {
            type: 'raster',
            tiles: ['https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'],
            tileSize: 256,
            attribution: '© Google'
          }
        },
        layers: [{ id: 'satellite-base', type: 'raster', source: 'satellite' }]
      },
      center: [0, 20],
      zoom: 2,
      attributionControl: false
    });

    map.current.on('load', () => {
      // Boundary / drainage vector sources (populated when WS is selected)
      map.current.addSource('ws-boundary', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.current.addLayer({
        id: 'ws-boundary-fill',
        type: 'fill',
        source: 'ws-boundary',
        paint: { 'fill-color': '#38bdf8', 'fill-opacity': 0.1 }
      });
      map.current.addLayer({
        id: 'ws-boundary-line',
        type: 'line',
        source: 'ws-boundary',
        paint: { 'line-color': '#38bdf8', 'line-width': 2, 'line-dasharray': [3, 2] }
      });

      // Draw polygon preview source
      map.current.addSource('draw-preview', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.current.addLayer({
        id: 'draw-preview-fill',
        type: 'fill',
        source: 'draw-preview',
        filter: ['==', 'type', 'fill'],
        paint: { 'fill-color': '#06b6d4', 'fill-opacity': 0.15 }
      });
      map.current.addLayer({
        id: 'draw-preview-line',
        type: 'line',
        source: 'draw-preview',
        filter: ['==', 'type', 'edge'],
        paint: { 'line-color': '#06b6d4', 'line-width': 2 }
      });
      map.current.addLayer({
        id: 'draw-preview-points',
        type: 'circle',
        source: 'draw-preview',
        filter: ['==', 'type', 'vertex'],
        paint: { 'circle-color': '#06b6d4', 'circle-radius': 4, 'circle-stroke-width': 1.5, 'circle-stroke-color': '#fff' }
      });
    });

    map.current.on('click', (e) => {
      if (builderMode === 'draw') return; // drawing mode handles its own clicks
      const { lngLat } = e;
      const pt = map.current.project(lngLat);
      setClickPopup({ lat: lngLat.lat, lon: lngLat.lng, x: pt.x, y: pt.y });
    });

    return () => {
      if (map.current) { map.current.remove(); map.current = null; }
    };
  }, []);

  // Close popup on map move
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const close = () => setClickPopup(null);
    m.on('movestart', close);
    return () => m.off('movestart', close);
  }, []);

  // ─── Load saved watersheds ─────────────────────────────────────
  useEffect(() => {
    listSavedWatersheds().then(setSavedWatersheds).catch(() => {});
  }, []);

  // ─── When WS context is set, load panel data progressively ────
  useEffect(() => {
    if (!wsCtx || wsCtx.dataStatus === 'UNAVAILABLE') return;

    // Update boundary on map
    if (wsCtx.geometry && map.current?.getSource('ws-boundary')) {
      map.current.getSource('ws-boundary').setData({
        type: 'Feature',
        geometry: wsCtx.geometry
      });
      // Fly to boundary centroid
      if (wsCtx.centroid) {
        map.current.flyTo({
          center: [wsCtx.centroid.lon, wsCtx.centroid.lat],
          zoom: wsCtx.areaKm2 > 5000 ? 7 : wsCtx.areaKm2 > 500 ? 9 : 11,
          duration: 1500
        });
      }
    }

    // Cancel previous panel loads
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    const { signal } = abortRef.current;

    // Load fingerprint
    setFpStatus('LOADING');
    getFingerprint(wsCtx.id, wsCtx.geometry, signal)
      .then(fp => { setFingerprint(fp); setFpStatus('AVAILABLE'); })
      .catch(e => { if (e.name !== 'AbortError') setFpStatus('ERROR'); });

    // Load attention
    setAttStatus('LOADING');
    getAttention(wsCtx.id, wsCtx.geometry, signal)
      .then(att => { setAttention(att); setAttStatus(att?.dataStatus || 'AVAILABLE'); })
      .catch(e => { if (e.name !== 'AbortError') setAttStatus('ERROR'); });

    // Load timeline
    setTlStatus('LOADING');
    getTimeline(wsCtx.id, wsCtx.geometry, signal)
      .then(tl => { setTimeline(tl); setTlStatus(tl?.dataStatus || 'AVAILABLE'); })
      .catch(e => { if (e.name !== 'AbortError') setTlStatus('ERROR'); });

    // Load available layers
    getAvailableLayers(wsCtx.id, signal)
      .then(data => { setAvailableLayers(data?.available || []); })
      .catch(() => {});

    return () => { abortRef.current?.abort(); };
  }, [wsCtx?.id]);

  // ─── Resolve on map click ─────────────────────────────────────
  const handleResolve = useCallback(async (lat, lon) => {
    setClickPopup(null);
    setWsLoading(true);
    setWsError(null);
    setWsCtx(null);
    setFingerprint(null);
    setAttention(null);
    setTimeline(null);
    setActiveLayers({});
    try {
      const ctx = await resolveWatershed(lat, lon);
      setWsCtx(ctx);
    } catch (err) {
      setWsError(err.message);
    } finally {
      setWsLoading(false);
    }
  }, []);

  // ─── Search ───────────────────────────────────────────────────
  const searchDebounceRef = useRef(null);
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const results = await searchWatersheds(searchQuery);
        setSearchResults(results || []);
      } catch (_) {}
    }, 400);
  }, [searchQuery]);

  const selectSearchResult = (r) => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    setWsCtx(r);
    if (r.centroid) {
      map.current?.flyTo({ center: [r.centroid.lon, r.centroid.lat], zoom: 9, duration: 1500 });
    }
  };

  // ─── Panel management ─────────────────────────────────────────
  const bringToFront = useCallback((panelId) => {
    setMaxZ(z => {
      const newZ = z + 1;
      setPanels(p => ({ ...p, [panelId]: { ...p[panelId], zIndex: newZ } }));
      return newZ;
    });
  }, []);

  const togglePanel = (id) => {
    setPanels(p => ({ ...p, [id]: { ...p[id], open: !p[id].open } }));
  };

  const resetWorkspace = () => {
    setPanels(DEFAULT_PANELS);
    setMaxZ(10);
  };

  // ─── Layer management ─────────────────────────────────────────
  const toggleLayer = useCallback(async (layerId) => {
    if (activeLayers[layerId]) {
      // Remove from map
      const m = map.current;
      if (m) {
        const mapLayerId = `ee-layer-${layerId}`;
        if (m.getLayer(mapLayerId)) m.removeLayer(mapLayerId);
        if (m.getSource(mapLayerId)) m.removeSource(mapLayerId);
      }
      setActiveLayers(prev => { const n = { ...prev }; delete n[layerId]; return n; });
      return;
    }

    if (!wsCtx) return;

    setLayerLoading(prev => ({ ...prev, [layerId]: true }));
    try {
      const result = await getLayerTile(wsCtx.id, layerId, wsCtx.geometry);
      if (result?.available && result.tileUrl) {
        const m = map.current;
        const mapLayerId = `ee-layer-${layerId}`;
        if (m) {
          if (m.getLayer(mapLayerId)) m.removeLayer(mapLayerId);
          if (m.getSource(mapLayerId)) m.removeSource(mapLayerId);
          m.addSource(mapLayerId, { type: 'raster', tiles: [result.tileUrl], tileSize: 256 });
          m.addLayer({
            id: mapLayerId,
            type: 'raster',
            source: mapLayerId,
            paint: { 'raster-opacity': 0.8 }
          }, 'ws-boundary-fill');
        }
        setActiveLayers(prev => ({
          ...prev,
          [layerId]: { opacity: 0.8, tileUrl: result.tileUrl, status: 'AVAILABLE', meta: result }
        }));
      } else {
        setActiveLayers(prev => ({
          ...prev,
          [layerId]: { status: result?.dataStatus || 'UNAVAILABLE', reason: result?.reason }
        }));
      }
    } catch (err) {
      setActiveLayers(prev => ({
        ...prev,
        [layerId]: { status: 'ERROR', reason: err.message }
      }));
    } finally {
      setLayerLoading(prev => { const n = { ...prev }; delete n[layerId]; return n; });
    }
  }, [wsCtx, activeLayers]);

  const setLayerOpacity = (layerId, opacity) => {
    const mapLayerId = `ee-layer-${layerId}`;
    if (map.current?.getLayer(mapLayerId)) {
      map.current.setPaintProperty(mapLayerId, 'raster-opacity', opacity);
    }
    setActiveLayers(prev => ({ ...prev, [layerId]: { ...prev[layerId], opacity } }));
  };

  // ─── Timeline playback ────────────────────────────────────────
  const tlObs = timeline?.observations || [];

  useEffect(() => {
    if (!tlPlaying) { clearInterval(tlPlayRef.current); return; }
    tlPlayRef.current = setInterval(() => {
      setTlSelectedIdx(i => {
        const next = (i == null ? 0 : i + 1);
        if (next >= tlObs.length) { setTlPlaying(false); return i; }
        return next;
      });
    }, 1200);
    return () => clearInterval(tlPlayRef.current);
  }, [tlPlaying, tlObs.length]);

  // ─── Draw boundary ────────────────────────────────────────────
  const [drawPointsState, setDrawPointsState] = useState(0);
  const drawPoints = useRef([]);
  const drawCursor = useRef(null);

  const updateDrawPreview = useCallback(() => {
    const pts = drawPoints.current;
    const m = map.current;
    if (!m) return;
    
    if (!pts.length) {
      m.getSource('draw-preview')?.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    const features = [];
    pts.forEach(p => {
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: p }, properties: { type: 'vertex' } });
    });

    const lineCoords = [...pts];
    if (drawCursor.current) {
      lineCoords.push([drawCursor.current.lng, drawCursor.current.lat]);
    }
    
    if (lineCoords.length > 1) {
      features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: lineCoords }, properties: { type: 'edge' } });
    }

    if (pts.length >= 3) {
      const polyCoords = [...pts];
      if (drawCursor.current) polyCoords.push([drawCursor.current.lng, drawCursor.current.lat]);
      polyCoords.push(polyCoords[0]); // close
      features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [polyCoords] }, properties: { type: 'fill' } });
    }
    
    m.getSource('draw-preview')?.setData({ type: 'FeatureCollection', features });
    setDrawPointsState(pts.length);
  }, []);

  const startDraw = () => {
    setBuilderMode('draw');
    drawPoints.current = [];
    drawCursor.current = null;
    updateDrawPreview();
    map.current?.getCanvas().style.setProperty('cursor', 'crosshair');
  };

  const cancelDraw = () => {
    setBuilderMode(null);
    drawPoints.current = [];
    drawCursor.current = null;
    setDrawPolygon(null);
    updateDrawPreview();
    map.current?.getCanvas().style.removeProperty('cursor');
  };

  const undoDraw = () => {
    drawPoints.current.pop();
    updateDrawPreview();
  };

  const clearDraw = () => {
    drawPoints.current = [];
    updateDrawPreview();
  };

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (builderMode !== 'draw') return;

    const onMapClick = (e) => {
      const { lng, lat } = e.lngLat;
      drawPoints.current.push([lng, lat]);
      updateDrawPreview();
    };

    const onMapMove = (e) => {
      drawCursor.current = e.lngLat;
      updateDrawPreview();
    };

    const onDblClick = (e) => {
      e.preventDefault();
      if (drawPoints.current.length >= 3) {
        drawCursor.current = null;
        updateDrawPreview();
        const coords = [...drawPoints.current, drawPoints.current[0]];
        const geom = { type: 'Polygon', coordinates: [coords] };
        setDrawPolygon(geom);
        m.getCanvas().style.removeProperty('cursor');
        setBuilderMode('draw_done');
      }
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') cancelDraw();
    };

    m.on('click', onMapClick);
    m.on('mousemove', onMapMove);
    m.on('dblclick', onDblClick);
    window.addEventListener('keydown', onKeyDown);
    
    return () => { 
      m.off('click', onMapClick); 
      m.off('mousemove', onMapMove); 
      m.off('dblclick', onDblClick); 
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [builderMode, updateDrawPreview]);

  // ─── Save custom watershed ────────────────────────────────────
  const handleSaveWatershed = async (geometry, type, source) => {
    if (!geometry || !geometry.coordinates || !geometry.coordinates[0]) return;
    const ring = geometry.coordinates[0];
    if (ring.length < 4) {
      alert("INVALID BOUNDARY: A polygon must have at least 3 vertices.");
      return;
    }
    const [first, last] = [ring[0], ring[ring.length - 1]];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      alert("INVALID BOUNDARY: Polygon ring is not closed.");
      return;
    }
    for (const [lng, lat] of ring) {
      if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
        alert("INVALID BOUNDARY: Coordinates out of valid geographic range.");
        return;
      }
    }

    const name = saveNameInput.trim() || 'My Custom Watershed';
    setSavingWs(true);
    try {
      const ws = await saveCustomWatershed({ name, type, geometry, source });
      setSavedWatersheds(prev => [...prev, ws]);
      // Activate this watershed
      setWsCtx({ ...ws, centroid: computeCentroidFromGeom(geometry), dataStatus: 'AVAILABLE' });
      setBuilderMode(null);
      setDrawPolygon(null);
      setSaveNameInput('');
      map.current?.getSource('draw-preview')?.setData({ type: 'FeatureCollection', features: [] });
    } catch (err) {
      alert(`Save failed: ${err.message}`);
    } finally {
      setSavingWs(false);
    }
  };

  const handleImportGeoJSON = async () => {
    setImportError('');
    let geojson;
    try {
      geojson = JSON.parse(importText);
    } catch (_) {
      setImportError('Invalid JSON. Please paste valid GeoJSON.');
      return;
    }
    const name = saveNameInput.trim() || 'Imported Watershed';
    setSavingWs(true);
    try {
      const ws = await importWatershed({ name, geojson });
      setSavedWatersheds(prev => [...prev, ws]);
      setWsCtx({ ...ws, centroid: computeCentroidFromGeom(ws.geometry), dataStatus: 'AVAILABLE' });
      setBuilderMode(null);
      setImportText('');
      setSaveNameInput('');
    } catch (err) {
      setImportError(err.message);
    } finally {
      setSavingWs(false);
    }
  };

  function computeCentroidFromGeom(geom) {
    try {
      const ring = geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates[0][0];
      const lons = ring.map(c => c[0]);
      const lats = ring.map(c => c[1]);
      return {
        lon: lons.reduce((a, b) => a + b, 0) / lons.length,
        lat: lats.reduce((a, b) => a + b, 0) / lats.length
      };
    } catch (_) { return null; }
  }

  // ─── Fingerprint bar width ────────────────────────────────────
  const ndviToWidth = (v) => v == null ? 0 : Math.max(5, Math.min(95, ((v + 0.2) / 1.0) * 100));
  const ndwiToWidth = (v) => v == null ? 0 : Math.max(5, Math.min(95, ((v + 0.5) / 1.0) * 100));

  // ─── Status badge ─────────────────────────────────────────────
  const StatusBadge = ({ status, small }) => {
    const colors = {
      AVAILABLE: '#10b981', PARTIAL: '#f59e0b', PENDING: '#6b7280',
      LOADING: '#3b82f6', ERROR: '#ef4444', 'NO DATA': '#6b7280',
      STALE: '#f59e0b', UNAVAILABLE: '#6b7280', IDLE: '#6b7280'
    };
    const color = colors[status] || '#6b7280';
    return (
      <span style={{
        fontFamily: 'monospace', fontSize: small ? '9px' : '10px',
        color, border: `1px solid ${color}33`,
        padding: '1px 5px', borderRadius: '3px', letterSpacing: '0.05em'
      }}>
        {status || 'PENDING'}
      </span>
    );
  };

  // ─── Grouped layers ───────────────────────────────────────────
  const groupedLayers = useMemo(() => {
    const groups = {};
    const layerList = availableLayers.length > 0
      ? availableLayers
      : Object.entries(LAYER_REGISTRY).map(([id, meta]) => ({ id, ...meta }));
    layerList.forEach(l => {
      const g = l.group || 'OTHER';
      if (!groups[g]) groups[g] = [];
      groups[g].push(l);
    });
    return groups;
  }, [availableLayers]);

  const tlObsSpread = useMemo(() => {
    if (!tlObs.length) return [];
    const allDates = tlObs.map(o => new Date(o.date).getTime());
    const min = Math.min(...allDates);
    const max = Math.max(...allDates);
    const range = max - min || 1;
    return tlObs.map((o, i) => ({
      ...o,
      pct: ((new Date(o.date).getTime() - min) / range) * 100,
      idx: i
    }));
  }, [tlObs]);

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────

  return (
    <div className="watershed-container">
      <AppNavigation />

      {/* MAP VIEWPORT — satellite is always the base */}
      <div className="map-viewport" ref={mapContainer} />

      {/* ── TOP CONTEXT BAR ─────────────────────────────────────── */}
      <div className="ws-top-bar">
        {/* Search */}
        <div className="ws-search-wrap">
          <Search size={13} color="#6b7280" />
          <input
            className="ws-search-input"
            placeholder="Search watershed, place or coordinates…"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
          />
          {searchResults.length > 0 && searchOpen && (
            <div className="ws-search-dropdown">
              {searchResults.map(r => (
                <div key={r.id} className="ws-search-item" onMouseDown={() => selectSearchResult(r)}>
                  <MapPin size={11} />
                  <div>
                    <div className="wsi-name">{r.name}</div>
                    <div className="wsi-meta">{r.areaKm2 ? `${r.areaKm2} km²` : ''} · {r.source || ''} · {r.matchType}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active WS badge */}
        <div className="ws-ctx-badge">
          {wsLoading && <span className="ws-spinner" />}
          {wsCtx && !wsLoading && (
            <>
              <span className="ws-ctx-name">{wsCtx.name}</span>
              <span className="ws-ctx-type">{wsCtx.type}</span>
              {wsCtx.areaKm2 && <span className="ws-ctx-meta">{wsCtx.areaKm2.toLocaleString()} km²</span>}
              {wsCtx.source && <span className="ws-ctx-source">{wsCtx.source.split(' ')[0]}</span>}
            </>
          )}
          {!wsCtx && !wsLoading && (
            <span className="ws-ctx-prompt">Click map to resolve watershed</span>
          )}
        </div>

        {/* Workspace manager */}
        <div className="ws-panel-manager">
          {Object.entries(panels).map(([id, p]) => (
            <button
              key={id}
              className={`wm-btn ${p.open ? 'active' : ''}`}
              onClick={() => togglePanel(id)}
              title={id}
            >
              {id.slice(0, 3).toUpperCase()}
            </button>
          ))}
          <button className="wm-btn reset" onClick={resetWorkspace} title="Reset Workspace">
            <RefreshCw size={12} />
          </button>
        </div>

        {/* New Watershed */}
        <button className="ws-new-btn" onClick={() => setBuilderMode('choose')}>
          <Plus size={13} /> NEW
        </button>

        {/* Saved */}
        <div style={{ position: 'relative' }}>
          <button className="ws-saved-btn" onClick={() => setSavedOpen(!savedOpen)}>
            <Download size={13} /> SAVED ({savedWatersheds.length})
          </button>
          {savedOpen && (
            <div className="ws-saved-dropdown">
              {savedWatersheds.length === 0 && <div style={{ padding: '8px 12px', color: '#6b7280', fontSize: '11px' }}>No saved watersheds</div>}
              {savedWatersheds.map(ws => (
                <div key={ws.id} className="ws-saved-item" onClick={() => {
                  setWsCtx({ ...ws, centroid: computeCentroidFromGeom(ws.geometry), dataStatus: 'AVAILABLE' });
                  setSavedOpen(false);
                }}>
                  <span>{ws.name}</span>
                  <span style={{ color: '#6b7280', fontSize: '10px' }}>{ws.type}</span>
                  <button onClick={e => { e.stopPropagation(); deleteWatershed(ws.id).then(() => setSavedWatersheds(p => p.filter(x => x.id !== ws.id))); }}>
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── MAP CLICK POPUP ──────────────────────────────────────── */}
      {clickPopup && (
        <div
          className="ws-click-popup"
          style={{ left: clickPopup.x + 16, top: clickPopup.y - 20 }}
        >
          <div className="wcp-coords">{clickPopup.lat.toFixed(5)}, {clickPopup.lon.toFixed(5)}</div>
          <button className="wcp-btn primary" onClick={() => handleResolve(clickPopup.lat, clickPopup.lon)}>
            <Crosshair size={12} /> RESOLVE WATERSHED
          </button>
          <button className="wcp-btn" onClick={() => { setClickPopup(null); startDraw(); }}>
            <Pen size={12} /> DRAW WATERSHED
          </button>
          <button className="wcp-btn" onClick={() => setClickPopup(null)}>
            <X size={12} /> DISMISS
          </button>
        </div>
      )}

      {/* ── CUSTOM WATERSHED BUILDER ─────────────────────────────── */}
      {builderMode && builderMode !== 'draw' && builderMode !== 'draw_done' && (
        <div className="ws-builder-overlay">
          <div className="ws-builder-card">
            <div className="wbc-header">
              <span>NEW WATERSHED</span>
              <button onClick={() => { setBuilderMode(null); setImportText(''); setImportError(''); setSaveNameInput(''); }}>
                <X size={16} />
              </button>
            </div>

            {builderMode === 'choose' && (
              <div className="wbc-choices">
                <button className="wbc-choice" onClick={async () => { setBuilderMode(null); const query = prompt('Search watershed name or coordinates:'); if (query) { setSearchQuery(query); setSearchOpen(true); } }}>
                  <Search size={20} />
                  <span>FIND EXISTING</span>
                  <small>Search HydroSHEDS global basin</small>
                </button>
                <button className="wbc-choice" onClick={() => { setBuilderMode(null); startDraw(); }}>
                  <Pen size={20} />
                  <span>DRAW BOUNDARY</span>
                  <small>Click map to draw custom AOI</small>
                </button>
                <button className="wbc-choice" onClick={() => setBuilderMode('import')}>
                  <Upload size={20} />
                  <span>IMPORT GEOJSON</span>
                  <small>Paste or upload GeoJSON geometry</small>
                </button>
                <button className="wbc-choice disabled" onClick={() => alert('Pour-point delineation: PENDING BACKEND\n\nThis feature requires HydroSHEDS flow direction analysis and is planned for a future release.')}>
                  <Navigation size={20} />
                  <span>POUR POINT</span>
                  <small>PENDING BACKEND — derive catchment</small>
                </button>
              </div>
            )}

            {builderMode === 'import' && (
              <div className="wbc-import">
                <label>WATERSHED NAME</label>
                <input
                  className="wbc-input"
                  placeholder="My Custom Watershed"
                  value={saveNameInput}
                  onChange={e => setSaveNameInput(e.target.value)}
                />
                <label style={{ marginTop: 12 }}>PASTE GEOJSON (Polygon / MultiPolygon / Feature)</label>
                <textarea
                  className="wbc-textarea"
                  placeholder='{"type":"Polygon","coordinates":[[...]]}'
                  value={importText}
                  onChange={e => { setImportText(e.target.value); setImportError(''); }}
                />
                {importError && <div className="wbc-error">{importError}</div>}
                <div className="wbc-actions">
                  <button className="wbc-action-btn secondary" onClick={() => setBuilderMode('choose')}>← BACK</button>
                  <button className="wbc-action-btn primary" onClick={handleImportGeoJSON} disabled={!importText || savingWs}>
                    {savingWs ? 'IMPORTING…' : 'IMPORT & SAVE'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Draw instruction banner */}
      {builderMode === 'draw' && (
        <div className="ws-draw-banner">
          <div className="ws-db-left">
            <Pen size={14} /> 
            <strong>DRAW WATERSHED</strong>
            <span>Click to place points · Double-click to finish · ESC to cancel</span>
          </div>
          <div className="ws-db-right">
            {drawPointsState > 0 && <button className="ws-db-btn" onClick={undoDraw}>UNDO</button>}
            {drawPointsState > 0 && <button className="ws-db-btn" onClick={clearDraw}>CLEAR</button>}
            <button className="ws-db-btn cancel" onClick={cancelDraw}><X size={12} /> CANCEL</button>
          </div>
        </div>
      )}

      {/* Draw done — save dialog */}
      {builderMode === 'draw_done' && drawPolygon && (
        <div className="ws-save-dialog">
          <div className="wsd-header">CUSTOM WATERSHED</div>
          <div className="wsd-geom-stats">
            {drawPoints.current.length} vertices · Ready to save
          </div>
          <input
            className="wbc-input"
            placeholder="Watershed name"
            value={saveNameInput}
            onChange={e => setSaveNameInput(e.target.value)}
          />
          <div className="wsd-actions">
            <button className="wbc-action-btn secondary" onClick={() => setBuilderMode('draw')}>EDIT</button>
            <button className="wbc-action-btn secondary" onClick={cancelDraw}>CANCEL</button>
            <button className="wbc-action-btn primary" onClick={() => handleSaveWatershed(drawPolygon, 'CUSTOM', 'User-drawn')} disabled={savingWs}>
              {savingWs ? 'SAVING…' : 'SAVE WATERSHED'}
            </button>
          </div>
        </div>
      )}

      {/* ── FLOATING PANELS ──────────────────────────────────────── */}

      {/* FINGERPRINT */}
      <FloatingPanel
        id="fingerprint"
        title={`WATERSHED FINGERPRINT${wsCtx ? ' · ' + wsCtx.name.slice(0, 20) : ''}`}
        isOpen={panels.fingerprint.open}
        isPinned={panels.fingerprint.pinned}
        onClose={() => togglePanel('fingerprint')}
        onPin={() => setPanels(p => ({ ...p, fingerprint: { ...p.fingerprint, pinned: !p.fingerprint.pinned } }))}
        bringToFront={bringToFront}
        zIndex={panels.fingerprint.zIndex}
        defaultPosition={panels.fingerprint.defaultPosition}
        defaultSize={panels.fingerprint.defaultSize}
      >
        <div className="fp-header-row">
          <StatusBadge status={fpStatus} />
          {wsCtx?.areaKm2 && <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#6b7280' }}>{wsCtx.areaKm2.toLocaleString()} km²</span>}
        </div>
        {fpStatus === 'LOADING' && <div className="fp-loading"><span className="ws-spinner" /> COMPUTING…</div>}
        {fpStatus === 'ERROR' && <div className="fp-msg error">ANALYSIS ERROR — Earth Engine may be unavailable</div>}
        {!wsCtx && fpStatus !== 'LOADING' && (
          <div className="fp-msg">Select a watershed to begin analysis</div>
        )}
        {wsCtx && (wsCtx.dataStatus === 'UNAVAILABLE') && (
          <div className="fp-msg warn">⚠ {wsCtx.unavailableReason || 'Source unavailable'}</div>
        )}
        {fingerprint && (
          <div className="fingerprint-container">
            {[
              { key: 'water', label: 'WATER', color: '#3b82f6', barWidth: ndwiToWidth(fingerprint.water?.value), cursor: 'ndwi' },
              { key: 'vegetation', label: 'VEGETATION', color: '#10b981', barWidth: ndviToWidth(fingerprint.vegetation?.value), cursor: 'ndvi' },
              { key: 'land', label: 'LAND COVER', color: '#d97706', barWidth: 0, cursor: 'lulc' },
              { key: 'drainage', label: 'DRAINAGE', color: '#6366f1', barWidth: 0, cursor: 'drainage' },
              { key: 'interventions', label: 'INTERVENTIONS', color: '#8b5cf6', barWidth: 0 },
              { key: 'fieldEvidence', label: 'FIELD EVIDENCE', color: '#38bdf8', barWidth: 0 },
              { key: 'temporalChange', label: 'TEMPORAL CHANGE', color: '#f59e0b', barWidth: 0 },
            ].map(({ key, label, color, barWidth, cursor }) => {
              const row = fingerprint[key] || {};
              const hasValue = row.status && row.status !== 'ANALYSIS PENDING' && row.status !== 'PENDING ANALYSIS' && row.status !== 'NOT CONNECTED';
              return (
                <div
                  key={key}
                  className="fp-row clickable"
                  onClick={() => cursor && toggleLayer(cursor)}
                  title={row.source || ''}
                >
                  <span className="fp-label">{label}</span>
                  <div className="fp-track">
                    {barWidth > 0 && (
                      <div className="fp-fill" style={{ background: color, width: `${barWidth}%` }} />
                    )}
                  </div>
                  <span className={hasValue ? 'fp-value' : 'fp-pending'}>
                    {hasValue ? row.status : (row.dataStatus === 'ERROR' ? 'ERROR' : 'PENDING')}
                  </span>
                </div>
              );
            })}
            {fingerprint.period && (
              <div style={{ fontFamily: 'monospace', fontSize: '10px', color: '#4b5563', marginTop: 4 }}>
                PERIOD: {fingerprint.period}
              </div>
            )}
          </div>
        )}
      </FloatingPanel>

      {/* ATTENTION */}
      <FloatingPanel
        id="attention"
        title="AREAS NEEDING ATTENTION"
        isOpen={panels.attention.open}
        isPinned={panels.attention.pinned}
        onClose={() => togglePanel('attention')}
        onPin={() => setPanels(p => ({ ...p, attention: { ...p.attention, pinned: !p.attention.pinned } }))}
        bringToFront={bringToFront}
        zIndex={panels.attention.zIndex}
        defaultPosition={panels.attention.defaultPosition}
        defaultSize={panels.attention.defaultSize}
      >
        <StatusBadge status={attStatus} />
        {attStatus === 'LOADING' && <div className="fp-loading"><span className="ws-spinner" /> CHECKING SIGNALS…</div>}
        {attStatus !== 'LOADING' && attention?.items?.length === 0 && (
          <div className="att-empty">
            <AlertTriangle size={14} color="#6b7280" />
            <div style={{ marginTop: 6, fontFamily: 'monospace', fontSize: '11px', color: '#6b7280', lineHeight: 1.5 }}>
              {!wsCtx
                ? 'Select a watershed to run attention analysis'
                : attention?.message || 'Attention analysis runs after fingerprint data is available'
              }
            </div>
          </div>
        )}
        {(attention?.items || []).map(item => (
          <div key={item.id} className={`att-item sev-${(item.severity || '').toLowerCase()}`}>
            <div className="att-header">
              <span className="att-title">{item.type}</span>
              <span className={`att-sev sev-${(item.severity || '').toLowerCase()}`}>{item.severity}</span>
            </div>
            <div className="att-reason">{item.reason}</div>
            <div className="att-actions">
              <button onClick={() => navigate('/compare')}>COMPARE</button>
              <button onClick={() => navigate('/mission')}>PLAN MISSION</button>
            </div>
          </div>
        ))}
      </FloatingPanel>

      {/* LAYERS */}
      <FloatingPanel
        id="layers"
        title="GEOSPATIAL LAYERS"
        isOpen={panels.layers.open}
        isPinned={panels.layers.pinned}
        onClose={() => togglePanel('layers')}
        onPin={() => setPanels(p => ({ ...p, layers: { ...p.layers, pinned: !p.layers.pinned } }))}
        bringToFront={bringToFront}
        zIndex={panels.layers.zIndex}
        defaultPosition={panels.layers.defaultPosition}
        defaultSize={panels.layers.defaultSize}
      >
        {!wsCtx && <div className="fp-msg">Select a watershed to load layers</div>}
        {Object.entries(groupedLayers).map(([group, layerList]) => (
          <div key={group} className="layer-group">
            <div className="layer-group-header">{group}</div>
            {layerList.map(layer => {
              const layerId = layer.id;
              const isActive = !!activeLayers[layerId]?.tileUrl || (layerId === 'boundary' && !!wsCtx?.geometry);
              const isLoading = layerLoading[layerId];
              const layerState = activeLayers[layerId];
              const meta = LAYER_REGISTRY[layerId] || {};
              return (
                <div key={layerId} className={`layer-toggle ${isActive ? 'active' : ''}`}>
                  <div className="lt-row" onClick={() => wsCtx && !isLoading && toggleLayer(layerId)}>
                    <div className="lt-dot" style={{ background: isActive ? meta.color || '#38bdf8' : 'transparent', borderColor: meta.color || '#38bdf8' }} />
                    <span className="layer-label">{layer.displayName || meta.displayName || layerId}</span>
                    {isLoading && <span className="ws-spinner sm" />}
                    {layerState?.status === 'UNAVAILABLE' && <span style={{ fontSize: '9px', color: '#ef4444' }}>N/A</span>}
                    {layer.coarseResolution && <span className="layer-tag">~9km</span>}
                  </div>
                  {isActive && meta.hasOpacity && layerState?.tileUrl && (
                    <input
                      type="range" min="0" max="1" step="0.05"
                      value={layerState.opacity ?? 0.8}
                      onChange={e => setLayerOpacity(layerId, parseFloat(e.target.value))}
                      className="layer-opacity"
                    />
                  )}
                  {isActive && meta.hasLegend && layerId === 'lulc' && (
                    <div className="lulc-legend">
                      {LULC_LEGEND.map(l => (
                        <span key={l.label} className="legend-chip" title={l.label}>
                          <span style={{ background: l.color }} />
                          {l.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {/* Boundary toggle is always available when WS is set */}
        {wsCtx && (
          <div
            className={`layer-toggle ${wsCtx?.geometry ? 'active' : ''}`}
            style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: 8, paddingTop: 8 }}
          >
            <div className="lt-row">
              <div className="lt-dot" style={{ background: '#38bdf8', borderColor: '#38bdf8' }} />
              <span className="layer-label">Watershed Boundary</span>
            </div>
          </div>
        )}
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <button
            className="layer-reset-btn"
            onClick={() => {
              // Remove all EE layers from map
              const m = map.current;
              Object.keys(activeLayers).forEach(layerId => {
                const mapLayerId = `ee-layer-${layerId}`;
                if (m?.getLayer(mapLayerId)) m.removeLayer(mapLayerId);
                if (m?.getSource(mapLayerId)) m.removeSource(mapLayerId);
              });
              setActiveLayers({});
            }}
          >
            RESET LAYERS
          </button>
        </div>
      </FloatingPanel>

      {/* INTERVENTION PASSPORT */}
      <FloatingPanel
        id="intervention"
        title="INTERVENTION PASSPORT"
        isOpen={panels.intervention.open}
        isPinned={panels.intervention.pinned}
        onClose={() => togglePanel('intervention')}
        onPin={() => setPanels(p => ({ ...p, intervention: { ...p.intervention, pinned: !p.intervention.pinned } }))}
        bringToFront={bringToFront}
        zIndex={panels.intervention.zIndex}
        defaultPosition={panels.intervention.defaultPosition}
        defaultSize={panels.intervention.defaultSize}
      >
        <div className="int-status">
          <StatusBadge status="PENDING" />
          <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#4b5563', marginLeft: 8 }}>NOT CONNECTED</span>
        </div>
        <div className="int-empty">
          <Activity size={14} color="#6b7280" />
          <div style={{ marginTop: 6 }}>
            Intervention data requires local field database integration.
          </div>
          <div style={{ marginTop: 4, color: '#4b5563' }}>
            Connect intervention records to enable passport view.
          </div>
        </div>
        <div className="int-actions">
          <button className="int-btn" onClick={() => navigate('/field')}>
            <MapPin size={12} /> FIELD OBSERVATION
          </button>
          <button className="int-btn" onClick={() => navigate('/mission')}>
            <Navigation size={12} /> PLAN MISSION
          </button>
          <button className="int-btn" onClick={() => navigate('/compare')}>
            <ExternalLink size={12} /> COMPARE SATELLITE
          </button>
        </div>
      </FloatingPanel>

      {/* TIMELINE (slim horizontal ribbon) */}
      <FloatingPanel
        id="timeline"
        title="TEMPORAL RIBBON"
        isOpen={panels.timeline.open}
        isPinned={panels.timeline.pinned}
        onClose={() => togglePanel('timeline')}
        onPin={() => setPanels(p => ({ ...p, timeline: { ...p.timeline, pinned: !p.timeline.pinned } }))}
        bringToFront={bringToFront}
        zIndex={panels.timeline.zIndex}
        defaultPosition={panels.timeline.defaultPosition}
        defaultSize={panels.timeline.defaultSize}
      >
        {tlStatus === 'LOADING' && <div className="fp-loading"><span className="ws-spinner" /> LOADING OBSERVATIONS…</div>}
        {tlStatus !== 'LOADING' && !wsCtx && <div className="fp-msg">Select a watershed to load timeline</div>}
        {tlStatus !== 'LOADING' && wsCtx && tlObs.length === 0 && (
          <div className="fp-msg">{timeline?.message || 'No satellite observations found for this location'}</div>
        )}
        {tlObs.length > 0 && (
          <div className="tl-workspace">
            <div className="tl-controls">
              <button className="tl-btn" onClick={() => setTlSelectedIdx(i => Math.max(0, (i ?? 0) - 1))}><SkipBack size={12} /></button>
              <button className="tl-btn" onClick={() => setTlPlaying(p => !p)}>
                {tlPlaying ? <Pause size={12} /> : <Play size={12} />}
              </button>
              <button className="tl-btn" onClick={() => setTlSelectedIdx(i => Math.min(tlObs.length - 1, (i ?? 0) + 1))}><SkipForward size={12} /></button>
              <span className="tl-info">
                {tlSelectedIdx != null ? tlObs[tlSelectedIdx]?.date : `${tlObs.length} OBS`}
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#4b5563' }}>SENTINEL-2</span>
            </div>

            <div className="tl-ribbon">
              <div className="tl-track" />
              {tlObsSpread.map(o => (
                <div
                  key={o.date}
                  className={`tl-obs ${o.idx === tlSelectedIdx ? 'active' : ''}`}
                  style={{ left: `${o.pct}%` }}
                  onClick={() => setTlSelectedIdx(o.idx)}
                  title={`${o.date}\n${o.dataset}`}
                />
              ))}
              {tlSelectedIdx != null && (
                <div
                  className="tl-cursor"
                  style={{ left: `${tlObsSpread[tlSelectedIdx]?.pct ?? 0}%` }}
                />
              )}
            </div>

            <div className="tl-date-range">
              <span>{tlObs[0]?.date?.slice(0, 7)}</span>
              <span>{tlObs[tlObs.length - 1]?.date?.slice(0, 7)}</span>
            </div>
          </div>
        )}
      </FloatingPanel>

      {/* ── ACTION DOCK ──────────────────────────────────────────── */}
      <div className="ws-action-dock">
        <button className="ws-control-btn" onClick={() => navigate('/explore')}>
          <Layers size={13} /> EXPLORE
        </button>
        <button className="ws-control-btn" onClick={() => {
          if (wsCtx?.centroid) {
            navigate('/compare', { state: { lat: wsCtx.centroid.lat, lon: wsCtx.centroid.lon, watershedId: wsCtx.id } });
          } else {
            navigate('/compare');
          }
        }}>
          <ArrowRight size={13} /> COMPARE
        </button>
        <button className="ws-control-btn primary" onClick={() => {
          if (wsCtx) {
            navigate('/mission', { state: { watershed: wsCtx } });
          } else {
            navigate('/mission');
          }
        }}>
          <Target size={13} /> PLAN MISSION
        </button>
        <button className="ws-control-btn" onClick={() => navigate('/field')}>
          <MapPin size={13} /> FIELD
        </button>
        <button className="ws-control-btn" onClick={() => navigate('/evidence/ev-3841-b')}>
          <Check size={13} /> EVIDENCE
        </button>
        <button className="ws-control-btn" onClick={() => navigate('/ask')}>
          <Activity size={13} /> ASK DHARAWATCH
        </button>
      </div>

      {/* ── MAP ZOOM CONTROLS ─────────────────────────────────────── */}
      <div className="ws-zoom-controls">
        <button onClick={() => map.current?.zoomIn()}><ZoomIn size={14} /></button>
        <button onClick={() => map.current?.zoomOut()}><ZoomOut size={14} /></button>
        <button onClick={() => map.current?.flyTo({ center: wsCtx?.centroid ? [wsCtx.centroid.lon, wsCtx.centroid.lat] : [0, 20], zoom: wsCtx ? 9 : 2 })}>
          <Maximize size={14} />
        </button>
      </div>

      {/* Global loading overlay (only for initial page load) */}
      {wsLoading && (
        <div className="ws-resolving-overlay">
          <div className="ws-spinner lg" />
          <div>RESOLVING WATERSHED…</div>
        </div>
      )}
    </div>
  );
}
