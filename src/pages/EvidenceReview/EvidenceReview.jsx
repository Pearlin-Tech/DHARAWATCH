/**
 * DHARAWATCH — Intervention Evidence Review
 *
 * Route: /evidence-review?watershed=<id>&intervention=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD&buffer=<m>
 * The URL is the source of truth (refresh / deep links restore the page). The active watershed is shared
 * with the rest of the app through AppContext; the selected intervention is one canonical object.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
  ArrowLeft, Camera, Satellite, Mountain, ShieldCheck, Clock, FileText, Sparkles, Layers, ZoomIn, ZoomOut,
  Maximize, Crosshair, Navigation, ArrowRight, MessageSquare, Compass, MapPin, PanelRightClose, PanelRightOpen,
  CheckCircle2, Loader2, Plus
} from 'lucide-react';
import maplibregl from '../../lib/maplibre';
import AppNavigation from '../../components/AppNavigation';
import { useAppContext } from '../../components/UniversalContextBar';
import { getContextById, listDemos, listSaved } from '../../services/watershedClient';
import { listInterventions, getInterventionStatusInfo } from '../../services/interventionClient';
import {
  getReview, runSatellite, getTerrain, getEvidenceBrief, saveReviewOutcome, toInterventionContext, errorState
} from '../../services/evidenceReviewClient';
import { toContext, contextSummary } from '../Watershed/contextModel';
import { useMapLayers } from '../Watershed/useMapLayers';
import { WATERSHED_LAYERS, LAYER_IDS } from '../../shared/layerRegistry';
import { evaluateEvidence } from '../../shared/evidenceStatus';
import { evidenceService } from '../../services/evidenceService';
import { saveLocalEvidence } from '../../services/localEvidence';
import {
  Section, StatePill, EvidenceCards, EvidenceStatusBlock, FieldSection, SatelliteSection, TerrainSection,
  TimelineSection, AssessmentSection, BriefSection, PhotoViewer, fmtDate
} from './EvidencePanels';
import './EvidenceReview.css';

const BUFFER_OPTIONS = [25, 50, 100, 250, 500];
const S2_SR_START = '2017-04-01';
const IDLE = { status: 'IDLE' };
const iso = (d) => d.toISOString().slice(0, 10);

/** Season-aligned defaults: current = today; baseline = same day-of-year in the year before construction. */
function defaultDates(iv) {
  const now = new Date();
  const current = iso(now);
  const built = iv?.metadata?.constructionDate ? new Date(iv.metadata.constructionDate) : null;
  let base = built && !Number.isNaN(built.getTime()) ? new Date(Date.UTC(built.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate())) : null;
  if (!base || iso(base) < S2_SR_START) base = new Date(Date.UTC(now.getUTCFullYear() - 3, now.getUTCMonth(), now.getUTCDate()));
  if (iso(base) < S2_SR_START) base = new Date(S2_SR_START);
  return { baselineDate: iso(base), currentDate: current };
}

function circlePolygon(lng, lat, radiusM, steps = 72) {
  const coords = [];
  const dLat = radiusM / 111320;
  const dLng = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    coords.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return { type: 'Polygon', coordinates: [coords] };
}

const EMPTY_FC = { type: 'FeatureCollection', features: [] };

