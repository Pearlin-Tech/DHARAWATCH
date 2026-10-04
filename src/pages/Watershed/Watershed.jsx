import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import maplibregl from '../../lib/maplibre';
import FloatingPanel from '../../components/FloatingPanel';
import AppNavigation from '../../components/AppNavigation';
import { useAppContext } from '../../components/UniversalContextBar';
import {
  Search, Layers, Target, ArrowRight, Plus, Download, Trash2, MapPin, Pen, Crosshair, X, RefreshCw,
  Upload, ZoomIn, ZoomOut, Maximize, Save, Eye, MessageSquare, Star, ArrowLeft, ClipboardCheck
} from 'lucide-react';
import {
  searchGeo, resolvePoint, intersectGeometry, getContextById, listDemos, listSaved, saveContext, deleteSaved, importGeoJSON,
  getFingerprint, getTimeline, getTimelineIndices, getAttention, getIntel, getMedia, getBrief, listFieldObservations, isPersistedId
} from '../../services/watershedClient';
import {
  listInterventions, createIntervention, updateIntervention, addInspection, deleteIntervention
} from '../../services/interventionClient';
import { geometryMetrics, validateGeometry, formatArea } from '../../shared/geo.js';
import { toContext, contextSummary } from './contextModel';
import { useContextResource } from './useContextResource';
import { useMapLayers } from './useMapLayers';
import {
  Pill, FingerprintBody, fingerprintSummary, LayersBody, TimelineBody, AttentionBody, attentionStatus, InterventionsBody, CandidateList
} from './WatershedPanels';
import DetailBody from './DetailPanel';
import PanelBoundary from './PanelBoundary';
import './Watershed.css';

// ─── panel layout (one panel system; positions are viewport edges) ──
const VH = window.innerHeight;
const VW = window.innerWidth;
const PANELS = {
  fingerprint: { label: 'FIN', title: 'WATERSHED FINGERPRINT', position: { left: 88, top: 76 }, width: 300, maxHeight: 'calc(52vh - 84px)', open: true },
  layers: { label: 'LAY', title: 'GEOSPATIAL LAYERS', position: { left: 88, top: Math.round(VH * 0.52) }, width: 300, maxHeight: 'calc(48vh - 76px)', open: true },
  detail: { label: 'DET', title: 'WATERSHED INTELLIGENCE', position: { right: 16, top: 76 }, width: 380, maxHeight: 'calc(60vh - 84px)', expandedWidth: 1000, open: true },
  attention: { label: 'ATT', title: 'AREAS NEEDING ATTENTION', position: { right: 16, top: Math.round(VH * 0.6) }, width: 380, maxHeight: 'calc(40vh - 76px)', open: true },
  interventions: { label: 'INT', title: 'INTERVENTION PASSPORT', position: { right: 410, top: 76 }, width: 340, maxHeight: '70vh', open: false },
  timeline: { label: 'TIM', title: 'TEMPORAL RIBBON', position: { left: 404, top: VH - 300 }, width: Math.max(360, Math.min(640, VW - 830)), maxHeight: '236px', open: true }
};
const PANEL_IDS = Object.keys(PANELS);

const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Pick the most meaningful candidate for a search result (never a different place — only a different level). */
function pickCandidate(result, resp) {
  const cands = resp.candidates || [];
  const hydro = ['RIVER', 'WATERSHED_FEATURE', 'WATER_BODY', 'DAM'].includes(result?.type) || /\b(river|basin|watershed|catchment)\b/i.test(result?.name || '');
  if (hydro) {
    const nm = (result.name || '').toLowerCase();
    const matching = cands.filter((c) => c.riverSystem && nm.includes(c.riverSystem.toLowerCase()));
    const whole = matching.find((c) => c.naming?.scope === 'WHOLE_BASIN');
    if (whole) return whole;
    if (matching.length) return matching[0];
  }
  return cands.find((c) => c.id === resp.recommendedId) || cands[cands.length - 1];
}

