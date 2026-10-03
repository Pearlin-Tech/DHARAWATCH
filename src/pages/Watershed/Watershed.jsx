import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import maplibregl from '../../lib/maplibre';
import FloatingPanel from '../../components/FloatingPanel';
import AppNavigation from '../../components/AppNavigation';
import {
  resolvePoint, intersectGeometry,
  resolveWatershed, searchWatersheds, searchPlaces, listSavedWatersheds,
  getFingerprint, getAttention, getTimeline,
  getAvailableLayers, getLayerTile, getContextById,
  saveCustomWatershed, importWatershed, deleteWatershed
} from '../../services/watershedClient';


import {
  listInterventions, createIntervention, updateIntervention, addInspection, deleteIntervention,
  INTERVENTION_TYPES, INTERVENTION_STATUSES, getInterventionTypeInfo, getInterventionStatusInfo
} from '../../services/interventionClient';
import {
  Search, Layers, Activity, AlertTriangle, Clock, Target,
  ArrowRight, Plus, Download, Trash2, Eye, EyeOff,
  ZoomIn, ZoomOut, Maximize, MapPin, ChevronDown, ChevronRight,
  Upload, Pen, Crosshair, X, Check, RefreshCw, Play, Pause,
  SkipBack, SkipForward, Info, ExternalLink, Navigation,
  Hammer, Wrench, FilePlus, Camera, MapPin as MapPinIcon, Calendar
} from 'lucide-react';
import './Watershed.css';
import { WATERSHED_LAYERS } from '../../shared/layerRegistry.js';

// Helper to add timeout to any promise
function withTimeout(promise, ms, timeoutMsg) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(timeoutMsg || "Request timeout")), ms))
  ]);
}




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
  fingerprint:   { open: true, pinned: false, zIndex: 30, defaultPosition: { x: 24, y: 80 },  defaultSize: { width: 300, height: 'auto' } },
  attention:     { open: true, pinned: false, zIndex: 30, defaultPosition: { x: 'calc(100% - 340px)', y: 80 },  defaultSize: { width: 316, height: 'auto' } },
  layers:        { open: true, pinned: false, zIndex: 30, defaultPosition: { x: 24, y: 440 }, defaultSize: { width: 280, height: 'auto' } },
  intervention:  { open: true, pinned: false, zIndex: 30, defaultPosition: { x: 'calc(100% - 340px)', y: 340 }, defaultSize: { width: 316, height: 'auto' } },
  timeline:      { open: true, pinned: false, zIndex: 30, defaultPosition: { x: '50%', y: 'calc(100% - 240px)' }, defaultSize: { width: 700, height: 140 } },
};

// ─── DEMO WATERSHED PRESETS ─────────────────────────────────────────
// IDs match the seeded HydroSHEDS records in the database.
const DEMO_WATERSHEDS = [
  {
    id: 'hybas-4050031610',
    name: 'Sardar Sarovar / Narmada',
    type: 'watershed',
    source: 'hydrosheds',
    lat: 21.8315,
    lon: 73.7485,
    areaKm2: 96271,
    centroid: { lat: 22.44, lon: 77.46 },
    river: 'Narmada',
    description: 'Major dam and reservoir on the Narmada River. Prime demonstration watershed with rich satellite history and field evidence.'
  },
  {
    id: 'hybas-4060026820',
    name: 'Subarnarekha Basin',
    type: 'watershed',
    source: 'hydrosheds',
    lat: 22.5,
    lon: 86.0,
    areaKm2: 19476,
    centroid: { lat: 22.5, lon: 86.0 },
    river: 'Subarnarekha',
    description: 'East-flowing river basin spanning Jharkhand, West Bengal, Odisha. Good for multi-state watershed analysis.'
  },
  {
    id: 'hybas-4071011740',
    name: 'Bhadar Basin',
    type: 'watershed',
    source: 'hydrosheds',
    lat: 21.8,
    lon: 70.0,
    areaKm2: 3730,
    centroid: { lat: 21.8, lon: 70.0 },
    river: 'Bhadar',
    description: 'Saurashtra region basin with check dams and irrigation infrastructure. Ideal for intervention tracking.'
  },
  {
    id: 'hybas-4040027780',
    name: 'Godavari Basin',
    type: 'watershed',
    source: 'hydrosheds',
    lat: 18.5,
    lon: 79.5,
    areaKm2: 311061,
    centroid: { lat: 18.5, lon: 79.5 },
    river: 'Godavari',
    description: 'The Godavari is the second largest river in India. Important for agricultural water security in peninsular India.'
  },
  {
    id: 'hybas-4040027100',
    name: 'Mahanadi Basin',
    type: 'watershed',
    source: 'hydrosheds',
    lat: 20.4,
    lon: 82.7,
    areaKm2: 135796,
    centroid: { lat: 20.4, lon: 82.7 },
    river: 'Mahanadi',
    description: 'Key river basin in eastern India spanning Chhattisgarh and Odisha. Rich in hydropower and agriculture.'
  },
  {
    id: 'hybas-6030007000',
    name: 'Amazon Basin',
    type: 'watershed',
    source: 'hydrosheds',
    lat: -3.4653,
    lon: -62.2159,
    areaKm2: 5926323,
    centroid: { lat: -3.47, lon: -62.22 },
    river: 'Amazon',
    description: 'World\'s largest drainage basin. Demonstrates global-scale watershed analysis capabilities.'
  },
  {
    id: 'hybas-1030020040',
    name: 'Congo Basin',
    type: 'watershed',
    source: 'hydrosheds',
    lat: -4.32,
    lon: 23.65,
    areaKm2: 3713646,
    centroid: { lat: -4.32, lon: 23.65 },
    river: 'Congo',
    description: 'The world\'s second largest river basin by discharge. Covers equatorial Africa with dense tropical forest cover.'
  }
];


import { useGlobalContext } from '../../context/GlobalContext';
import { useAppContext } from '../../components/UniversalContextBar';