export default function EvidenceReview() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { currentWatershed, setCurrentWatershed, setCurrentIntervention } = useAppContext();

  const wsId = params.get('watershed') || (/^(hybas-|saved-|custom-)/.test(currentWatershed?.id || '') ? currentWatershed.id : null);
  const ivId = params.get('intervention');

  const updateParams = useCallback((patch, { replace = false } = {}) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) { if (v == null || v === '') next.delete(k); else next.set(k, v); }
      return next;
    }, { replace });
  }, [setParams]);

  // ─── watershed list + active watershed context ────────────────
  const [wsOptions, setWsOptions] = useState({ status: 'LOADING', items: [] });
  useEffect(() => {
    const ac = new AbortController();
    Promise.all([listDemos({ signal: ac.signal }), listSaved({ signal: ac.signal }).catch(() => [])])
      .then(([d, s]) => setWsOptions({ status: 'DONE', items: [...d, ...s].map((w) => ({ id: w.id, name: w.displayName || w.name, level: w.level })) }))
      .catch((e) => { if (!ac.signal.aborted) setWsOptions({ status: 'ERROR', items: [], error: e.message }); });
    return () => ac.abort();
  }, []);

  const [ws, setWs] = useState({ status: wsId ? 'LOADING' : 'IDLE', ctx: null });
  useEffect(() => {
    if (!wsId) { setWs({ status: 'IDLE', ctx: null }); return undefined; }
    const ac = new AbortController();
    setWs({ status: 'LOADING', ctx: null });
    getContextById(wsId, { signal: ac.signal })
      .then((raw) => {
        const ctx = toContext(raw);
        ctx.key = ctx.id;
        setWs({ status: 'AVAILABLE', ctx });
        setCurrentWatershed({ ...contextSummary(ctx), centroid: ctx.centroid, geometry: ctx.geometry });
      })
      .catch((e) => { if (!ac.signal.aborted) setWs({ status: 'ERROR', ctx: null, error: e.message }); });
    return () => ac.abort();
  }, [wsId, setCurrentWatershed]);
  const ctx = ws.ctx;

  // ─── interventions of the active watershed ───────────────────
  const [ivList, setIvList] = useState({ status: 'IDLE', items: [] });
  const [ivNonce, setIvNonce] = useState(0);
  useEffect(() => {
    if (!wsId) { setIvList({ status: 'IDLE', items: [] }); return undefined; }
    const ac = new AbortController();
    setIvList((p) => ({ status: 'LOADING', items: p.wsId === wsId ? p.items : [], wsId }));
    listInterventions({ watershedId: wsId, signal: ac.signal })
      .then((items) => setIvList({ status: 'DONE', items: Array.isArray(items) ? items : [], wsId }))
      .catch((e) => { if (!ac.signal.aborted) setIvList({ status: 'ERROR', items: [], error: e.message, wsId }); });
    return () => ac.abort();
  }, [wsId, ivNonce]);

  // a stale intervention from another watershed is dropped as soon as the list for this watershed arrives
  useEffect(() => {
    if (ivList.status !== 'DONE' || !ivId) return;
    if (!ivList.items.some((i) => i.id === ivId)) updateParams({ intervention: null, from: null, to: null }, { replace: true });
  }, [ivList, ivId, updateParams]);

  // ─── canonical intervention + field evidence ─────────────────
  const [review, setReview] = useState({ status: 'IDLE' });
  const [reviewNonce, setReviewNonce] = useState(0);
  useEffect(() => {
    if (!ivId) { setReview({ status: 'IDLE' }); return undefined; }
    const ac = new AbortController();
    setReview((p) => ({ status: 'LOADING', iv: p.iv?.id === ivId ? p.iv : null }));
    getReview(ivId, { signal: ac.signal })
      .then((r) => setReview({ status: 'AVAILABLE', iv: toInterventionContext(r.intervention), field: r.field, defaultBufferM: r.defaultBufferM }))
      .catch((e) => { if (!ac.signal.aborted) setReview({ status: 'ERROR', ...errorState(e) }); });
    return () => ac.abort();
  }, [ivId, reviewNonce]);
  const iv = review.iv && review.iv.id === ivId ? review.iv : null;
  useEffect(() => { setCurrentIntervention(iv); }, [iv, setCurrentIntervention]);

  // refresh field evidence when coming back from Field (or when the tab regains focus)
  useEffect(() => {
    const onFocus = () => setReviewNonce((n) => n + 1);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // ─── analysis request (dates + footprint) ────────────────────
  const defaults = useMemo(() => defaultDates(iv), [iv]);
  const request = {
    baselineDate: params.get('from') || defaults.baselineDate,
    currentDate: params.get('to') || defaults.currentDate,
    bufferM: Number(params.get('buffer')) || review.defaultBufferM || 50
  };
  const [draft, setDraft] = useState(request);
  useEffect(() => { setDraft(request); }, [request.baselineDate, request.currentDate, request.bufferM]); // eslint-disable-line react-hooks/exhaustive-deps
  const draftDirty = draft.baselineDate !== request.baselineDate || draft.currentDate !== request.currentDate || draft.bufferM !== request.bufferM;
  const draftError = !draft.baselineDate || !draft.currentDate ? 'Both dates are required.'
    : draft.baselineDate >= draft.currentDate ? 'Baseline must be before current.'
    : draft.baselineDate < '2017-03-28' ? 'Sentinel-2 SR starts 2017-03-28 — the baseline will have no image.' : null;

  // ─── satellite + terrain (on demand, per intervention, abortable) ──
  const [sat, setSat] = useState(IDLE);
  const [ter, setTer] = useState(IDLE);
  const [brief, setBrief] = useState(IDLE);
  const satAc = useRef(null);
  const satFor = useRef(null);

  const runSat = useCallback((req) => {
    if (!iv) return;
    satAc.current?.abort();
    const ac = new AbortController();
    satAc.current = ac;
    const key = `${iv.id}|${req.baselineDate}|${req.currentDate}|${req.bufferM}`;
    satFor.current = key;
    setSat((p) => ({ status: 'LOADING', label: 'Querying Sentinel-2 over the analysis area…', data: p.data, key }));
    runSatellite(iv.id, req, { signal: ac.signal })
      .then((data) => { if (satFor.current === key) setSat({ status: 'AVAILABLE', data, key }); })
      .catch((e) => { if (!ac.signal.aborted && satFor.current === key) setSat({ ...errorState(e), key }); });
  }, [iv]);

  useEffect(() => {
    satAc.current?.abort();
    setSat(IDLE); setTer(IDLE); setBrief(IDLE);
    if (!iv) return undefined;
    runSat(request);
    const ac = new AbortController();
    setTer({ status: 'LOADING', label: 'Reading SRTM, MERIT Hydro and HydroSHEDS…' });
    getTerrain(iv.id, { bufferM: request.bufferM }, { signal: ac.signal })
      .then((data) => setTer({ status: 'AVAILABLE', data }))
      .catch((e) => { if (!ac.signal.aborted) setTer(errorState(e)); });
    return () => { ac.abort(); satAc.current?.abort(); };
  }, [iv?.id, request.baselineDate, request.currentDate, request.bufferM]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyDraft = () => {
    if (draftError && !draftError.startsWith('Sentinel')) return;
    if (!draftDirty) { runSat(request); return; }
    updateParams({ from: draft.baselineDate, to: draft.currentDate, buffer: String(draft.bufferM) });
  };

  const fieldRes = review.status === 'AVAILABLE' ? { status: 'AVAILABLE', ...review.field } : review.status === 'ERROR' ? review : { status: 'LOADING' };
  const ev = useMemo(() => evaluateEvidence({ intervention: iv ? { ...iv, status: iv.status, type: iv.type } : null, field: fieldRes, satellite: sat, terrain: ter }),
    [iv, review, sat, ter]); // eslint-disable-line react-hooks/exhaustive-deps

  const genBrief = () => {
    if (!iv) return;
    setBrief({ status: 'LOADING', label: 'Generating evidence brief from verified data…' });
    getEvidenceBrief(iv.id, request).then((data) => setBrief({ status: 'AVAILABLE', data })).catch((e) => setBrief(errorState(e)));
  };

  const [saving, setSaving] = useState(false);
  const markReviewed = async () => {
    if (!iv || ev.key === 'PENDING') return;
    setSaving(true);
    try {
      const s = sat.data?.status === 'AVAILABLE' ? sat.data : null;
      await saveReviewOutcome(iv.id, {
        status: ev.key, label: ev.label, reasons: ev.reasons, limitations: ev.limitations, reviewedAt: new Date().toISOString(),
        baselineDate: request.baselineDate, currentDate: request.currentDate, bufferM: request.bufferM,
        scenes: s ? { baseline: s.baseline.acquisitionDate, current: s.current.acquisitionDate } : null
      });
      // the review is also kept as an evidence record so it shows up in the Evidence page
      const reviewRecord = {
        id: `evidence-review-${Date.now()}`,
        type: 'INTERVENTION_REVIEW',
        interventionId: iv.id, interventionName: iv.name, interventionType: iv.type,
        watershedId: iv.watershedId, watershedName: ctx?.name || null,
        coordinates: { latitude: iv.latitude, longitude: iv.longitude },
        status: ev.key, label: ev.label, reasons: ev.reasons, limitations: ev.limitations,
        satellite: s ? { baseline: s.baseline.acquisitionDate, current: s.current.acquisitionDate, change: s.change } : null,
        fieldPhotos: ev.field.photoCount,
        createdAt: new Date().toISOString()
      };
      saveLocalEvidence(reviewRecord);                       // kept in this browser
      await evidenceService.create(reviewRecord).catch(() => {}); // server copy is best-effort
      setReviewNonce((n) => n + 1);
    } catch (e) {
      window.alert(`Could not save review: ${e.message}`);
    } finally { setSaving(false); }
  };

  // ─── panel sections ───────────────────────────────────────────
  const [open, setOpen] = useState({ summary: true, status: true, field: true, satellite: true, terrain: true, timeline: false, assessment: true, brief: false });
  const toggle = (id, v) => setOpen((o) => ({ ...o, [id]: v ?? !o[id] }));
  const panelRef = useRef(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const focusSection = (id) => {
    setPanelOpen(true);
    toggle(id, true);
    requestAnimationFrame(() => document.getElementById(`er-sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const [photo, setPhoto] = useState(null);

  // ─── map ──────────────────────────────────────────────────────
  const mapEl = useRef(null);
  const map = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [layerMenu, setLayerMenu] = useState(false);
  useEffect(() => {
    if (map.current || !mapEl.current) return undefined;
    const m = new maplibregl.Map({
      container: mapEl.current,
      style: {
        version: 8,
        sources: { satellite: { type: 'raster', tiles: ['https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'], tileSize: 256, maxzoom: 20, attribution: '© Google' } },
        layers: [{ id: 'satellite-base', type: 'raster', source: 'satellite' }]
      },
      center: [78.9, 21.5], zoom: 4, maxZoom: 20, attributionControl: { compact: true }
    });
    map.current = m;
    if (import.meta.env.DEV) window.__er = m;
    m.on('load', () => {
      m.addSource('ws-boundary', { type: 'geojson', data: EMPTY_FC });
      m.addLayer({ id: 'ws-boundary-fill', type: 'fill', source: 'ws-boundary', paint: { 'fill-color': '#38bdf8', 'fill-opacity': 0.05 } });
      m.addLayer({ id: 'ws-boundary-line', type: 'line', source: 'ws-boundary', paint: { 'line-color': '#38bdf8', 'line-width': 2 } });
      m.addSource('er-footprint', { type: 'geojson', data: EMPTY_FC });
      m.addLayer({ id: 'er-footprint-fill', type: 'fill', source: 'er-footprint', paint: { 'fill-color': '#22d3ee', 'fill-opacity': 0.12 } });
      m.addLayer({ id: 'er-footprint-line', type: 'line', source: 'er-footprint', paint: { 'line-color': '#22d3ee', 'line-width': 2, 'line-dasharray': [2, 1] } });
      m.addSource('er-photos', { type: 'geojson', data: EMPTY_FC });
      m.addLayer({ id: 'er-photos', type: 'circle', source: 'er-photos', paint: { 'circle-radius': 6, 'circle-color': '#10b981', 'circle-stroke-color': '#04140d', 'circle-stroke-width': 2 } });
      m.addSource('er-ivs', { type: 'geojson', data: EMPTY_FC });
      m.addLayer({
        id: 'er-ivs', type: 'circle', source: 'er-ivs',
        paint: {
          'circle-radius': ['case', ['get', 'selected'], 9, 6],
          'circle-color': ['case', ['get', 'selected'], '#f59e0b', '#fbbf24'],
          'circle-opacity': ['case', ['get', 'selected'], 1, 0.75],
          'circle-stroke-color': ['case', ['get', 'selected'], '#ffffff', '#1f1300'], 'circle-stroke-width': 2
        }
      });
      m.addLayer({
        id: 'er-ivs-label', type: 'symbol', source: 'er-ivs', filter: ['get', 'selected'],
        layout: { 'text-field': ['get', 'name'], 'text-size': 12, 'text-offset': [0, 1.4], 'text-anchor': 'top', 'text-font': ['Open Sans Semibold'] },
        paint: { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 1.5 }
      });
      setMapReady(true);
    });
    return () => { m.remove(); map.current = null; };
  }, []);

  const { layers, toggle: toggleLayer } = useMapLayers(map, mapReady, ctx);
  // site-scale review starts on the high-resolution basemap; Sentinel-2 composite stays one click away
  const s2Off = useRef(false);
  useEffect(() => { if (!s2Off.current && layers.sentinel2?.enabled) { s2Off.current = true; toggleLayer('sentinel2'); } }, [layers.sentinel2?.enabled, toggleLayer]);

  // boundary + fit on watershed change
  useEffect(() => {
    const m = map.current;
    if (!mapReady || !m) return;
    m.getSource('ws-boundary').setData(ctx ? { type: 'Feature', properties: {}, geometry: ctx.geometry } : EMPTY_FC);
    if (ctx?.bbox && !ivId) m.fitBounds([[ctx.bbox[0], ctx.bbox[1]], [ctx.bbox[2], ctx.bbox[3]]], { padding: 60, duration: 900 });
  }, [ctx, mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // intervention markers
  useEffect(() => {
    const m = map.current;
    if (!mapReady || !m) return;
    m.getSource('er-ivs').setData({
      type: 'FeatureCollection',
      features: ivList.items.filter((i) => Number.isFinite(Number(i.coordinates?.lat))).map((i) => ({
        type: 'Feature', properties: { id: i.id, name: i.name, selected: i.id === ivId }, geometry: { type: 'Point', coordinates: [Number(i.coordinates.lng), Number(i.coordinates.lat)] }
      }))
    });
  }, [ivList, ivId, mapReady]);

  // footprint + photos + fly-to on intervention change
  useEffect(() => {
    const m = map.current;
    if (!mapReady || !m) return;
    if (!iv || !Number.isFinite(iv.latitude)) { m.getSource('er-footprint').setData(EMPTY_FC); m.getSource('er-photos').setData(EMPTY_FC); return; }
    const geom = iv.geometry?.type?.includes('Polygon') ? iv.geometry : circlePolygon(iv.longitude, iv.latitude, request.bufferM);
    m.getSource('er-footprint').setData({ type: 'Feature', properties: {}, geometry: geom });
    const photos = review.field?.photos || [];
    m.getSource('er-photos').setData({
      type: 'FeatureCollection',
      features: photos.filter((p) => p.location?.latitude != null).map((p) => ({ type: 'Feature', properties: { id: p.id }, geometry: { type: 'Point', coordinates: [Number(p.location.longitude), Number(p.location.latitude)] } }))
    });
  }, [iv, review.field, request.bufferM, mapReady]);

  // fly as soon as the selected intervention's position is known — from the detail record, or from the
  // watershed's intervention list if the detail request is slow or failed
  const flownTo = useRef(null);
  const listItem = ivList.items.find((i) => i.id === ivId);
  const target = iv && Number.isFinite(iv.latitude) ? { id: iv.id, lat: iv.latitude, lng: iv.longitude }
    : listItem && Number.isFinite(Number(listItem.coordinates?.lat)) ? { id: listItem.id, lat: Number(listItem.coordinates.lat), lng: Number(listItem.coordinates.lng) } : null;
  useEffect(() => {
    const m = map.current;
    if (!mapReady || !m || !target || flownTo.current === target.id) return;
    flownTo.current = target.id;
    const zoom = request.bufferM <= 50 ? 17 : request.bufferM <= 100 ? 16.3 : request.bufferM <= 250 ? 15.3 : 14.3;
    m.flyTo({ center: [target.lng, target.lat], zoom, duration: 1400, essential: true });
  }, [target?.id, mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // map interactions: select intervention, open photo, watershed popup
  const handlers = useRef({});
  handlers.current = {
    selectIv: (id) => { flownTo.current = null; updateParams({ intervention: id, from: null, to: null, buffer: null }); },
    openPhoto: (id) => { const p = review.field?.photos?.find((x) => x.id === id); if (p) setPhoto(p); },
    viewWatershed: () => ctx && navigate(`/watershed?id=${encodeURIComponent(ctx.id)}`, { state: { returnTo: `${location.pathname}${location.search}`, returnLabel: 'Evidence Review' } })
  };
  useEffect(() => {
    const m = map.current;
    if (!mapReady || !m) return undefined;
    let popup = null;
    const onIv = (e) => { const id = e.features?.[0]?.properties?.id; if (id) handlers.current.selectIv(id); };
    const onPhoto = (e) => { const id = e.features?.[0]?.properties?.id; if (id) handlers.current.openPhoto(id); };
    const onClick = (e) => {
      if (m.queryRenderedFeatures(e.point, { layers: ['er-ivs', 'er-photos'] }).length) return;
      if (!m.queryRenderedFeatures(e.point, { layers: ['ws-boundary-fill'] }).length) return;
      popup?.remove();
      const el = document.createElement('div');
      el.className = 'er-popup';
      const btn = document.createElement('button');
      btn.textContent = 'VIEW WATERSHED →';
      btn.onclick = () => { popup?.remove(); handlers.current.viewWatershed(); };
      const name = document.createElement('div');
      name.textContent = ctx?.name || 'Watershed';
      el.append(name, btn);
      popup = new maplibregl.Popup({ closeButton: false, className: 'er-popup-wrap' }).setLngLat(e.lngLat).setDOMContent(el).addTo(m);
    };
    const pointer = () => { m.getCanvas().style.cursor = 'pointer'; };
    const unpointer = () => { m.getCanvas().style.cursor = ''; };
    m.on('click', 'er-ivs', onIv);
    m.on('click', 'er-photos', onPhoto);
    m.on('click', onClick);
    ['er-ivs', 'er-photos'].forEach((l) => { m.on('mouseenter', l, pointer); m.on('mouseleave', l, unpointer); });
    return () => {
      popup?.remove();
      m.off('click', 'er-ivs', onIv); m.off('click', 'er-photos', onPhoto); m.off('click', onClick);
      ['er-ivs', 'er-photos'].forEach((l) => { m.off('mouseenter', l, pointer); m.off('mouseleave', l, unpointer); });
    };
  }, [mapReady, ctx]);

  // keep the map sized to its grid cell when the panel collapses / viewport changes
  useEffect(() => { const t = setTimeout(() => map.current?.resize(), 260); return () => clearTimeout(t); }, [panelOpen]);

  // ─── cross-module navigation (context travels with every jump) ─
  const returnTo = `${location.pathname}${location.search}`;
  const wsState = ctx ? { id: ctx.id, name: ctx.name, centroid: ctx.centroid, areaKm2: ctx.areaKm2, level: ctx.level, source: ctx.source } : null;
  const ivState = iv ? { id: iv.id, name: iv.name, type: iv.type, status: iv.status, lat: iv.latitude, lng: iv.longitude, watershedId: iv.watershedId, geometry: iv.geometry } : null;
  const go = {
    watershed: () => ctx && navigate(`/watershed?id=${encodeURIComponent(ctx.id)}${iv ? `&focus=${iv.latitude},${iv.longitude}&intervention=${encodeURIComponent(iv.id)}` : ''}`, { state: { returnTo, returnLabel: 'Evidence Review' } }),
    field: () => navigate('/field', { state: { watershedId: ctx?.id, watershedName: ctx?.name, coordinates: iv ? { lat: iv.latitude, lon: iv.longitude } : ctx?.centroid && { lat: ctx.centroid.lat, lon: ctx.centroid.lon }, interventionId: iv?.id, interventionName: iv?.name, returnTo, returnLabel: 'Evidence Review' } }),
    compare: () => navigate('/compare', { state: { coords: iv ? { lat: iv.latitude, lng: iv.longitude } : ctx?.centroid && { lat: ctx.centroid.lat, lng: ctx.centroid.lon }, baselineDate: request.baselineDate, currentDate: request.currentDate, bufferM: request.bufferM, siteName: iv?.name, returnTo, returnLabel: 'Evidence Review' } }),
    explore: () => navigate('/explore', { state: ctx ? { watershedId: ctx.id, watershedName: ctx.name, coordinates: iv ? { lat: iv.latitude, lon: iv.longitude } : undefined } : undefined }),
    ask: () => navigate('/ask', { state: ctx ? { watershedId: ctx.id, watershedName: ctx.name, coordinates: iv ? { lat: iv.latitude, lon: iv.longitude } : undefined, interventionId: iv?.id } : undefined })
  };
  const backTo = location.state?.returnTo
    ? { label: location.state.returnLabel || 'Back', onClick: () => navigate(location.state.returnTo) }
    : ctx ? { label: 'Watershed', onClick: go.watershed } : null;

  const statusInfo = iv ? getInterventionStatusInfo(iv.status) : null;
  const liveState = !iv ? (ivId && review.status === 'LOADING' ? 'LOADING' : 'IDLE') : ev.key === 'PENDING' || sat.status === 'LOADING' || ter.status === 'LOADING' ? 'LOADING' : 'LIVE';

  // ─── render ───────────────────────────────────────────────────
  return (
    <div className={`er-page ${panelOpen ? '' : 'panel-closed'}`}>
      <AppNavigation />

      {/* TOP CONTEXT BAR */}
      <header className="er-top">
        <div className="er-top-row">
          {backTo && <button className="er-back" onClick={backTo.onClick}><ArrowLeft size={13} /> {backTo.label}</button>}
          <div className="er-title">
            <h1>INTERVENTION EVIDENCE REVIEW <span className="er-badge">DHARAWATCH · SIH26015</span></h1>
            <p>Review field evidence, satellite change and terrain context for watershed interventions.</p>
          </div>
          <div className="er-context">
            <div><span>WATERSHED</span><b title={ctx?.name}>{ctx?.name || (ws.status === 'LOADING' ? 'Loading…' : '—')}</b></div>
            <div><span>INTERVENTION</span><b title={iv?.name}>{iv?.name || (review.status === 'LOADING' ? 'Loading…' : '—')}</b></div>
            <div><span>STATUS</span><b style={statusInfo ? { color: statusInfo.color } : undefined}>{statusInfo ? `● ${statusInfo.label.toUpperCase()}` : '—'}</b></div>
            <div><span>DATA</span><b className={`er-live ${liveState.toLowerCase()}`}>{liveState === 'LIVE' ? '● LIVE DATA' : liveState === 'LOADING' ? '◌ LOADING' : '—'}</b></div>
          </div>
        </div>
        <div className="er-controls">
          <label className="er-field">
            <span>WATERSHED</span>
            <select value={wsId || ''} onChange={(e) => { flownTo.current = null; updateParams({ watershed: e.target.value, intervention: null, from: null, to: null, buffer: null }); }}>
              <option value="" disabled>{wsOptions.status === 'LOADING' ? 'Loading watersheds…' : 'Select watershed'}</option>
              {wsId && !wsOptions.items.some((w) => w.id === wsId) && <option value={wsId}>{ctx?.name || wsId}</option>}
              {wsOptions.items.map((w) => <option key={w.id} value={w.id}>{w.name}{w.level ? ` · L${w.level}` : ''}</option>)}
            </select>
          </label>
          <label className="er-field grow">
            <span>INTERVENTION {ivList.status === 'DONE' && `(${ivList.items.length})`}</span>
            <select value={ivList.items.some((i) => i.id === ivId) ? ivId : ''} disabled={!wsId || ivList.status !== 'DONE' || !ivList.items.length}
              onChange={(e) => handlers.current.selectIv(e.target.value)}>
              <option value="" disabled>{!wsId ? 'Select a watershed first' : ivList.status === 'LOADING' ? 'Loading interventions…' : ivList.status === 'ERROR' ? 'Could not load interventions' : ivList.items.length ? 'Select intervention' : 'No interventions found'}</option>
              {ivList.items.map((i) => <option key={i.id} value={i.id}>{i.name} — {i.type} · {getInterventionStatusInfo(i.status).label}</option>)}
            </select>
          </label>
          <label className="er-field">
            <span>BASELINE</span>
            <input type="date" min="2017-03-28" max={draft.currentDate} value={draft.baselineDate} disabled={!iv} onChange={(e) => setDraft((d) => ({ ...d, baselineDate: e.target.value }))} />
          </label>
          <label className="er-field">
            <span>CURRENT</span>
            <input type="date" min={draft.baselineDate} max={iso(new Date())} value={draft.currentDate} disabled={!iv} onChange={(e) => setDraft((d) => ({ ...d, currentDate: e.target.value }))} />
          </label>
          <label className="er-field">
            <span>RADIUS</span>
            <select value={draft.bufferM} disabled={!iv || !!iv?.geometry} onChange={(e) => setDraft((d) => ({ ...d, bufferM: Number(e.target.value) }))}>
              {[...new Set([...BUFFER_OPTIONS, draft.bufferM])].sort((a, b) => a - b).map((b) => <option key={b} value={b}>{b} m</option>)}
            </select>
          </label>
          <button className="er-btn primary er-analyze" disabled={!iv || sat.status === 'LOADING' || (!!draftError && !draftError.startsWith('Sentinel'))} onClick={applyDraft} title={draftError || 'Run satellite analysis for the analysis area'}>
            {sat.status === 'LOADING' ? <><Loader2 size={12} className="er-spin" /> ANALYZING</> : <><Satellite size={12} /> {draftDirty ? 'ANALYZE' : 'RE-RUN'}</>}
          </button>
        </div>
        {draftError && iv && <div className="er-control-hint">{draftError}</div>}
      </header>

      {/* MAP */}
      <main className="er-map-wrap">
        <div ref={mapEl} className="er-map" />
        <div className="er-map-tools">
          <button className={`er-tool ${layerMenu ? 'on' : ''}`} onClick={() => setLayerMenu((v) => !v)} aria-expanded={layerMenu} title="Map layers"><Layers size={14} /> LAYERS</button>
          {layerMenu && (
            <div className="er-layer-menu">
              <div className="er-layer-note">Watershed layers (same registry &amp; Earth Engine pipeline as the Watershed page)</div>
              {LAYER_IDS.map((id) => {
                const l = layers[id];
                const d = WATERSHED_LAYERS[id];
                return (
                  <label key={id} className="er-layer-row">
                    <input type="checkbox" checked={!!l?.enabled} disabled={!ctx} onChange={() => toggleLayer(id)} />
                    <span>{d.label}</span>
                    {l?.enabled && <StatePill state={l.status === 'ACTIVE' ? 'AVAILABLE' : l.status} label={l.status} />}
                  </label>
                );
              })}
            </div>
          )}
        </div>
        <div className="er-zoom">
          <button aria-label="Zoom in" onClick={() => map.current?.zoomIn()}><ZoomIn size={14} /></button>
          <button aria-label="Zoom out" onClick={() => map.current?.zoomOut()}><ZoomOut size={14} /></button>
          <button aria-label="Fly to intervention" disabled={!iv} onClick={() => iv && map.current?.flyTo({ center: [iv.longitude, iv.latitude], zoom: 16.5 })}><Crosshair size={14} /></button>
          <button aria-label="Fit to watershed" disabled={!ctx} onClick={() => ctx?.bbox && map.current?.fitBounds([[ctx.bbox[0], ctx.bbox[1]], [ctx.bbox[2], ctx.bbox[3]]], { padding: 60 })}><Maximize size={14} /></button>
        </div>
        <div className="er-legend">
          <span><i className="lg-iv" /> Intervention</span>
          <span><i className="lg-photo" /> Field photo</span>
          <span><i className="lg-ws" /> Watershed</span>
          {iv && <span><i className="lg-area" /> Analysis area · {iv.geometry ? 'polygon' : `${request.bufferM} m`}{sat.data?.analysisArea ? ` · ${sat.data.analysisArea.areaHa} ha` : ''}</span>}
          {layers.drainage?.enabled && <span><i className="lg-drain" /> Drainage</span>}
        </div>
        {!wsId && (
          <div className="er-map-empty">
            <ShieldCheck size={22} />
            <b>Select a watershed to review its interventions</b>
            <span>Or open a watershed and choose “Review evidence” on an intervention.</span>
            <button className="er-btn primary" onClick={() => navigate('/watershed')}>OPEN WATERSHED</button>
          </div>
        )}
        {ws.status === 'ERROR' && <div className="er-map-banner error">Could not load watershed: {ws.error}</div>}
        <button className="er-panel-toggle" onClick={() => setPanelOpen((v) => !v)} aria-label={panelOpen ? 'Collapse evidence panel' : 'Expand evidence panel'}>
          {panelOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
        </button>
      </main>

      {/* EVIDENCE PANEL */}
      <aside className="er-panel" ref={panelRef} aria-label="Evidence panel">
        {!wsId ? (
          <div className="er-empty"><ShieldCheck size={18} /><b>NO WATERSHED SELECTED</b><span>Choose a watershed in the bar above.</span></div>
        ) : ivList.status === 'DONE' && !ivList.items.length ? (
          <div className="er-empty">
            <MapPin size={18} />
            <b>NO INTERVENTIONS FOUND</b>
            <span>{ctx?.name || 'This watershed'} has no recorded interventions yet.</span>
            <div className="er-row center">
              <button className="er-btn primary" onClick={() => ctx && navigate(`/watershed?id=${encodeURIComponent(ctx.id)}&panel=interventions`, { state: { returnTo, returnLabel: 'Evidence Review' } })}><Plus size={12} /> ADD INTERVENTION</button>
              <button className="er-btn" onClick={go.field}><Camera size={12} /> CREATE FIELD OBSERVATION</button>
            </div>
          </div>
        ) : ivList.status === 'ERROR' ? (
          <div className="er-empty"><b>COULD NOT LOAD INTERVENTIONS</b><span>{ivList.error}</span><button className="er-btn" onClick={() => setIvNonce((n) => n + 1)}>RETRY</button></div>
        ) : !ivId ? (
          <div className="er-pick">
            <div className="er-pick-title">SELECT AN INTERVENTION {ivList.status === 'LOADING' && <Loader2 size={12} className="er-spin" />}</div>
            {ivList.items.map((i) => {
              const si = getInterventionStatusInfo(i.status);
              return (
                <button key={i.id} className="er-pick-row" onClick={() => handlers.current.selectIv(i.id)} style={{ borderLeftColor: si.color }}>
                  <b>{i.name}</b>
                  <span>{i.type} · <em style={{ color: si.color }}>{si.label}</em></span>
                  <small>{Number(i.coordinates?.lat).toFixed(4)}, {Number(i.coordinates?.lng).toFixed(4)}{i.constructionDate ? ` · built ${i.constructionDate.slice(0, 10)}` : ''}</small>
                </button>
              );
            })}
          </div>
        ) : review.status === 'ERROR' ? (
          <div className="er-empty"><b>COULD NOT LOAD INTERVENTION</b><span>{review.error}</span><button className="er-btn" onClick={() => setReviewNonce((n) => n + 1)}>RETRY</button></div>
        ) : !iv ? (
          <div className="er-state"><Loader2 size={13} className="er-spin" /> Loading intervention…</div>
        ) : (
          <>
            {/* INTERVENTION SUMMARY */}
            <div className="er-summary">
              <div className="er-summary-head">
                <div>
                  <h2>{iv.name}</h2>
                  <span>{iv.type}</span>
                </div>
                <span className="er-status-chip" style={{ color: statusInfo.color, background: statusInfo.bg }}>{statusInfo.label}</span>
              </div>
              <dl className="er-dl compact">
                {iv.metadata.constructionDate && <><dt>Constructed</dt><dd>{fmtDate(iv.metadata.constructionDate)}</dd></>}
                <dt>Watershed</dt><dd>{ctx?.name || iv.watershedId}</dd>
                <dt>Coordinates</dt><dd className="er-mono">{iv.latitude.toFixed(5)}, {iv.longitude.toFixed(5)}</dd>
                {iv.metadata.notes && <><dt>Notes</dt><dd>{iv.metadata.notes}</dd></>}
              </dl>
              <div className="er-actions">
                <button className="er-btn" onClick={go.watershed}><Compass size={12} /> VIEW IN WATERSHED</button>
                <button className="er-btn" onClick={go.field}><Camera size={12} /> FIELD OBSERVATION</button>
                <button className="er-btn" onClick={go.compare}><ArrowRight size={12} /> COMPARE</button>
              </div>
            </div>

            <EvidenceStatusBlock ev={ev} review={iv.metadata.evidenceReview} />
            <EvidenceCards ev={ev} sat={sat} ter={ter} onOpen={focusSection} />

            <Section id="field" icon={Camera} title="FIELD EVIDENCE" open={open.field} onToggle={() => toggle('field')} pill={<StatePill state={ev.components.field.state} />}>
              <FieldSection field={fieldRes} ev={ev} onPhoto={setPhoto} onCapture={go.field} onRetry={() => setReviewNonce((n) => n + 1)} />
            </Section>
            <Section id="satellite" icon={Satellite} title="SATELLITE CHANGE" open={open.satellite} onToggle={() => toggle('satellite')} pill={<StatePill state={sat.status === 'AVAILABLE' ? sat.data.status : sat.status} />}>
              <SatelliteSection sat={sat} request={request} dirty={!!sat.data && sat.key !== `${iv.id}|${request.baselineDate}|${request.currentDate}|${request.bufferM}`} onRun={() => runSat(request)} onCompare={go.compare} />
            </Section>
            <Section id="terrain" icon={Mountain} title="TERRAIN CONTEXT" open={open.terrain} onToggle={() => toggle('terrain')} pill={<StatePill state={ter.status === 'AVAILABLE' ? ter.data.status : ter.status} />}>
              <TerrainSection ter={ter} onRetry={() => { setTer({ status: 'LOADING' }); getTerrain(iv.id, { bufferM: request.bufferM }).then((data) => setTer({ status: 'AVAILABLE', data })).catch((e) => setTer(errorState(e))); }} />
            </Section>
            <Section id="timeline" icon={Clock} title="TIMELINE" open={open.timeline} onToggle={() => toggle('timeline')}>
              <TimelineSection iv={iv} field={review.field || {}} sat={sat} />
            </Section>
            <Section id="assessment" icon={FileText} title="SYNTHESIZED EVIDENCE ASSESSMENT" open={open.assessment} onToggle={() => toggle('assessment')} pill={<StatePill state={ev.key === 'PENDING' ? 'LOADING' : ev.tone === 'good' ? 'AVAILABLE' : 'PARTIAL'} label={ev.label} />}>
              <AssessmentSection ev={ev} field={fieldRes} sat={sat} ter={ter} />
            </Section>
            <Section id="brief" icon={Sparkles} title="AI EVIDENCE BRIEF" open={open.brief} onToggle={() => toggle('brief')} pill={brief.data?.status && <StatePill state={brief.data.status === 'AVAILABLE' ? 'AVAILABLE' : 'ERROR'} label={brief.data.status} />}>
              <BriefSection brief={brief} onGenerate={genBrief} />
            </Section>

            <div className="er-decision">
              <div className="er-decision-title">DECISION / ACTION</div>
              <div className="er-row">
                <button className="er-btn primary" onClick={markReviewed} disabled={saving || ev.key === 'PENDING'}>
                  {saving ? <Loader2 size={12} className="er-spin" /> : <CheckCircle2 size={12} />} MARK REVIEWED · {ev.label}
                </button>
                <button className="er-btn" onClick={go.field}><Camera size={12} /> CAPTURE FIELD EVIDENCE</button>
              </div>
            </div>
          </>
        )}
      </aside>

      {/* BOTTOM COMMAND DOCK */}
      <nav className="er-dock" aria-label="DHARAWATCH actions">
        <button className="er-dock-btn" onClick={go.explore}><Layers size={13} /> EXPLORE</button>
        <button className="er-dock-btn" onClick={go.compare}><ArrowRight size={13} /> COMPARE</button>
        <button className="er-dock-btn" onClick={go.watershed} disabled={!ctx}><Compass size={13} /> WATERSHED</button>
        <button className="er-dock-btn" onClick={go.field}><Camera size={13} /> FIELD</button>
        <button className="er-dock-btn current" aria-current="page"><ShieldCheck size={13} /> EVIDENCE REVIEW</button>
        <button className="er-dock-btn" onClick={go.ask}><MessageSquare size={13} /> ASK DHARAWATCH</button>
      </nav>

      <PhotoViewer photo={photo} intervention={iv} onClose={() => setPhoto(null)} />
    </div>
  );
}