export default function Watershed() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setCurrentWatershed } = useAppContext();

  const mapContainer = useRef(null);
  const map = useRef(null);
  const [mapReady, setMapReady] = useState(false);

  // ─── THE active context (single source of truth) ───────────────
  const [ctx, setCtx] = useState(null);
  const ctxRef = useRef(null);
  ctxRef.current = ctx;
  const [busy, setBusy] = useState(null);
  const [banner, setBanner] = useState(null);
  const activationSeq = useRef(0);

  // ─── panels ─────────────────────────────────────────────────────
  // phones: panels dock as a bottom sheet (responsive.css), so start closed and keep one open at a time
  const isPhone = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
  const [panels, setPanels] = useState(() => Object.fromEntries(PANEL_IDS.map((id, i) => [id, { open: isPhone ? false : PANELS[id].open, z: 30 + i }])));
  const zTop = useRef(40);
  const bringToFront = useCallback((id) => setPanels((p) => (!p[id] || p[id].z === zTop.current ? p : { ...p, [id]: { ...p[id], z: ++zTop.current } })), []);
  const togglePanel = useCallback((id, force) => setPanels((p) => {
    const open = force ?? !p[id].open;
    const next = isPhone && open ? Object.fromEntries(Object.entries(p).map(([k, v]) => [k, { ...v, open: false }])) : { ...p };
    return { ...next, [id]: { ...p[id], open, z: ++zTop.current } };
  }), [isPhone]);
  const [detailMode, setDetailMode] = useState('normal');

  // ─── records ────────────────────────────────────────────────────
  const [demos, setDemos] = useState({ status: 'LOADING', items: [] });
  const [saved, setSaved] = useState({ status: 'LOADING', items: [] });
  const [menu, setMenu] = useState(null);
  const [saveName, setSaveName] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);

  // ─── search ─────────────────────────────────────────────────────
  const [q, setQ] = useState('');
  const [search, setSearch] = useState({ status: 'IDLE', results: [] });
  const [searchOpen, setSearchOpen] = useState(false);
  const blurTimer = useRef(null);

  // ─── candidates (draw analysis or point hierarchy) ──────────────
  const [cands, setCands] = useState(null);

  // ─── map init ───────────────────────────────────────────────────
  useEffect(() => {
    if (map.current || !mapContainer.current) return undefined;
    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: { satellite: { type: 'raster', tiles: ['https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'], tileSize: 256, attribution: '© Google' } },
        layers: [{ id: 'satellite-base', type: 'raster', source: 'satellite' }]
      },
      center: [20, 15], zoom: 1.8, attributionControl: { compact: true }, doubleClickZoom: false
    });
    map.current = m;
    const empty = { type: 'FeatureCollection', features: [] };
    m.on('load', () => {
      m.addSource('ws-boundary', { type: 'geojson', data: empty });
      m.addLayer({ id: 'ws-boundary-fill', type: 'fill', source: 'ws-boundary', paint: { 'fill-color': '#38bdf8', 'fill-opacity': 0.08 } });
      m.addLayer({ id: 'ws-boundary-line', type: 'line', source: 'ws-boundary', paint: { 'line-color': '#38bdf8', 'line-width': 2.2 } });
      m.addSource('ws-candidate', { type: 'geojson', data: empty });
      m.addLayer({ id: 'ws-candidate-fill', type: 'fill', source: 'ws-candidate', paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.12 } });
      m.addLayer({ id: 'ws-candidate-line', type: 'line', source: 'ws-candidate', paint: { 'line-color': '#f59e0b', 'line-width': 2, 'line-dasharray': [2, 1.5] } });
      m.addSource('ws-draw', { type: 'geojson', data: empty });
      m.addLayer({ id: 'ws-draw-fill', type: 'fill', source: 'ws-draw', filter: ['==', ['get', 'k'], 'fill'], paint: { 'fill-color': '#06b6d4', 'fill-opacity': 0.15 } });
      m.addLayer({ id: 'ws-draw-line', type: 'line', source: 'ws-draw', filter: ['==', ['get', 'k'], 'edge'], paint: { 'line-color': '#06b6d4', 'line-width': 2 } });
      m.addLayer({ id: 'ws-draw-pts', type: 'circle', source: 'ws-draw', filter: ['==', ['get', 'k'], 'vertex'], paint: { 'circle-color': '#06b6d4', 'circle-radius': 4, 'circle-stroke-width': 1.5, 'circle-stroke-color': '#fff' } });
      setMapReady(true);
    });
    if (import.meta.env.DEV) window.__dw = { map: m, get ctx() { return ctxRef.current; } };
    return () => { m.remove(); map.current = null; };
  }, []);

  const { layers, toggle: toggleLayer, enable: enableLayer, setOpacity, resetAll: resetLayers } = useMapLayers(map, mapReady, ctx);

  // ─── boundary + camera follow the active context ───────────────
  useEffect(() => {
    const m = map.current;
    if (!mapReady || !m) return;
    m.getSource('ws-boundary').setData(ctx ? { type: 'Feature', properties: {}, geometry: ctx.geometry } : { type: 'FeatureCollection', features: [] });
    // ?focus=lat,lng (e.g. from Evidence Review) centres on that point instead of fitting the whole basin
    const q = new URLSearchParams(window.location.search);
    const focus = ctx && q.get('id') === ctx.id ? (q.get('focus') || '').split(',').map(Number) : [];
    focusMarker.current?.remove();
    focusMarker.current = null;
    if (focus.length === 2 && focus.every(Number.isFinite)) {
      const el = document.createElement('div');
      el.className = 'ws-focus-marker';
      el.title = 'Intervention location';
      focusMarker.current = new maplibregl.Marker({ element: el }).setLngLat([focus[1], focus[0]]).addTo(m);
      m.flyTo({ center: [focus[1], focus[0]], zoom: 15, duration: 1400 });
    } else if (ctx?.bbox) {
      const pad = { top: 80, bottom: 260, left: Math.min(420, VW * 0.28), right: Math.min(420, VW * 0.28) };
      m.fitBounds([[ctx.bbox[0], ctx.bbox[1]], [ctx.bbox[2], ctx.bbox[3]]], { padding: pad, duration: 1400, maxZoom: 12 });
    }
    if (ctx && q.get('id') === ctx.id && (q.get('intervention') || q.get('panel') === 'interventions')) togglePanel('interventions', true);
  }, [ctx, mapReady, togglePanel]);
  const focusMarker = useRef(null);

  // ─── activateContext: the ONE way a context becomes active ─────
  const activateContext = useCallback((raw, { history = 'push' } = {}) => {
    let next;
    try {
      next = toContext(raw);
    } catch (e) {
      setBanner({ tone: 'error', text: e.message });
      return null;
    }
    next.key = next.id;
    next.technicalName = raw.technicalName ?? null;
    next.naming = raw.naming ?? null;
    next.river = raw.river ?? null;
    next.riverSystem = raw.riverSystem ?? null;
    next.sourceId = raw.sourceId ?? null;
    activationSeq.current += 1;
    setCtx(next);
    setBanner(null);
    map.current?.getSource('ws-candidate')?.setData({ type: 'FeatureCollection', features: [] });
    const url = new URL(window.location.href);
    if (isPersistedId(next.id)) url.searchParams.set('id', next.id); else url.searchParams.delete('id');
    if (url.toString() !== window.location.href) window.history[history === 'push' ? 'pushState' : 'replaceState'](window.history.state, '', url);
    setCurrentWatershed({ ...contextSummary(next), centroid: next.centroid, geometry: next.geometry });
    return next;
  }, [setCurrentWatershed]);

  /** Load a stored / HydroBASINS context by id, then activate it. Sequenced: a late answer never wins. */
  const openById = useCallback(async (id, opts) => {
    const seq = ++activationSeq.current;
    setBusy('Loading watershed…');
    try {
      const w = await getContextById(id);
      if (seq !== activationSeq.current) return;
      setBusy(null);
      activateContext(w, opts);
    } catch (e) {
      if (seq === activationSeq.current) setBanner({ tone: 'error', text: `Could not load "${id}": ${e.message}` });
    } finally {
      if (seq === activationSeq.current) setBusy(null);
    }
  }, [activateContext]);

  // ─── records + URL ──────────────────────────────────────────────
  const reloadSaved = useCallback(() => listSaved().then((items) => setSaved({ status: 'DONE', items })).catch((e) => setSaved({ status: 'ERROR', items: [], error: e.message })), []);
  const reloadDemos = useCallback(() => {
    setDemos((d) => ({ ...d, status: 'LOADING' }));
    return listDemos().then((items) => setDemos({ status: 'DONE', items })).catch((e) => setDemos({ status: 'ERROR', items: [], error: e.message }));
  }, []);
  useEffect(() => { reloadDemos(); reloadSaved(); }, [reloadDemos, reloadSaved]);

  useEffect(() => {
    const id = new URLSearchParams(location.search).get('id');
    if (!id || id === ctxRef.current?.id) return;
    if (isPersistedId(id)) { openById(id, { history: 'replace' }); return; }
    // legacy demo slugs (?id=ws-mahanadi, ?id=demo-sardar-sarovar) → the curated demo record with that name
    if (demos.status === 'LOADING') return;
    const want = slug(id.replace(/^(ws|demo)-/, ''));
    const hit = want && demos.items.find((d) => [d.metadata?.seedName, d.metadata?.river, d.name].some((t) => slug(t) && (slug(t).includes(want) || want.includes(slug(t)))));
    if (hit) openById(hit.id, { history: 'replace' });
    else setBanner({ tone: 'error', text: `No watershed with id "${id}". Search for a place or choose a demo.` });
  }, [location.search, demos, openById]);

  // ─── data for the active context (abortable, stale-proof, on demand) ──
  const [wanted, setWanted] = useState({ key: null });
  useEffect(() => {
    if (!ctx) return;
    setWanted((w) => {
      const n = { ...(w.key === ctx.key ? w : { key: ctx.key }) };
      if (panels.timeline.open) n.tli = true;
      if (panels.attention.open || panels.detail.open) n.att = true;
      if (panels.detail.open) { n.intel = true; n.media = true; n.field = true; }
      if (panels.interventions.open || panels.detail.open) n.ints = true;
      return JSON.stringify(n) === JSON.stringify(w) ? w : n;
    });
  }, [ctx, panels]);
  const want = (k) => wanted.key === ctx?.key && !!wanted[k];

  const fp = useContextResource(ctx, getFingerprint, { refreshToken });
  const tl = useContextResource(ctx, getTimeline, { refreshToken });
  const tli = useContextResource(ctx, getTimelineIndices, { enabled: want('tli'), refreshToken });
  const att = useContextResource(ctx, getAttention, { enabled: want('att'), refreshToken });
  const intel = useContextResource(ctx, getIntel, { enabled: want('intel'), refreshToken });
  const media = useContextResource(ctx, getMedia, { enabled: want('media'), refreshToken });
  const field = useContextResource(ctx, (c, o) => listFieldObservations(o), { enabled: want('field'), refreshToken });
  const [intNonce, setIntNonce] = useState(0);
  const ints = useContextResource(ctx, (c, o) => listInterventions({ watershedId: c.id, signal: o.signal }), { enabled: want('ints'), refreshToken: refreshToken + intNonce });
  const [briefToken, setBriefToken] = useState(0);
  const brief = useContextResource(ctx, getBrief, { enabled: !!ctx && wanted.brief === ctx.key, refreshToken: briefToken });
  const runBrief = () => { setWanted((w) => ({ ...w, brief: ctxRef.current.key })); setBriefToken((t) => t + 1); };

  const interventionApi = useMemo(() => ({
    create: async (d) => { await createIntervention({ ...d, watershedId: ctxRef.current.id }); setIntNonce((n) => n + 1); },
    update: async (id, d) => { await updateIntervention(id, d); setIntNonce((n) => n + 1); },
    inspect: async (id, d) => { await addInspection(id, d); setIntNonce((n) => n + 1); },
    remove: async (id) => { await deleteIntervention(id); setIntNonce((n) => n + 1); }
  }), []);

  // ─── search ─────────────────────────────────────────────────────
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setSearch({ status: 'IDLE', results: [] }); return undefined; }
    const ac = new AbortController();
    const t = setTimeout(() => {
      setSearch({ status: 'LOADING', results: [] });
      searchGeo(term, { signal: ac.signal })
        .then((r) => setSearch({ status: r.results.length ? 'DONE' : 'EMPTY', results: r.results, error: r.error?.message || r.error }))
        .catch((e) => { if (!ac.signal.aborted) setSearch({ status: e.code === 'TIMEOUT' ? 'TIMEOUT' : 'ERROR', results: [], error: e.message }); });
    }, 450);
    return () => { clearTimeout(t); ac.abort(); };
  }, [q]);

  /** Point → HydroBASINS hierarchy → candidate list + best candidate activated. Coordinates are preserved. */
  const resolveAt = useCallback(async (lat, lon, result = null) => {
    const seq = ++activationSeq.current;
    setMenu(null);
    setBusy(`Resolving watershed at ${lat.toFixed(3)}, ${lon.toFixed(3)}…`);
    map.current?.flyTo({ center: [lon, lat], zoom: Math.max(map.current.getZoom(), 5), duration: 1200 });
    setCands({ kind: 'point', status: 'LOADING', list: [], title: result ? `at “${result.name}” (${lat.toFixed(3)}, ${lon.toFixed(3)})` : `at ${lat.toFixed(4)}, ${lon.toFixed(4)}` });
    try {
      // a searched river whose reference point is its estuary is anchored to the same-named HydroSHEDS reach (server-side)
      const isRiver = ['RIVER', 'WATERSHED_FEATURE'].includes(result?.type);
      const resp = await resolvePoint(lat, lon, { river: isRiver ? result.name : undefined });
      if (seq !== activationSeq.current) return;
      const best = pickCandidate(result, resp);
      setCands((c) => ({ ...c, status: 'DONE', list: resp.candidates, nearPlace: resp.location?.displayName, anchor: resp.location?.anchor }));
      setBusy(null);
      if (best) activateContext(best);
    } catch (e) {
      if (seq !== activationSeq.current) return;
      setCands((c) => ({ ...c, status: e.code === 'TIMEOUT' ? 'TIMEOUT' : 'ERROR', error: e.code === 'NO_WATERSHED_FOUND' ? `No HydroSHEDS watershed at ${lat.toFixed(4)}, ${lon.toFixed(4)} (ocean or unmapped area).` : `${e.code}: ${e.message}` }));
    } finally {
      if (seq === activationSeq.current) setBusy(null);
    }
  }, [activateContext]);

  const chooseResult = (r) => {
    setSearchOpen(false);
    setQ(r.name || '');
    if ((r.source === 'saved' || r.source === 'demo') && r.contextId) { setCands(null); openById(r.contextId); return; }
    if (Number.isFinite(r.lat) && Number.isFinite(r.lon)) { resolveAt(r.lat, r.lon, r); return; }
    setBanner({ tone: 'error', text: `"${r.name}" has no coordinates — cannot resolve a watershed.` });
  };

  // ─── map interactions: double-click menu, click boundary → detail ──
  const [ctxMenu, setCtxMenu] = useState(null);
  const drawingRef = useRef(false);
  useEffect(() => {
    const m = map.current;
    if (!mapReady || !m) return undefined;
    const onDbl = (e) => { if (drawingRef.current) return; setCtxMenu({ lat: e.lngLat.lat, lon: e.lngLat.lng, x: e.point.x, y: e.point.y }); };
    const onBoundary = () => { if (!drawingRef.current && ctxRef.current) togglePanel('detail', true); };
    const close = () => setCtxMenu(null);
    m.on('dblclick', onDbl);
    m.on('click', 'ws-boundary-fill', onBoundary);
    m.on('movestart', close);
    return () => { m.off('dblclick', onDbl); m.off('click', 'ws-boundary-fill', onBoundary); m.off('movestart', close); };
  }, [mapReady, togglePanel]);

  // ─── drawing ────────────────────────────────────────────────────
  const [drawing, setDrawing] = useState(false);
  const [drawPts, setDrawPts] = useState([]);
  const cursor = useRef(null);
  drawingRef.current = drawing;
  const paintDraw = useCallback((pts, closed = false) => {
    const src = map.current?.getSource('ws-draw');
    if (!src) return;
    const f = pts.map((p) => ({ type: 'Feature', properties: { k: 'vertex' }, geometry: { type: 'Point', coordinates: p } }));
    const line = closed ? [...pts, pts[0]] : cursor.current ? [...pts, cursor.current] : pts;
    if (line.length > 1) f.push({ type: 'Feature', properties: { k: 'edge' }, geometry: { type: 'LineString', coordinates: line } });
    if (pts.length >= 3) f.push({ type: 'Feature', properties: { k: 'fill' }, geometry: { type: 'Polygon', coordinates: [[...pts, ...(closed || !cursor.current ? [] : [cursor.current]), pts[0]]] } });
    src.setData({ type: 'FeatureCollection', features: f });
  }, []);
  const clearDraw = useCallback(() => { setDrawPts([]); cursor.current = null; map.current?.getSource('ws-draw')?.setData({ type: 'FeatureCollection', features: [] }); }, []);
  const startDraw = () => { setMenu(null); setCtxMenu(null); setCands(null); clearDraw(); setDrawing(true); };
  const cancelDraw = useCallback(() => { setDrawing(false); clearDraw(); }, [clearDraw]);

  const finishDraw = useCallback(async (pts) => {
    if (pts.length < 3) return;
    setDrawing(false);
    cursor.current = null;
    paintDraw(pts, true);
    const geometry = { type: 'Polygon', coordinates: [[...pts, pts[0]]] };
    const v = validateGeometry(geometry);
    if (!v.ok) { setCands({ kind: 'draw', status: 'ERROR', list: [], error: `Invalid polygon: ${v.message}` }); return; }
    const metrics = geometryMetrics(v.geometry);
    const seq = ++activationSeq.current;
    setCands({ kind: 'draw', status: 'LOADING', list: [], drawn: { geometry: v.geometry, vertices: pts.length, ...metrics } });
    try {
      const r = await intersectGeometry(v.geometry);
      if (seq !== activationSeq.current) return;
      setCands((c) => ({ ...c, status: 'DONE', list: r.candidates, recommendedId: r.recommendedId, countries: r.drawn?.countries, nearPlace: r.drawn?.displayName, truncatedLevels: r.truncatedLevels, perLevelLimit: r.perLevelLimit }));
    } catch (e) {
      if (seq === activationSeq.current) setCands((c) => ({ ...c, status: e.code === 'TIMEOUT' ? 'TIMEOUT' : 'ERROR', error: `${e.code}: ${e.message}` }));
    }
  }, [paintDraw]);

  useEffect(() => {
    const m = map.current;
    if (!m || !drawing) return undefined;
    m.getCanvas().style.cursor = 'crosshair';
    let pts = [];
    const click = (e) => { pts = [...pts, [e.lngLat.lng, e.lngLat.lat]]; setDrawPts(pts); paintDraw(pts); };
    const move = (e) => { cursor.current = [e.lngLat.lng, e.lngLat.lat]; paintDraw(pts); };
    const dbl = (e) => { e.preventDefault(); if (pts.length >= 3) finishDraw(pts); };
    const key = (e) => { if (e.key === 'Escape') cancelDraw(); if (e.key === 'Enter' && pts.length >= 3) finishDraw(pts); };
    const sync = (e) => { pts = e.detail; };
    m.on('click', click); m.on('mousemove', move); m.on('dblclick', dbl); window.addEventListener('keydown', key); window.addEventListener('ws-draw-undo', sync);
    return () => { m.getCanvas().style.cursor = ''; m.off('click', click); m.off('mousemove', move); m.off('dblclick', dbl); window.removeEventListener('keydown', key); window.removeEventListener('ws-draw-undo', sync); };
  }, [drawing, paintDraw, finishDraw, cancelDraw]);
  const undoPoint = () => {
    const n = drawPts.slice(0, -1);
    setDrawPts(n);
    window.dispatchEvent(new CustomEvent('ws-draw-undo', { detail: n }));
    paintDraw(n);
  };

  const previewCandidate = (c) => {
    map.current?.getSource('ws-candidate')?.setData(c ? { type: 'Feature', properties: {}, geometry: c.geometry } : { type: 'FeatureCollection', features: [] });
  };
  const viewCandidate = (c) => {
    previewCandidate(c);
    if (c.bbox) map.current?.fitBounds([[c.bbox[0], c.bbox[1]], [c.bbox[2], c.bbox[3]]], { padding: 120, duration: 1000 });
  };
  const selectCandidate = (c) => { activateContext(c); if (cands?.kind === 'draw') clearDraw(); };
  const useDrawnArea = () => {
    const d = cands.drawn;
    activateContext({ id: `draft-${Date.now().toString(36)}`, name: saveName.trim() || 'Drawn analysis area', geometry: d.geometry, isCustom: true, source: 'user', metadata: { drawnVertices: d.vertices } });
    setSaveName('');
    clearDraw();
  };

  // ─── save / import ──────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const saveCurrent = async () => {
    if (!ctx) return;
    setSaving(true);
    try {
      const rec = await saveContext(ctx, saveName.trim() || ctx.name);
      await reloadSaved();
      setSaveName('');
      activateContext(rec, { history: 'replace' });
      setBanner({ tone: 'ok', text: `Saved "${rec.name}" as ${rec.id}.` });
    } catch (e) { setBanner({ tone: 'error', text: `Save failed: ${e.message}` }); }
    finally { setSaving(false); }
  };
  const [importText, setImportText] = useState('');
  const doImport = async () => {
    try {
      const rec = await importGeoJSON(saveName.trim() || 'Imported area', JSON.parse(importText));
      await reloadSaved();
      setImportText(''); setMenu(null); setSaveName('');
      activateContext(rec);
    } catch (e) { setBanner({ tone: 'error', text: `Import failed: ${e.message}` }); }
  };

  // ─── derived header state ───────────────────────────────────────
  const fpSum = fingerprintSummary(fp);
  const liveDot = !ctx ? null : fp.status === 'LOADING' ? 'LOADING' : fpSum.status === 'AVAILABLE' ? 'LIVE' : fpSum.status;

  const navState = ctx ? {
    watershedId: ctx.id, watershedName: ctx.name, watershed: { ...contextSummary(ctx), centroid: ctx.centroid, geometry: ctx.geometry },
    coordinates: ctx.centroid ? { lat: ctx.centroid.lat, lon: ctx.centroid.lon } : undefined
  } : undefined;

  const panelBodies = {
    fingerprint: <FingerprintBody ctx={ctx} res={fp} onShowLayer={(id) => { enableLayer(id); togglePanel('layers', true); }} onOpenDetail={() => togglePanel('detail', true)} />,
    layers: <LayersBody ctx={ctx} layers={layers} onToggle={toggleLayer} onOpacity={setOpacity} onReset={resetLayers} />,
    detail: <DetailBody ctx={ctx} intel={intel} media={media} fp={fp} tl={tl} tli={tli} att={att} ints={ints} field={field} brief={brief} onBrief={runBrief} onSelectId={(id) => openById(id)} />,
    attention: <AttentionBody ctx={ctx} res={att} onCompare={() => navigate('/compare', { state: navState })} />,
    interventions: <InterventionsBody ctx={ctx} res={ints} api={interventionApi} focusId={new URLSearchParams(location.search).get('intervention')}
      onReview={(iv) => navigate(`/evidence-review?watershed=${encodeURIComponent(ctx.id)}&intervention=${encodeURIComponent(iv.id)}`, { state: { returnTo: `/watershed?id=${encodeURIComponent(ctx.id)}`, returnLabel: 'Watershed' } })}
      onFly={(iv) => iv.coordinates && map.current?.flyTo({ center: [iv.coordinates.lng, iv.coordinates.lat], zoom: 14 })} onField={() => navigate('/field', { state: navState })} />,
    timeline: <TimelineBody ctx={ctx} res={tl} idx={tli} />
  };
  const activeLayerCount = Object.values(layers).filter((l) => l.status === 'ACTIVE').length;
  const panelStatus = {
    fingerprint: ctx && <Pill status={fpSum.status} label={fpSum.label} />,
    layers: ctx && <Pill status={Object.values(layers).some((l) => l.status === 'LOADING') ? 'LOADING' : activeLayerCount ? 'ACTIVE' : 'OFF'} label={`${activeLayerCount} ACTIVE`} />,
    detail: ctx && <Pill status={intel.status === 'DONE' ? 'AVAILABLE' : intel.status} label={intel.status === 'DONE' ? 'LIVE' : undefined} />,
    attention: ctx && <Pill status={attentionStatus(att)} label={att.status === 'DONE' && att.data.items.length ? `${att.data.items.length} ITEMS` : undefined} />,
    interventions: ctx && <Pill status={ints.status === 'DONE' ? (ints.data.length ? 'AVAILABLE' : 'NO_DATA') : ints.status} label={ints.status === 'DONE' ? `${ints.data.length} FOUND` : undefined} />,
    timeline: ctx && <Pill status={tl.status === 'DONE' ? tl.data.status : tl.status} label={tl.status === 'DONE' && tl.data.status === 'AVAILABLE' ? `${tl.data.totalObservations} DATES` : undefined} />
  };

  return (
    <div className="watershed-container">
      <AppNavigation />
      <div className="map-viewport" ref={mapContainer} />

      {/* ── TOP COMMAND BAR ───────────────────────────────────────── */}
      <div className="ws-cmd">
        <div className="ws-cmd-group ws-search">
          <Search size={13} />
          <input
            aria-label="Search watershed, river, place or coordinates"
            placeholder="Search river, basin, place or lat, lon…"
            value={q}
            onChange={(e) => { clearTimeout(blurTimer.current); setQ(e.target.value); setSearchOpen(true); }}
            onFocus={() => { clearTimeout(blurTimer.current); setSearchOpen(true); }}
            onBlur={() => { blurTimer.current = setTimeout(() => setSearchOpen(false), 180); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && search.results[0]) chooseResult(search.results[0]); if (e.key === 'Escape') setSearchOpen(false); }}
          />
          {search.status === 'LOADING' && <span className="ws-spinner sm" />}
          {q && <button className="ws-search-clear" aria-label="Clear search" onClick={() => { setQ(''); document.querySelector('.ws-search input')?.focus(); }}><X size={12} /></button>}
          {searchOpen && q.trim().length >= 2 && search.status !== 'IDLE' && (
            <div className="ws-search-results">
              {search.status === 'LOADING' && <div className="ws-sr-msg">Searching OpenStreetMap + Wikidata…</div>}
              {search.status === 'EMPTY' && <div className="ws-sr-msg">No place matched “{q}”.{search.error ? ` (${search.error})` : ''}</div>}
              {(search.status === 'ERROR' || search.status === 'TIMEOUT') && <div className="ws-sr-msg err">{search.status}: {search.error}</div>}
              {search.results.map((r) => (
                <button key={r.id} className="ws-sr-item" onMouseDown={(e) => { e.preventDefault(); chooseResult(r); }}>
                  <MapPin size={11} />
                  <div>
                    <div className="ws-sr-name">{r.name}</div>
                    <div className="ws-sr-meta">
                      {(r.type || '').replace(/_/g, ' ')} · {r.source === 'demo' ? 'curated example' : r.source === 'saved' ? 'my saved' : r.source}
                      {r.country ? ` · ${r.country}` : r.region ? ` · ${String(r.region).slice(0, 40)}` : ''}
                      {Number.isFinite(r.lat) ? ` · ${r.lat.toFixed(2)}, ${r.lon.toFixed(2)}` : ''}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <button className="ws-cmd-group ws-ctx" onClick={() => ctx && togglePanel('detail', true)} title={ctx ? 'Open Watershed Intelligence' : ''}>
          {busy ? <><span className="ws-spinner sm" /><span className="ws-ctx-busy">{busy}</span></> : ctx ? (
            <>
              <span className="ws-ctx-name">{ctx.name}</span>
              <span className="ws-ctx-meta">{ctx.isCustom ? 'CUSTOM AREA' : `WATERSHED · L${ctx.level}`} · {formatArea(ctx.areaKm2)} · {ctx.isCustom ? 'USER' : 'HYDROSHEDS'}{ctx.isDemo ? ' · DEMO' : ctx.isSaved ? ' · SAVED' : ''}</span>
              <Pill status={liveDot} label={liveDot === 'LIVE' ? '● LIVE' : liveDot === 'PARTIAL' ? '● PARTIAL' : undefined} />
            </>
          ) : <span className="ws-ctx-busy">No active watershed</span>}
        </button>

        <div className="ws-cmd-group ws-toggles">
          {PANEL_IDS.map((id) => (
            <button key={id} className={`ws-tg ${panels[id].open ? 'on' : ''}`} onClick={() => togglePanel(id)} title={PANELS[id].title} aria-pressed={panels[id].open}>{PANELS[id].label}</button>
          ))}
          <button className="ws-tg" title="Refresh all analytics for the active watershed (bypasses server cache)" aria-label="Refresh" disabled={!ctx} onClick={() => setRefreshToken((t) => t + 1)}><RefreshCw size={12} /></button>
        </div>

        <div className="ws-cmd-group ws-actions">
          <div className="ws-menu-wrap">
            <button className={`ws-act ${menu === 'new' ? 'on' : ''}`} onClick={() => setMenu(menu === 'new' ? null : 'new')}><Plus size={12} /> NEW</button>
            {menu === 'new' && (
              <div className="ws-menu">
                <div className="ws-menu-head">NEW CONTEXT</div>
                <button className="ws-menu-item" onClick={startDraw}><Pen size={12} /> Draw boundary on map</button>
                <button className="ws-menu-item" onClick={() => { setMenu(null); document.querySelector('.ws-search input')?.focus(); }}><Search size={12} /> Find existing watershed</button>
                <div className="ws-menu-head">IMPORT GEOJSON</div>
                <input className="ws-input" placeholder="Name" value={saveName} onChange={(e) => setSaveName(e.target.value)} />
                <textarea className="ws-input" rows={3} placeholder='{"type":"Polygon","coordinates":[...]}' value={importText} onChange={(e) => setImportText(e.target.value)} />
                <button className="ws-mini-btn primary wide" disabled={!importText.trim()} onClick={doImport}><Upload size={11} /> IMPORT & SAVE</button>
              </div>
            )}
          </div>
          <div className="ws-menu-wrap">
            <button className={`ws-act ${menu === 'demo' ? 'on' : ''}`} onClick={() => { if (menu !== 'demo' && demos.status === 'ERROR') reloadDemos(); setMenu(menu === 'demo' ? null : 'demo'); }}><Star size={12} /> DEMO ({demos.items.length})</button>
            {menu === 'demo' && (
              <div className="ws-menu wide">
                <div className="ws-menu-head">CURATED EXAMPLES</div>
                {demos.status === 'LOADING' && <div className="ws-sr-msg">Loading curated examples…</div>}
                {demos.status === 'DONE' && demos.items.length === 0 && (
                  <div className="ws-sr-msg">No curated examples yet. They are looked up in HydroBASINS via Earth Engine when the server starts with valid credentials (first start takes ~1–2 min). Check <code>/api/earth-engine/health</code>. <button className="ws-mini-btn" onClick={reloadDemos}>RETRY</button></div>
                )}
                {demos.status === 'ERROR' && <div className="ws-sr-msg err">Could not load curated examples: {demos.error} <button className="ws-mini-btn" onClick={reloadDemos}>RETRY</button></div>}
                {demos.items.map((d) => (
                  <button key={d.id} className={`ws-menu-item tall ${ctx?.id === d.id ? 'on' : ''}`} onClick={() => { setMenu(null); setCands(null); openById(d.id); }}>
                    <div>
                      <b>{d.name}</b> <span className="dim">· {d.metadata?.demoLabel}</span>
                      <div className="ws-menu-sub">{formatArea(d.areaKm2)} · L{d.level} · {d.country || '—'}</div>
                      <div className="ws-menu-sub">{d.metadata?.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="ws-menu-wrap">
            <button className={`ws-act ${menu === 'saved' ? 'on' : ''}`} onClick={() => { if (menu !== 'saved' && saved.status === 'ERROR') reloadSaved(); setMenu(menu === 'saved' ? null : 'saved'); }}><Download size={12} /> SAVED ({saved.items.length})</button>
            {menu === 'saved' && (
              <div className="ws-menu wide">
                <div className="ws-menu-head">MY SAVED WATERSHEDS</div>
                {ctx && !ctx.isSaved && (
                  <div className="ws-save-row">
                    <input className="ws-input" placeholder={`Name (default: ${ctx.name})`} value={saveName} onChange={(e) => setSaveName(e.target.value)} />
                    <button className="ws-mini-btn primary" disabled={saving} onClick={saveCurrent}><Save size={11} /> {saving ? 'SAVING…' : 'SAVE CURRENT'}</button>
                  </div>
                )}
                {saved.status === 'ERROR' && <div className="ws-sr-msg err">{saved.error}</div>}
                {saved.status === 'DONE' && saved.items.length === 0 && <div className="ws-sr-msg">No saved watersheds yet. Activate one and press SAVE CURRENT.</div>}
                {saved.items.map((w) => (
                  <div key={w.id} className={`ws-menu-item tall ${ctx?.id === w.id ? 'on' : ''}`}>
                    <button className="ws-menu-open" onClick={() => { setMenu(null); setCands(null); openById(w.id); }}>
                      <b>{w.name}</b>
                      <div className="ws-menu-sub">{formatArea(w.areaKm2)} · {w.isCustom ? 'custom area' : `HydroSHEDS L${w.level}`} · saved {String(w.createdAt).slice(0, 10)}</div>
                    </button>
                    <button className="ws-mini-btn danger" aria-label={`Delete ${w.name}`} onClick={async () => { if (!window.confirm(`Delete saved watershed "${w.name}"?`)) return; await deleteSaved(w.id); reloadSaved(); }}><Trash2 size={10} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {banner && (
        <div className={`ws-banner ${banner.tone}`}>
          {banner.text}
          <button onClick={() => setBanner(null)} aria-label="Dismiss"><X size={12} /></button>
        </div>
      )}

      {ctxMenu && (
        <div className="ws-ctxmenu" style={{ left: ctxMenu.x + 80, top: ctxMenu.y + 8 }}>
          <div className="ws-menu-head">{ctxMenu.lat.toFixed(5)}, {ctxMenu.lon.toFixed(5)}</div>
          <button className="ws-menu-item" onClick={() => { setCtxMenu(null); resolveAt(ctxMenu.lat, ctxMenu.lon); }}><Crosshair size={12} /> Resolve watershed here</button>
          <button className="ws-menu-item" onClick={startDraw}><Pen size={12} /> Draw boundary</button>
          <button className="ws-menu-item" onClick={() => { setCtxMenu(null); navigate('/field', { state: { ...navState, coordinates: { lat: ctxMenu.lat, lon: ctxMenu.lon } } }); }}><MapPin size={12} /> Field observation here</button>
        </div>
      )}

      {drawing && (
        <div className="ws-draw-banner">
          <Pen size={13} /> <b>DRAW AREA</b>
          <span>Click to add points · double-click or ENTER to finish · ESC to cancel</span>
          <span className="dim">{drawPts.length} point{drawPts.length === 1 ? '' : 's'}</span>
          {drawPts.length > 0 && <button className="ws-mini-btn" onClick={undoPoint}>UNDO</button>}
          {drawPts.length >= 3 && <button className="ws-mini-btn primary" onClick={() => finishDraw(drawPts)}>FINISH</button>}
          <button className="ws-mini-btn" onClick={cancelDraw}><X size={10} /> CANCEL</button>
        </div>
      )}

      {cands && (
        <FloatingPanel
          id="candidates"
          title={cands.kind === 'draw' ? 'REGION ANALYSIS' : 'WATERSHEDS AT THIS LOCATION'}
          subtitle={cands.kind === 'draw' && cands.drawn ? `${formatArea(cands.drawn.areaKm2)} · ${cands.drawn.vertices} vertices · centroid ${cands.drawn.centroid?.lat.toFixed(3)}, ${cands.drawn.centroid?.lon.toFixed(3)}` : cands.title}
          isOpen
          onClose={() => { setCands(null); previewCandidate(null); if (cands.kind === 'draw') clearDraw(); }}
          bringToFront={bringToFront}
          zIndex={500}
          position={{ left: 404, top: 76 }}
          width={440}
          maxHeight="calc(100vh - 400px)"
        >
          {cands.status === 'LOADING' && <div className="ws-state loading"><span className="ws-spinner sm" /> {cands.kind === 'draw' ? 'Intersecting the drawn polygon with HydroBASINS levels…' : 'Resolving HydroBASINS hierarchy (levels 3–8)…'}</div>}
          {(cands.status === 'ERROR' || cands.status === 'TIMEOUT') && <div className="ws-state error">{cands.status}: {cands.error}</div>}
          {cands.status === 'DONE' && (
            <CandidateList
              title={cands.kind === 'draw' ? (cands.countries?.length ? `in ${cands.countries.join(', ')}` : '') : cands.nearPlace ? `near ${String(cands.nearPlace).split(',').slice(0, 2).join(',')}` : ''}
              candidates={cands.list}
              activeId={ctx?.id}
              onView={viewCandidate}
              onSelect={selectCandidate}
              onHover={previewCandidate}
              extra={cands.truncatedLevels?.length > 0 ? <div className="ws-state warn">Level {cands.truncatedLevels.join(', ')} has more than {cands.perLevelLimit} intersecting basins; showing the {cands.perLevelLimit} with the largest overlap. Draw a smaller area for a complete list.</div> : cands.anchor && <div className="ws-state warn">The searched point ({cands.title}) lies in open water outside every HydroBASINS polygon. Anchored to the HydroSHEDS “{cands.anchor.river}” reach {cands.anchor.distanceKm} km away (upstream area {cands.anchor.uplandKm2.toLocaleString()} km²).</div>}
            />
          )}
          {cands.kind === 'draw' && cands.drawn && cands.status !== 'LOADING' && (
            <div className="cand-draft">
              <input className="ws-input" placeholder="Name for drawn area" value={saveName} onChange={(e) => setSaveName(e.target.value)} />
              <button className="ws-mini-btn" onClick={startDraw}><Pen size={10} /> REDRAW</button>
              <button className="ws-mini-btn primary" onClick={useDrawnArea}>USE DRAWN AREA</button>
            </div>
          )}
        </FloatingPanel>
      )}

      {PANEL_IDS.map((id) => (
        <FloatingPanel
          key={id}
          id={id}
          title={PANELS[id].title}
          subtitle={ctx ? ctx.name : undefined}
          status={panelStatus[id]}
          isOpen={panels[id].open}
          onClose={() => togglePanel(id, false)}
          bringToFront={bringToFront}
          zIndex={panels[id].z}
          position={PANELS[id].position}
          width={PANELS[id].width}
          maxHeight={PANELS[id].maxHeight}
          expandedWidth={PANELS[id].expandedWidth}
          mode={id === 'detail' ? detailMode : undefined}
          onModeChange={id === 'detail' ? setDetailMode : undefined}
          className={`panel-${id}`}
        >
          <PanelBoundary name={PANELS[id].title} resetKey={ctx?.key}>{panelBodies[id]}</PanelBoundary>
        </FloatingPanel>
      ))}

      <div className="ws-action-dock">
        {location.state?.returnTo && <button className="ws-control-btn primary" onClick={() => navigate(location.state.returnTo)}><ArrowLeft size={13} /> {(location.state.returnLabel || 'BACK').toUpperCase()}</button>}
        <button className="ws-control-btn" onClick={() => navigate('/explore', { state: navState })}><Layers size={13} /> EXPLORE</button>
        <button className="ws-control-btn" onClick={() => navigate('/compare', { state: navState && { ...navState, lat: navState.coordinates?.lat, lon: navState.coordinates?.lon } })}><ArrowRight size={13} /> COMPARE</button>
        <button className="ws-control-btn" onClick={() => navigate('/field', { state: navState })}><MapPin size={13} /> FIELD</button>
        <button className="ws-control-btn" disabled={!ctx} onClick={() => navigate(`/evidence-review?watershed=${encodeURIComponent(ctx.id)}`, { state: { returnTo: `/watershed?id=${encodeURIComponent(ctx.id)}`, returnLabel: 'Watershed' } })}><ClipboardCheck size={13} /> EVIDENCE REVIEW</button>
        <button className="ws-control-btn" disabled={!ctx} onClick={() => togglePanel('detail', true)}><Eye size={13} /> DETAILS</button>
        <button className="ws-control-btn" onClick={() => navigate('/ask', { state: navState })}><MessageSquare size={13} /> ASK</button>
      </div>

      <div className="ws-zoom-controls">
        <button aria-label="Zoom in" onClick={() => map.current?.zoomIn()}><ZoomIn size={14} /></button>
        <button aria-label="Zoom out" onClick={() => map.current?.zoomOut()}><ZoomOut size={14} /></button>
        <button aria-label="Fit to watershed" onClick={() => ctx?.bbox && map.current?.fitBounds([[ctx.bbox[0], ctx.bbox[1]], [ctx.bbox[2], ctx.bbox[3]]], { padding: 100 })}><Maximize size={14} /></button>
      </div>

      {!ctx && !busy && (
        <div className="ws-welcome">
          <b>DHARAWATCH · WATERSHED INTELLIGENCE</b>
          <span>Search a river or place, double-click the map, or open a curated example:</span>
          {demos.status === 'LOADING' && <span className="dim"><span className="ws-spinner sm" /> loading examples…</span>}
          <div className="dt-chips">{demos.items.map((d) => <button key={d.id} className="ws-chip" onClick={() => openById(d.id)}>{d.name}</button>)}</div>
        </div>
      )}
    </div>
  );
}