export default function Watershed() {
  const navigate = useNavigate();
  const location = useLocation();
  const mapContainer = useRef(null);
  const map = useRef(null);
  const drawRef = useRef(null);
  const abortRef = useRef(null);
  const layerMapRef = useRef({}); // maplibre layer IDs keyed by layerId

  const { selectedFeature, setSelectedFeature, activeLayers, setActiveLayers } = useGlobalContext();
  const { setCurrentWatershed, setCurrentMission, setCurrentObservation, clearContext } = useAppContext();

  // ─── Watershed Context (single source of truth for the basin) ───────────────
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
  // availableLayers is always the full registry — not from a deprecated API
  const allLayerIds = Object.keys(WATERSHED_LAYERS);


  // ─── Interventions ────────────────────────────────────────────
  const [interventions, setInterventions] = useState([]);
  const [intStatus, setIntStatus] = useState('IDLE');
  const [intCreating, setIntCreating] = useState(false);
  const [intEditing, setIntEditing] = useState(null);
  const [intFormData, setIntFormData] = useState({});

  // ─── Panel visibility & z-index ───────────────────────────────
  const [panels, setPanels] = useState(DEFAULT_PANELS);
  const [maxZ, setMaxZ] = useState(30);

  // ─── Map layer state (holds tile URLs and opacity) ────────────
  // localLayerActive: local on/off state per layer (separate from GlobalContext activeLayers)
  const [localLayerActive, setLocalLayerActive] = useState({}); // { layerId: bool }
  const [layerState, setLayerState] = useState({});     // { layerId: { opacity, tileUrl, status } }
  const [layerLoading, setLayerLoading] = useState({}); // { layerId: bool }
  const layerAbortRefs = useRef({});                    // per-layer abort controllers


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
  const [builderMode, setBuilderMode] = useState(null); // null | 'draw' | 'draw_done' | 'import' | 'pour'
  const [drawPolygon, setDrawPolygon] = useState(null);
  const [drawAnalysis, setDrawAnalysis] = useState(null); // { area, candidates, drawn }
  const [drawAnalyzing, setDrawAnalyzing] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [saveNameInput, setSaveNameInput] = useState('');
  const [savingWs, setSavingWs] = useState(false);

  function computeBBoxFromGeom(geom) {
    try {
      const ring = geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates[0][0];
      const lons = ring.map(c => c[0]);
      const lats = ring.map(c => c[1]);
      return [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)]
      ];
    } catch (_) { return null; }
  }

  const selectWatershed = useCallback((watershed) => {
    setSearchOpen(false);
    setSearchQuery('');
    setSavedOpen(false);
    setDemoOpen(false);
    setClickPopup(null);
    setBuilderMode(null);
    
    // Clear all panel data when switching basins
    setFingerprint(null); setFpStatus('IDLE');
    setAttention(null); setAttStatus('IDLE');
    setTimeline(null); setTlStatus('IDLE');
    setAvailableLayers([]);
    setInterventions([]); setIntStatus('IDLE');
    setActiveLayers({});
    setLayerState({});
    
    const ctx = { ...watershed, dataStatus: watershed.dataStatus || 'AVAILABLE' };

    // Normalize centroid: DB records use center:[lon,lat], we need centroid:{lon,lat}
    if (!ctx.centroid && Array.isArray(ctx.center) && ctx.center.length === 2) {
      ctx.centroid = { lon: ctx.center[0], lat: ctx.center[1] };
    }
    // Also derive from bbox if still missing
    if (!ctx.centroid && Array.isArray(ctx.bbox) && ctx.bbox.length === 4) {
      ctx.centroid = { lon: (ctx.bbox[0] + ctx.bbox[2]) / 2, lat: (ctx.bbox[1] + ctx.bbox[3]) / 2 };
    }
    // Also derive from geometry if available
    if (!ctx.centroid && ctx.geometry) {
      try {
        const ring = ctx.geometry.type === 'Polygon' ? ctx.geometry.coordinates[0] : ctx.geometry.coordinates[0][0];
        const lons = ring.map(c => c[0]);
        const lats = ring.map(c => c[1]);
        ctx.centroid = {
          lon: lons.reduce((a, b) => a + b, 0) / lons.length,
          lat: lats.reduce((a, b) => a + b, 0) / lats.length
        };
      } catch (_) {}
    }
    
    setWsCtx(ctx);
    
    if (ctx.id) {
      const newUrl = new URL(window.location);
      newUrl.searchParams.set('id', ctx.id);
      window.history.pushState({}, '', newUrl);
    }
  }, []);

  // ─── Demo watershed loading ───────────────────────────────────
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoLoading, setDemoLoading] = useState(null);

  const loadDemoWatershed = useCallback(async (demo) => {
    setDemoLoading(demo.id);
    setDemoOpen(false);
    try {
      // Always load from the real backend so we get authentic geometry + analytics
      const ws = await getContextById(demo.id);
      if (ws) {
        selectWatershed({ ...ws, dataStatus: 'AVAILABLE' });
      } else {
        // Backend didn't return a watershed — use demo metadata with centroid-only context
        selectWatershed({ ...demo, dataStatus: 'AVAILABLE' });
      }

      // Fly to demo centroid (fast, no waiting for geometry to load)
      if (map.current && demo.centroid) {
        map.current.flyTo({
          center: [demo.centroid.lon, demo.centroid.lat],
          zoom: demo.areaKm2 > 1000000 ? 5 : demo.areaKm2 > 50000 ? 7 : 9,
          duration: 2000
        });
      }
    } catch (err) {
      console.error('Demo load failed:', err);
      // Still show something using demo metadata
      selectWatershed({ ...demo, dataStatus: 'AVAILABLE' });
      if (map.current && demo.centroid) {
        map.current.flyTo({ center: [demo.centroid.lon, demo.centroid.lat], zoom: 9, duration: 2000 });
      }
    } finally {
      setDemoLoading(null);
    }
  }, []);

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
      attributionControl: false,
      doubleClickZoom: false
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
      // Drawing mode handles its own clicks below in a separate useEffect.
      // Normal single click should do nothing significant here.
    });

    map.current.on('dblclick', (e) => {
      if (builderMode === 'draw') return;
      const { lngLat } = e;
      const pt = map.current.project(lngLat);
      setClickPopup({ type: 'context-menu', lat: lngLat.lat, lon: lngLat.lng, x: pt.x, y: pt.y });
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

  // ─── URL SUPPORT ──────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const id = params.get('id');
    
    listSavedWatersheds().then(async saved => {
      setSavedWatersheds(saved);
      if (!id) return;

      // 1. Check in-memory saved list
      const existing = saved.find(w => w.id === id);
      if (existing) { selectWatershed(existing); return; }

      // 2. Check DEMO_WATERSHEDS list (fast path — no network needed)
      const demo = DEMO_WATERSHEDS.find(d => d.id === id);
      if (demo) { loadDemoWatershed(demo); return; }

      // 3. Fetch from backend — handles any HydroSHEDS ID or custom area
      try {
        setWsLoading(true);
        const ws = await getContextById(id);
        if (ws) selectWatershed({ ...ws, dataStatus: 'AVAILABLE' });
        else setWsError(`Watershed "${id}" not found.`);
      } catch (err) {
        setWsError(err.message || `Could not load watershed "${id}".`);
      } finally {
        setWsLoading(false);
      }
    }).catch(() => {});
  }, [location.search, selectWatershed, loadDemoWatershed]);

  // ─── Load saved watersheds ─────────────────────────────────────

  // ─── When WS context is set, load panel data progressively ────
  useEffect(() => {
    if (!wsCtx || wsCtx.dataStatus === 'UNAVAILABLE') return;

    // Clean up old EE layers to prevent stale imagery
    if (map.current) {
      const layersToRemove = Object.keys(WATERSHED_LAYERS).map(id => `ee-layer-${id}`);
      layersToRemove.forEach(layerId => {
        if (map.current.getLayer(layerId)) map.current.removeLayer(layerId);
        if (map.current.getSource(layerId)) map.current.removeSource(layerId);
      });
    }

    // Update boundary on map
    if (wsCtx.geometry && map.current?.getSource('ws-boundary')) {
      map.current.getSource('ws-boundary').setData({
        type: 'Feature',
        geometry: wsCtx.geometry
      });
      // Fit to boundary if possible
      const bounds = computeBBoxFromGeom(wsCtx.geometry);
      if (bounds) {
        map.current.fitBounds(bounds, { padding: 100, duration: 1500 });
      } else if (wsCtx.centroid?.lon && wsCtx.centroid?.lat) {
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

    // Helper to add timeout to any promise
    const withTimeout = (promise, ms, timeoutMsg) => {
      return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(timeoutMsg || 'Request timeout')), ms))
      ]);
    };

    // Load fingerprint
    setFpStatus('LOADING');
    withTimeout(getFingerprint(wsCtx, signal), 30000, 'Fingerprint timeout')
      .then(fp => { setFingerprint(fp); setFpStatus(fp?.status === 'NO_IMAGERY' ? 'NO DATA' : 'AVAILABLE'); })
      .catch(e => { if (e.name !== 'AbortError') setFpStatus('ERROR'); });

    // Load attention
    setAttStatus('LOADING');
    withTimeout(getAttention(wsCtx, signal), 30000, 'Attention timeout')
      .then(att => { 
        setAttention(att); 
        setAttStatus(att?.status === 'INSUFFICIENT_DATA' ? 'INSUFFICIENT DATA' : (att?.status === 'NO_ATTENTION_ITEMS' ? 'NO DATA' : (att?.dataStatus || 'AVAILABLE'))); 
      })
      .catch(e => { if (e.name !== 'AbortError') setAttStatus('ERROR'); });

    // Load timeline
    setTlStatus('LOADING');
    withTimeout(getTimeline(wsCtx, signal), 60000, 'Timeline timeout')
      .then(tl => { 
        setTimeline(tl); 
        setTlStatus(tl?.status === 'NO_IMAGERY' ? 'NO DATA' : (tl?.status || 'AVAILABLE')); 
      })
      .catch(e => { if (e.name !== 'AbortError') setTlStatus('ERROR'); });

    // Load available layers (removed since we always load all layers)


    // Load interventions
    setIntStatus('LOADING');
    withTimeout(listInterventions({ watershedId: wsCtx.id }, signal), 15000, 'Interventions timeout')
      .then(ints => { setInterventions(ints || []); setIntStatus(ints && ints.length > 0 ? 'AVAILABLE' : 'NO DATA'); })
      .catch(e => { if (e.name !== 'AbortError') setIntStatus('ERROR'); });

    return () => { abortRef.current?.abort(); };
  }, [wsCtx?.id]);

  // ─── Sync watershed to Universal Context Bar ──────────────────
  useEffect(() => {
    if (wsCtx && wsCtx.dataStatus === 'AVAILABLE') {
      setCurrentWatershed({
        id: wsCtx.id,
        name: wsCtx.name,
        type: wsCtx.type,
        areaKm2: wsCtx.areaKm2,
        centroid: wsCtx.centroid
      });
    } else if (!wsCtx || wsCtx.dataStatus === 'UNAVAILABLE') {
      // Don't clear context on UNAVAILABLE - keep the last known watershed
      // clearContext() is called explicitly when needed
    }
  }, [wsCtx?.id, wsCtx?.dataStatus, setCurrentWatershed]);

  // ─── Resolve on map click / coordinate ───────────────────────
  const handleResolve = useCallback(async (lat, lon) => {
    setClickPopup(null);
    setWsLoading(true);
    setWsError(null);
    setWsCtx(null);
    setFingerprint(null); setFpStatus('IDLE');
    setAttention(null); setAttStatus('IDLE');
    setTimeline(null); setTlStatus('IDLE');
    setAvailableLayers([]);
    setActiveLayers({});

    // Fly to the clicked location immediately so the user sees something
    if (map.current) {
      map.current.flyTo({ center: [lon, lat], zoom: 9, duration: 1000 });
    }

    try {
      const resp = await resolvePoint(lat, lon);
      const candidates = resp?.candidates || [];
      if (candidates.length === 0) {
        setWsError(`No HydroSHEDS watershed found at (${lat.toFixed(4)}, ${lon.toFixed(4)}). This may be ocean or an unmapped region.`);
        return;
      }
      if (candidates.length === 1) {
        // Auto-select the single result
        const ws = await getContextById(candidates[0].id);
        if (ws) selectWatershed({ ...ws, dataStatus: 'AVAILABLE' });
        return;
      }
      // Multiple candidates at different levels → show the most specific one (highest level)
      // but also store all candidates for the UI to display as choices
      const best = candidates[candidates.length - 1];
      const ws = await getContextById(best.id);
      if (ws) {
        // Store all candidates on the context for the watershed chooser panel
        selectWatershed({ ...ws, dataStatus: 'AVAILABLE', candidates });
      }
    } catch (err) {
      if (err.code === 'NO_WATERSHED_FOUND') {
        setWsError(`No watershed found at (${lat.toFixed(4)}, ${lon.toFixed(4)}).`);
      } else if (err.name !== 'AbortError') {
        setWsError(err.message);
      }
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
        const results = await searchPlaces(searchQuery);
        setSearchResults(results || []);
      } catch (_) {}
    }, 400);
  }, [searchQuery]);

  const selectSearchResult = (r) => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);

    // If the search result is a saved WATERSHED context from our DB, load it directly
    if (r.contextId && r.source === 'saved') {
      loadDemoWatershed({ id: r.contextId, centroid: r.center ? { lon: r.center[0], lat: r.center[1] } : null, areaKm2: r.areaKm2 || 10000 });
      return;
    }

    // For any result with real coordinates, resolve the watershed at that point.
    // We ALWAYS use real coordinates — never substitute a demo.
    const lat = r.lat ?? r.latitude ?? r.centroid?.lat;
    const lon = r.lon ?? r.longitude ?? r.centroid?.lon;

    if (lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      // Move map to the selected location first
      if (map.current) {
        map.current.flyTo({ center: [lon, lat], zoom: 8, duration: 1200 });
      }
      handleResolve(lat, lon);
      return;
    }

    // If result has geometry directly (e.g. saved watershed), use it
    if (r.geometry) {
      selectWatershed(r);
      return;
    }

    // Cannot resolve — show an error
    setWsError(`Could not determine location for "${r.name}". No coordinates available.`);
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
    setMaxZ(30);
  };

  // ─── Layer management ─────────────────────────────────────────
  const toggleLayer = useCallback((layerId) => {
    setLocalLayerActive(prev => ({ ...prev, [layerId]: !prev[layerId] }));
  }, []);

  // Sync map layers when localLayerActive changes
  useEffect(() => {
    if (!wsCtx || wsCtx.dataStatus === 'UNAVAILABLE' || !map.current) return;

    const syncLayers = async () => {
      // Ensure we only try to add layers if the map style is loaded
      if (!map.current.loaded() && !map.current.isStyleLoaded()) {
        setTimeout(syncLayers, 500); // retry
        return;
      }

      for (const layerId of allLayerIds) {
        if (layerId === 'boundary') continue; // Handled by wsCtx natively

        const isActive = localLayerActive[layerId];
        const isLoaded = !!layerState[layerId];
        const mapLayerId = `ee-layer-${layerId}`;

        if (isActive && !isLoaded && !layerLoading[layerId]) {
          setLayerLoading(prev => ({ ...prev, [layerId]: true }));
          
          // Abort previous request for this layer if any
          if (layerAbortRefs.current[layerId]) layerAbortRefs.current[layerId].abort();
          layerAbortRefs.current[layerId] = new AbortController();
          const signal = layerAbortRefs.current[layerId].signal;

          try {
            // FIX: getLayerTile signature is (ctx, layerId, signal)
            const result = await getLayerTile(wsCtx, layerId, signal);
            
            if (result?.available && result.tileUrl) {
              const m = map.current;
              if (m && m.isStyleLoaded()) {
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
              setLayerState(prev => ({
                ...prev,
                [layerId]: { opacity: 0.8, tileUrl: result.tileUrl, status: 'AVAILABLE', meta: result }
              }));
            } else {
              setLayerState(prev => ({
                ...prev,
                [layerId]: { status: result?.dataStatus || 'UNAVAILABLE', reason: result?.reason }
              }));
            }
          } catch (err) {
            if (err.name !== 'AbortError') {
              setLayerState(prev => ({
                ...prev,
                [layerId]: { status: 'ERROR', reason: err.message }
              }));
            }
          } finally {
            setLayerLoading(prev => { const n = { ...prev }; delete n[layerId]; return n; });
          }
        } else if (!isActive && isLoaded) {
          const m = map.current;
          if (m && m.isStyleLoaded()) {
            if (m.getLayer(mapLayerId)) m.removeLayer(mapLayerId);
            if (m.getSource(mapLayerId)) m.removeSource(mapLayerId);
          }
          setLayerState(prev => { const n = { ...prev }; delete n[layerId]; return n; });
        }
      }
    };
    syncLayers();
  }, [localLayerActive, allLayerIds, wsCtx]);


  const setLayerOpacity = (layerId, opacity) => {
    const mapLayerId = `ee-layer-${layerId}`;
    if (map.current?.getLayer(mapLayerId)) {
      map.current.setPaintProperty(mapLayerId, 'raster-opacity', opacity);
    }
    setLayerState(prev => ({ ...prev, [layerId]: { ...prev[layerId], opacity } }));
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

    // Disable double-click zoom while drawing
    m.doubleClickZoom.disable();

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
      m.doubleClickZoom.enable(); // Re-enable double-click zoom
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [builderMode, updateDrawPreview]);

  // ─── Analyze drawn polygon against HydroSHEDS ────────────────
  useEffect(() => {
    if (!drawPolygon || builderMode !== 'draw_done') return;
    setDrawAnalysis(null);
    setDrawAnalyzing(true);
    intersectGeometry(drawPolygon)
      .then(r => {
        setDrawAnalysis({
          area: r.drawn?.areaKm2 || 0,
          candidates: r.candidates || [],
          drawn: r.drawn || null
        });
      })
      .catch(err => {
        console.error('Draw analysis failed:', err);
        setDrawAnalysis({ area: 0, candidates: [], error: err.message });
      })
      .finally(() => setDrawAnalyzing(false));
  }, [drawPolygon, builderMode]);

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
      selectWatershed(ws);
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
      selectWatershed({ ...ws, centroid: ws.centroid, dataStatus: 'AVAILABLE' });
      setBuilderMode(null);
      setImportText('');
      setSaveNameInput('');
    } catch (err) {
      setImportError(err.message);
    } finally {
      setSavingWs(false);
    }
  };

  // ─── Intervention Handlers ──────────────────────────────────────────
  const handleDeleteIntervention = async (id) => {
    if (!confirm('Delete this intervention?')) return;
    try {
      await deleteIntervention(id);
      setInterventions(prev => prev.filter(i => i.id !== id));
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  };

  const handleAddInspection = (intervention) => {
    setIntFormData({ inspectionFor: intervention, inspectionDate: new Date().toISOString().split('T')[0], inspectionStatus: 'COMPLETED', inspectionNotes: '', inspectionInspector: 'FIELD_TEAM' });
  };

  const handleSubmitInspection = async (data) => {
    try {
      await addInspection(data.inspectionFor.id, {
        date: data.inspectionDate,
        status: data.inspectionStatus,
        notes: data.inspectionNotes,
        inspector: data.inspectionInspector
      });
      setIntFormData({});
      // Reload interventions to show updated inspection
      const updated = await listInterventions({ watershedId: wsCtx.id });
      setInterventions(updated || []);
    } catch (err) {
      alert('Failed to add inspection: ' + err.message);
    }
  };

  const flyToIntervention = (intv) => {
    if (intv.coordinates && map.current) {
      map.current.flyTo({ center: [intv.coordinates.lng, intv.coordinates.lat], zoom: 16, duration: 1500 });
    }
  };

  const handleSubmitIntervention = async (data) => {
    if (!data.name || !data.type || !data.coordinates) {
      alert('Name, type, and coordinates are required');
      return;
    }
    if (!wsCtx) return;
    
    const interventionData = {
      watershedId: wsCtx.id,
      name: data.name,
      type: data.type,
      status: data.status || 'PLANNED',
      coordinates: data.coordinates,
      notes: data.notes || '',
      constructionDate: data.constructionDate || null,
      linkedMissionId: data.linkedMissionId || null,
      linkedObservationId: data.linkedObservationId || null
    };
    
    setIntCreating(true);
    try {
      if (data.id) {
        await updateIntervention(data.id, interventionData);
        setInterventions(prev => prev.map(i => i.id === data.id ? { ...i, ...interventionData, updatedAt: new Date().toISOString() } : i));
      } else {
        const newInt = await createIntervention(interventionData);
        setInterventions(prev => [...prev, newInt]);
      }
      setIntEditing(null);
      setIntFormData({});
    } catch (err) {
      alert('Failed to save intervention: ' + err.message);
    } finally {
      setIntCreating(false);
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

  // ─── Intervention Components ───────────────────────────────────
  const InterventionCard = ({ intervention, onEdit, onDelete, onInspect, onViewMap }) => {
    const typeInfo = getInterventionTypeInfo(intervention.type);
    const statusInfo = getInterventionStatusInfo(intervention.status);
    const lastInspection = intervention.inspections?.[intervention.inspections.length - 1];
    
    return (
      <div className="int-card" style={{ 
        background: 'rgba(255,255,255,0.02)', 
        border: '1px solid rgba(255,255,255,0.08)', 
        borderRadius: 6, 
        padding: 12,
        borderLeft: `3px solid ${statusInfo.color}`
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>{typeInfo.icon}</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{intervention.name}</div>
              <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'capitalize' }}>{intervention.type}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="int-card-btn" onClick={onViewMap} title="View on map"><MapPin size={12} /></button>
            <button className="int-card-btn" onClick={onInspect} title="Add inspection"><Activity size={12} /></button>
            <button className="int-card-btn" onClick={onEdit} title="Edit"><Pen size={12} /></button>
            <button className="int-card-btn" onClick={onDelete} title="Delete"><Trash2 size={12} /></button>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: 16, fontSize: 11, marginBottom: 8 }}>
          <span style={{ color: statusInfo.color, fontWeight: 600, textTransform: 'capitalize' }}>{intervention.status.replace('_', ' ')}</span>
          {intervention.constructionDate && (
            <span style={{ color: '#9ca3af' }}>Built: {intervention.constructionDate.split('T')[0]}</span>
          )}
          {lastInspection && (
            <span style={{ color: '#38bdf8' }}>Last: {lastInspection.date.split('T')[0]}</span>
          )}
        </div>
        
        {intervention.notes && (
          <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 8, lineHeight: 1.4 }}>
            {intervention.notes}
          </div>
        )}
        
        {intervention.inspections && intervention.inspections.length > 0 && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 8 }}>
            <div style={{ fontSize: 9, color: '#6b7280', textTransform: 'uppercase', marginBottom: 4 }}>INSPECTIONS ({intervention.inspections.length})</div>
            {intervention.inspections.slice(-3).map((insp, i) => (
              <div key={i} style={{ fontSize: 10, color: '#9ca3af', display: 'flex', justifyContent: 'space-between' }}>
                <span>{insp.date.split('T')[0]} — {insp.status}</span>
                <span>{insp.inspector}</span>
              </div>
            ))}
          </div>
        )}
        
        {intervention.linkedMissionId && (
          <div style={{ marginTop: 8, fontSize: 10, color: '#38bdf8' }}>
            Linked to Mission: {intervention.linkedMissionId}
          </div>
        )}
      </div>
    );
  };

  const InterventionForm = ({ initialData, onSubmit, onCancel, isCreating }) => {
    const [formData, setFormData] = useState({
      name: initialData.name || '',
      type: initialData.type || 'Check Dam',
      status: initialData.status || 'PLANNED',
      coordinates: initialData.coordinates || { lat: '', lng: '' },
      notes: initialData.notes || '',
      constructionDate: initialData.constructionDate ? initialData.constructionDate.split('T')[0] : '',
      linkedMissionId: initialData.linkedMissionId || '',
      linkedObservationId: initialData.linkedObservationId || ''
    });

    const handleChange = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));
    const handleCoordChange = (coord, value) => setFormData(prev => ({ ...prev, coordinates: { ...prev.coordinates, [coord]: value } }));

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: 10, color: '#6b7280', marginBottom: 4 }}>NAME *</label>
          <input value={formData.name} onChange={e => handleChange('name', e.target.value)} className="int-form-input" placeholder="Intervention name" />
        </div>
        
        <div>
          <label style={{ display: 'block', fontSize: 10, color: '#6b7280', marginBottom: 4 }}>TYPE *</label>
          <select value={formData.type} onChange={e => handleChange('type', e.target.value)} className="int-form-input">
            {INTERVENTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
          </select>
        </div>
        
        <div>
          <label style={{ display: 'block', fontSize: 10, color: '#6b7280', marginBottom: 4 }}>STATUS</label>
          <select value={formData.status} onChange={e => handleChange('status', e.target.value)} className="int-form-input">
            {INTERVENTION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label style={{ display: 'block', fontSize: 10, color: '#6b7280', marginBottom: 4 }}>LATITUDE *</label>
            <input type="number" step="0.000001" value={formData.coordinates.lat} onChange={e => handleCoordChange('lat', parseFloat(e.target.value) || '')} className="int-form-input" placeholder="21.8315" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10, color: '#6b7280', marginBottom: 4 }}>LONGITUDE *</label>
            <input type="number" step="0.000001" value={formData.coordinates.lng} onChange={e => handleCoordChange('lng', parseFloat(e.target.value) || '')} className="int-form-input" placeholder="73.7485" />
          </div>
        </div>
        
        <div>
          <label style={{ display: 'block', fontSize: 10, color: '#6b7280', marginBottom: 4 }}>CONSTRUCTION DATE</label>
          <input type="date" value={formData.constructionDate} onChange={e => handleChange('constructionDate', e.target.value)} className="int-form-input" />
        </div>
        
        <div>
          <label style={{ display: 'block', fontSize: 10, color: '#6b7280', marginBottom: 4 }}>NOTES</label>
          <textarea value={formData.notes} onChange={e => handleChange('notes', e.target.value)} className="int-form-input" rows={3} placeholder="Additional notes..." />
        </div>
        
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="int-form-btn secondary" onClick={onCancel}>CANCEL</button>
          <button className="int-form-btn primary" onClick={() => onSubmit(formData)} disabled={!formData.name || !formData.type || !formData.coordinates.lat || !formData.coordinates.lng}>
            {isCreating ? 'CREATE' : 'SAVE'}
          </button>
        </div>
      </div>
    );
  };

  const InspectionForm = ({ interventionId, onSubmit, onCancel }) => {
    const [formData, setFormData] = useState({
      inspectionDate: new Date().toISOString().split('T')[0],
      inspectionStatus: 'COMPLETED',
      inspectionNotes: '',
      inspectionInspector: 'FIELD_TEAM'
    });

    const handleChange = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: 10, color: '#6b7280', marginBottom: 4 }}>DATE *</label>
          <input type="date" value={formData.inspectionDate} onChange={e => handleChange('inspectionDate', e.target.value)} className="int-form-input" />
        </div>
        
        <div>
          <label style={{ display: 'block', fontSize: 10, color: '#6b7280', marginBottom: 4 }}>STATUS</label>
          <select value={formData.inspectionStatus} onChange={e => handleChange('inspectionStatus', e.target.value)} className="int-form-input">
            <option value="COMPLETED">Completed</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="FAILED">Failed</option>
            <option value="SCHEDULED">Scheduled</option>
          </select>
        </div>
        
        <div>
          <label style={{ display: 'block', fontSize: 10, color: '#6b7280', marginBottom: 4 }}>INSPECTOR</label>
          <input value={formData.inspectionInspector} onChange={e => handleChange('inspectionInspector', e.target.value)} className="int-form-input" placeholder="FIELD_TEAM" />
        </div>
        
        <div>
          <label style={{ display: 'block', fontSize: 10, color: '#6b7280', marginBottom: 4 }}>NOTES</label>
          <textarea value={formData.inspectionNotes} onChange={e => handleChange('inspectionNotes', e.target.value)} className="int-form-input" rows={3} placeholder="Inspection notes..." />
        </div>
        
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="int-form-btn secondary" onClick={onCancel}>CANCEL</button>
          <button className="int-form-btn primary" onClick={() => onSubmit({ inspectionFor: { id: interventionId }, ...formData })}>
            ADD INSPECTION
          </button>
        </div>
      </div>
    );
  };

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
    const layerList = Object.entries(WATERSHED_LAYERS).map(([id, meta]) => ({ id, ...meta }));

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
                    <div className="wsi-name">{r.name || r.displayName || 'Unknown'}</div>
                    <div className="wsi-meta">
                      {r.areaKm2 ? `${r.areaKm2} km²` : ''} 
                      {r.areaKm2 && ' · '}
                      {r.source || r.placeType || ''} 
                      {r.source && r.matchType ? ' · ' + r.matchType : ''}
                      {r.confidence ? ` · ${Math.round(r.confidence * 100)}%` : ''}
                    </div>
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
              <span className="ws-ctx-type">{wsCtx.isCustom ? 'CUSTOM REGION' : `WATERSHED${wsCtx.level ? ` · L${wsCtx.level}` : ''}`}</span>
              {wsCtx.areaKm2 && <span className="ws-ctx-meta">{wsCtx.areaKm2.toLocaleString()} km²</span>}
              {wsCtx.source && <span className="ws-ctx-source">{wsCtx.source === 'hydrosheds' ? 'HYDROSHEDS' : wsCtx.source.toUpperCase()}</span>}
              <span className="ws-ctx-status">{wsCtx.dataStatus || 'AVAILABLE'}</span>
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

        {/* Demo Watersheds */}
        <div style={{ position: 'relative' }}>
          <button className="ws-demo-btn" onClick={() => setDemoOpen(!demoOpen)}>
            <Activity size={13} /> DEMO ({DEMO_WATERSHEDS.length})
          </button>
          {demoOpen && (
            <div className="ws-demo-dropdown" style={{ minWidth: 320 }}>
              <div className="ws-dropdown-header">CURATED EXAMPLES</div>
              {DEMO_WATERSHEDS.map(demo => (
                <div key={demo.id} className="ws-demo-item" onClick={() => loadDemoWatershed(demo)} style={{ cursor: demoLoading === demo.id ? 'wait' : 'pointer' }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 600 }}>{demo.name}</span>
                    <div style={{ color: '#6b7280', fontSize: '10px', marginTop: 2 }}>{demo.description}</div>
                    <div style={{ color: '#9ca3af', fontSize: '9px', fontFamily: 'monospace', marginTop: 2 }}>
                      {demo.areaKm2?.toLocaleString()} km² · {demo.river} · {demo.source}
                    </div>
                  </div>
                  {demoLoading === demo.id && <span className="ws-spinner sm" />}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Saved */}
        <div style={{ position: 'relative' }}>
          <button className="ws-saved-btn" onClick={() => setSavedOpen(!savedOpen)}>
            <Download size={13} /> SAVED ({savedWatersheds.length})
          </button>
          {savedOpen && (
            <div className="ws-saved-dropdown">
              <div className="ws-dropdown-header">MY SAVED CONTEXTS</div>
              {savedWatersheds.length === 0 && (
                <div style={{ padding: '8px 12px', color: '#6b7280', fontSize: '11px' }}>
                  NO SAVED WATERSHEDS<br/>
                  <span style={{ fontSize: '10px' }}>Save a watershed to access it here.</span>
                </div>
              )}
              {savedWatersheds.map(ws => (
                <div key={ws.id} className="ws-saved-item" onClick={() => {
                  selectWatershed({ ...ws, centroid: ws.centroid, dataStatus: 'AVAILABLE' });
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

      {/* ── MAP CONTEXT MENU ──────────────────────────────────────── */}
      {clickPopup?.type === 'context-menu' && (
        <div
          className="ws-click-popup"
          style={{ left: clickPopup.x + 16, top: clickPopup.y - 20 }}
        >
          <div className="wcp-title">LOCATION ACTIONS</div>
          <div className="wcp-coords">{clickPopup.lat.toFixed(5)}, {clickPopup.lon.toFixed(5)}</div>
          <button className="wcp-btn" onClick={() => {
            setClickPopup(null);
            document.querySelector('.ws-search-input')?.focus();
          }}>
            <Search size={12} /> SEARCH LOCATION
          </button>
          <button className="wcp-btn" onClick={() => handleResolve(clickPopup.lat, clickPopup.lon)}>
            <Crosshair size={12} /> RESOLVE WATERSHED
          </button>
          <button className="wcp-btn" onClick={() => { setClickPopup(null); startDraw(); }}>
            <Pen size={12} /> DRAW BOUNDARY
          </button>
          <button className="wcp-btn" onClick={() => {
             // Handle "USE THIS LOCATION" placeholder action if needed
             setClickPopup(null);
          }}>
            <MapPin size={12} /> USE THIS LOCATION
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
            {drawPointsState >= 3 && <button className="ws-db-btn primary" onClick={() => {
              if (drawPoints.current.length >= 3) {
                const coords = [...drawPoints.current, drawPoints.current[0]];
                setDrawPolygon({ type: 'Polygon', coordinates: [coords] });
                setBuilderMode('draw_done');
              }
            }}>FINISH</button>}
            <button className="ws-db-btn cancel" onClick={cancelDraw}><X size={12} /> CANCEL</button>
          </div>
        </div>
      )}

      {/* Draw done — Region Analysis */}
      {builderMode === 'draw_done' && drawPolygon && (
        <div className="ws-save-dialog" style={{ width: 340, maxHeight: 480, overflowY: 'auto' }}>
          <div className="wsd-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>REGION ANALYSIS</span>
            <button className="wbc-action-btn cancel" style={{ padding: '2px 8px' }} onClick={cancelDraw}>✕</button>
          </div>

          {drawAnalyzing ? (
            <div className="wsd-geom-stats" style={{ color: '#06b6d4', padding: '16px 0', textAlign: 'center' }}>
              <div style={{ marginBottom: 6 }}>⟳ ANALYZING GEOMETRY…</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Querying HydroSHEDS watershed intersections</div>
            </div>
          ) : drawAnalysis ? (
            <>
              <div className="wsd-geom-stats">
                <span>Area: <strong>{drawAnalysis.area > 1000 ? `${(drawAnalysis.area/1000).toFixed(1)}k` : drawAnalysis.area.toFixed(0)} km²</strong></span>
                <span style={{ marginLeft: 12 }}>Vertices: {drawPoints.current.length}</span>
              </div>

              {drawAnalysis.error ? (
                <div style={{ color: '#ef4444', fontSize: 12, padding: '8px 0' }}>Analysis error: {drawAnalysis.error}</div>
              ) : drawAnalysis.candidates.length === 0 ? (
                <div style={{ padding: '12px 0' }}>
                  <div style={{ color: '#f59e0b', fontSize: 12, marginBottom: 8 }}>NO WATERSHED FOUND in this area.</div>
                  <div style={{ color: '#64748b', fontSize: 11, marginBottom: 12 }}>You can still use this region for Earth Engine analysis.</div>
                  <div className="wsd-actions">
                    <button className="wbc-action-btn secondary" onClick={() => setBuilderMode('draw')}>EDIT</button>
                    <button className="wbc-action-btn primary" onClick={() => {
                      selectWatershed({ id: `custom-drawn-${Date.now()}`, name: saveNameInput || 'Drawn Region', type: 'DRAWN_REGION', geometry: drawPolygon, isCustom: true, dataStatus: 'AVAILABLE' });
                      setBuilderMode(null);
                    }}>USE REGION</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>
                    {drawAnalysis.candidates.length} WATERSHED{drawAnalysis.candidates.length > 1 ? 'S' : ''} FOUND
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12, maxHeight: 300, overflowY: 'auto', paddingRight: 4 }}>
                    {drawAnalysis.candidates.map((c, i) => (
                      <button key={c.id || i}
                        style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.3)', borderRadius: 6, padding: '8px 10px', cursor: 'pointer', textAlign: 'left', color: '#e2e8f0', transition: 'background 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(6,182,212,0.2)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(6,182,212,0.08)'}
                        onClick={() => { loadDemoWatershed({ id: c.id, centroid: c.centroid, areaKm2: c.areaKm2 || 10000 }); setBuilderMode(null); setDrawPolygon(null); setDrawAnalysis(null); }}>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>{c.name || c.id}</div>
                        <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                          Level {c.level} · {c.areaKm2 ? `${(c.areaKm2/1000).toFixed(0)}k km²` : '—'}
                          {c.overlapPercent != null ? ` · ${c.overlapPercent.toFixed(0)}% overlap` : ''}
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="wsd-actions" style={{ borderTop: '1px solid rgba(100,116,139,0.3)', paddingTop: 10 }}>
                    <button className="wbc-action-btn secondary" onClick={() => setBuilderMode('draw')}>EDIT</button>
                    <button className="wbc-action-btn secondary" onClick={() => {
                      selectWatershed({ id: `custom-drawn-${Date.now()}`, name: saveNameInput || 'Drawn Region', type: 'DRAWN_REGION', geometry: drawPolygon, isCustom: true, dataStatus: 'AVAILABLE' });
                      setBuilderMode(null);
                    }}>USE DRAWN AREA</button>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="wsd-geom-stats">No analysis yet.</div>
          )}
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
        {fpStatus === 'LOADING' && <div className="fp-loading"><span className="ws-spinner" /> Loading live Earth observation data...</div>}
        {fpStatus === 'ERROR' && (
          <div className="fp-msg error">
            Earth observation data temporarily unavailable.
          </div>
        )}
        {!wsCtx && fpStatus !== 'LOADING' && (
          <div className="fp-msg">Select a watershed to begin analysis</div>
        )}
        {wsCtx && (wsCtx.dataStatus === 'UNAVAILABLE') && (
          <div className="fp-msg warn">⚠ {wsCtx.unavailableReason || 'Source unavailable'}</div>
        )}
        {fingerprint && (
          <div className="fingerprint-container">
            {[
              { key: 'ndwi', label: 'WATER', color: '#3b82f6', barWidth: ndwiToWidth(fingerprint?.metrics?.ndwi?.value), cursor: 'ndwi' },
              { key: 'ndvi', label: 'VEGETATION', color: '#10b981', barWidth: ndviToWidth(fingerprint?.metrics?.ndvi?.value), cursor: 'ndvi' },

              { key: 'landCover', label: 'LAND COVER', color: '#d97706', barWidth: 0, cursor: 'lulc' },
              { key: 'drainage', label: 'DRAINAGE', color: '#6366f1', barWidth: 0, cursor: 'drainage' },
              { key: 'interventions', label: 'INTERVENTIONS', color: '#8b5cf6', barWidth: 0 },
              { key: 'fieldEvidence', label: 'FIELD EVIDENCE', color: '#38bdf8', barWidth: 0 },
              { key: 'temporalChange', label: 'TEMPORAL CHANGE', color: '#f59e0b', barWidth: 0 },
            ].map(({ key, label, color, barWidth, cursor }) => {
              const row = (fingerprint.metrics && fingerprint.metrics[key]) || {};
              const hasValue = row.status && row.status !== 'ANALYSIS PENDING' && row.status !== 'PENDING ANALYSIS' && row.status !== 'NOT CONNECTED' && row.status !== 'UNAVAILABLE';
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
                    {!hasValue ? (row.status === 'ERROR' ? 'ERROR' : (row.status || 'PENDING')) : (
                      key === 'ndvi' || key === 'ndwi' ? (row.value !== undefined ? row.value.toFixed(2) : row.status) :
                      key === 'landCover' ? (row.top?.name ? row.top.name.toUpperCase() : row.status) :
                      key === 'drainage' ? (row.segments !== undefined ? `${row.segments} SEGMENTS` : row.status) :
                      row.status
                    )}
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
              // Check if globally active
              const isActive = !!localLayerActive[layerId] || (layerId === 'boundary' && !!wsCtx?.geometry);
              const isLoading = layerLoading[layerId];

              // Local state for opacity/status
              const currentLayerState = layerState[layerId] || {};
              const meta = WATERSHED_LAYERS[layerId] || {};
              return (
                <div key={layerId} className={`layer-toggle ${isActive ? 'active' : ''}`}>
                  <div className="lt-row" onClick={() => wsCtx && !isLoading && toggleLayer(layerId)}>
                    <div className="lt-dot" style={{ background: isActive ? meta.color || '#38bdf8' : 'transparent', borderColor: meta.color || '#38bdf8' }} />
                    <span className="layer-label">{layer.displayName || meta.displayName || layerId}</span>
                    {isLoading && <span className="ws-spinner sm" />}
                    {currentLayerState.status === 'UNAVAILABLE' && <span style={{ fontSize: '9px', color: '#ef4444' }}>N/A</span>}
                    {layer.coarseResolution && <span className="layer-tag">~9km</span>}
                  </div>
                  {isActive && meta.hasOpacity && currentLayerState.tileUrl && (
                    <input
                      type="range" min="0" max="1" step="0.05"
                      value={currentLayerState.opacity ?? 0.8}
                      onChange={e => setLayerOpacity(layerId, parseFloat(e.target.value))}
                      className="layer-opacity"
                    />
                  )}
                  {isActive && meta.hasLegend && meta.legendType === 'lulc' && (
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
            onClick={() => setActiveLayers({})}
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
          <StatusBadge status={intStatus === 'AVAILABLE' && interventions.length > 0 ? 'ACTIVE' : intStatus} />
          <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#4b5563', marginLeft: 8 }}>
            {intStatus === 'LOADING' ? 'LOADING…' : intStatus === 'ERROR' ? 'ERROR LOADING' : interventions.length > 0 ? `${interventions.length} INTERVENTION${interventions.length !== 1 ? 'S' : ''}` : 'NONE FOUND'}
          </span>
        </div>
        
        {intStatus === 'LOADING' && <div className="fp-loading"><span className="ws-spinner" /> LOADING INTERVENTIONS…</div>}
        {intStatus === 'ERROR' && <div className="fp-msg error">FAILED TO LOAD INTERVENTIONS</div>}
        {intStatus !== 'LOADING' && interventions.length === 0 && (
          <div className="int-empty">
            <Activity size={14} color="#6b7280" />
            <div style={{ marginTop: 6, fontWeight: 600, color: '#f87171' }}>
              NO INTERVENTIONS FOUND
            </div>
            <div style={{ marginTop: 4, color: '#4b5563' }}>
              Add interventions for this watershed using the button below.
            </div>
          </div>
        )}
        {intStatus !== 'LOADING' && interventions.length > 0 && (
          <div className="int-content" style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '400px', overflowY: 'auto' }}>
            {interventions.map((intv, idx) => {
              const statusInfo = getInterventionStatusInfo(intv.status);
              const typeInfo = getInterventionTypeInfo(intv.type);
              const IconComponent = { Hammer, Wrench, FilePlus }[typeInfo.iconName] || Hammer;
              return (
                <div key={intv.id} className="int-item" style={{ 
                  background: 'rgba(255,255,255,0.03)', 
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8, 
                  padding: 12 
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ 
                      width: 36, height: 36, borderRadius: 8, 
                      background: statusInfo.bg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <IconComponent size={16} color={statusInfo.color} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: '#fff', marginBottom: 2 }}>{intv.name}</div>
                          <div style={{ fontSize: 10, color: '#6b7280' }}>{intv.type}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ 
                            fontSize: 9, fontFamily: 'monospace', fontWeight: 600,
                            padding: '2px 6px', borderRadius: 3,
                            background: statusInfo.bg, color: statusInfo.color,
                            border: `1px solid ${statusInfo.color}40`
                          }}>
                            {statusInfo.label}
                          </span>
                        </div>
                      </div>
                      {intv.notes && (
                        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4, lineHeight: 1.4 }}>
                          {intv.notes}
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, fontSize: 9, color: '#6b7280' }}>
                        {intv.constructionDate && (
                          <span><Calendar size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Built: {new Date(intv.constructionDate).toLocaleDateString()}</span>
                        )}
                        {intv.inspections?.length > 0 && (
                          <span><Camera size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Last inspection: {new Date(intv.inspections[intv.inspections.length - 1].date).toLocaleDateString()}</span>
                        )}
                        {intv.linkedMissionId && (
                          <span><Navigation size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Mission: {intv.linkedMissionId.slice(0, 12)}…</span>
                        )}
                        {intv.linkedObservationId && (
                          <span><MapPinIcon size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Obs: {intv.linkedObservationId.slice(0, 12)}…</span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <button className="int-btn small" onClick={() => setIntEditing(intv)}>
                        <Wrench size={11} /> EDIT
                      </button>
                      <button className="int-btn small" style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)', color: '#f87171' }} onClick={() => {
                        if (confirm(`Delete intervention "${intv.name}"?`)) {
                          deleteIntervention(intv.id).then(() => setInterventions(prev => prev.filter(i => i.id !== intv.id)));
                        }
                      }}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        
        {/* Add/Edit Intervention Form */}
        {intEditing && (
          <div className="int-form-overlay" style={{ marginTop: 12, padding: 12, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 12 }}>{intEditing.id ? 'EDIT INTERVENTION' : 'ADD INTERVENTION'}</div>
              <button onClick={() => setIntEditing(null)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 9, color: '#6b7280', marginBottom: 4 }}>NAME</label>
                <input
                  className="wbc-input"
                  value={intFormData.name || ''}
                  onChange={e => setIntFormData({ ...intFormData, name: e.target.value })}
                  placeholder="Intervention name"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 9, color: '#6b7280', marginBottom: 4 }}>TYPE</label>
                <select
                  className="wbc-input"
                  value={intFormData.type || ''}
                  onChange={e => setIntFormData({ ...intFormData, type: e.target.value })}
                >
                  <option value="">Select type</option>
                  {INTERVENTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: 9, color: '#6b7280', marginBottom: 4 }}>STATUS</label>
                <select
                  className="wbc-input"
                  value={intFormData.status || 'PLANNED'}
                  onChange={e => setIntFormData({ ...intFormData, status: e.target.value })}
                >
                  {INTERVENTION_STATUSES.map(s => <option key={s} value={s}>{getInterventionStatusInfo(s).label}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: 9, color: '#6b7280', marginBottom: 4 }}>COORDINATES (lat, lng)</label>
                <input
                  className="wbc-input"
                  value={intFormData.coordinates ? `${intFormData.coordinates.lat}, ${intFormData.coordinates.lng}` : ''}
                  onChange={e => {
                    const [lat, lng] = e.target.value.split(',').map(v => parseFloat(v.trim()));
                    if (!isNaN(lat) && !isNaN(lng)) {
                      setIntFormData({ ...intFormData, coordinates: { lat, lng } });
                    }
                  }}
                  placeholder="21.83, 73.75"
                />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: 9, color: '#6b7280', marginBottom: 4 }}>NOTES</label>
                <textarea
                  className="wbc-textarea"
                  style={{ minHeight: 60 }}
                  value={intFormData.notes || ''}
                  onChange={e => setIntFormData({ ...intFormData, notes: e.target.value })}
                  placeholder="Notes, specifications, etc."
                />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: 9, color: '#6b7280', marginBottom: 4 }}>CONSTRUCTION DATE (optional)</label>
                <input
                  className="wbc-input"
                  type="date"
                  value={intFormData.constructionDate ? intFormData.constructionDate.split('T')[0] : ''}
                  onChange={e => setIntFormData({ ...intFormData, constructionDate: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button className="wbc-action-btn secondary" onClick={() => { setIntEditing(null); setIntFormData({}); }}>CANCEL</button>
              <button 
                className="wbc-action-btn primary" 
                onClick={async () => {
                  if (!intFormData.name || !intFormData.type || !intFormData.coordinates) {
                    alert('Name, type, and coordinates are required');
                    return;
                  }
                  if (!wsCtx) return;
                  
                  const data = {
                    watershedId: wsCtx.id,
                    name: intFormData.name,
                    type: intFormData.type,
                    status: intFormData.status || 'PLANNED',
                    coordinates: intFormData.coordinates,
                    notes: intFormData.notes || '',
                    constructionDate: intFormData.constructionDate || null,
                    linkedMissionId: intFormData.linkedMissionId || null,
                    linkedObservationId: intFormData.linkedObservationId || null
                  };
                  
                  setIntCreating(true);
                  try {
                    if (intEditing.id) {
                      await updateIntervention(intEditing.id, data);
                    } else {
                      const newInt = await createIntervention(data);
                      setInterventions(prev => [...prev, newInt]);
                    }
                    setIntEditing(null);
                    setIntFormData({});
                  } catch (err) {
                    alert('Failed to save intervention: ' + err.message);
                  } finally {
                    setIntCreating(false);
                  }
                }}
                disabled={intCreating}
              >
                {intCreating ? 'SAVING…' : (intEditing.id ? 'UPDATE' : 'CREATE')}
              </button>
            </div>
          </div>
        )}
        
        <div className="int-actions">
          <button className="int-btn" onClick={() => navigate('/field')}>
            <MapPinIcon size={12} /> FIELD OBSERVATION
          </button>
          <button className="int-btn" onClick={() => navigate('/mission')}>
            <Navigation size={12} /> PLAN MISSION
          </button>
          <button className="int-btn" onClick={() => navigate('/compare')}>
            <ExternalLink size={12} /> COMPARE SATELLITE
          </button>
          <button className="int-btn primary" onClick={() => { setIntEditing({}); setIntFormData({ coordinates: wsCtx?.centroid || { lat: 21.83, lng: 73.75 } }); }}>
            <Plus size={12} /> ADD INTERVENTION
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

      {/* Development Diagnostic */}
      {import.meta.env.DEV && (
        <div className="dev-diagnostic" style={{
          position: 'absolute', bottom: 10, left: 88, background: 'rgba(0,0,0,0.8)',
          padding: 10, border: '1px solid #3b82f6', color: '#38bdf8', fontFamily: 'monospace',
          zIndex: 9999, fontSize: 10, pointerEvents: 'none', borderRadius: 6
        }}>
          <div>EE: {fpStatus === 'ERROR' ? 'ERROR' : (wsCtx ? 'CONNECTED' : 'WAITING')}</div>
          <div>Watershed: {wsCtx?.id || 'NONE'}</div>
          <div>Fingerprint: {fpStatus}</div>
          <div>NDVI: {fingerprint?.vegetation?.value ?? 'N/A'}</div>
          <div>NDWI: {fingerprint?.water?.value ?? 'N/A'}</div>
          <div>Timeline: {tlStatus}</div>
          <div>Layers: {availableLayers.length > 0 ? 'SUCCESS' : 'PENDING'}</div>
        </div>
      )}
    </div>
  );
}
