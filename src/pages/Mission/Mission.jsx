import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useGoogleMaps } from '../../hooks/useGoogleMaps';
import {
  Crosshair, Camera, Droplets, Clock, Target, Car,
  ArrowRight, ShieldCheck, Download, Save,
  Play, CheckCircle2, ChevronDown, Layers, MapPin,
  ZoomIn, ZoomOut, Maximize, AlertTriangle, Check,
  Search, X, Route, Timer, Footprints, Shield,
  Plus, Pen, Trash2, Eye, EyeOff, Flag
} from 'lucide-react';
import AppNavigation from '../../components/AppNavigation';
import { useGlobalContext } from '../../context/GlobalContext';
import { useAppContext } from '../../components/UniversalContextBar';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { 
  listMissions, getMission, createMission, updateMission, deleteMission,
  listMissionStops, createMissionStop, updateMissionStop, deleteMissionStop,
  MISSION_STATUSES, MISSION_STOP_STATUSES, MISSION_STOP_TYPES,
  getMissionStatusInfo, getMissionStopStatusInfo, getMissionStopTypeInfo
} from '../../services/missionClient';
import './Mission.css';
// ─── Constants ──────────────────────────────────────────────────────────────
const WINDOW_OPTIONS = [
  { label: '1 HOUR', minutes: 60 },
  { label: '2 HOURS', minutes: 120 },
  { label: '3 HOURS', minutes: 180 },
  { label: '4 HOURS', minutes: 240 },
  { label: '5 HOURS', minutes: 300 },
  { label: '6 HOURS', minutes: 360 },
  { label: '8 HOURS', minutes: 480 },
];

const STOP_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10];

const TRANSIT_OPTIONS = [
  { label: 'Vehicle + Walking', value: 'DRIVING_WALKING' },
  { label: 'Driving Only', value: 'DRIVING' },
  { label: 'Walking', value: 'WALKING' },
  { label: 'Cycling', value: 'BICYCLING' },
];

// ─── Dropdown Portal ────────────────────────────────────────────────────────
function Dropdown({ anchorRef, open, onClose, children, width = 280 }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target) &&
        anchorRef.current && !anchorRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose, anchorRef]);

  if (!open || !anchorRef.current) return null;
  const rect = anchorRef.current.getBoundingClientRect();

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top: rect.bottom + 6,
        left: rect.left,
        width: Math.max(width, rect.width),
        zIndex: 99999,
        background: 'rgba(9,15,28,0.97)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(56,189,248,0.3)',
        borderRadius: 8,
        boxShadow: '0 8px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(56,189,248,0.08)',
        animation: 'ddFadeIn 0.15s ease',
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
}

// ─── Searchable Watershed Selector ──────────────────────────────────────────
function WatershedSelector({ value, onChange }) {
  const anchorRef = useRef(null);
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  const search = useCallback(async (query) => {
    if (!query || query.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/mission/watersheds/search?q=' + encodeURIComponent(query));
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } catch { setResults([]); }
    setLoading(false);
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q), 350);
  }, [q, search]);

  useEffect(() => {
    if (open && inputRef.current) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  return (
    <>
      <div
        ref={anchorRef}
        className="config-box"
        onClick={() => setOpen(o => !o)}
        style={{ minWidth: 220, cursor: 'pointer' }}
      >
        <div className="cb-label"><Droplets size={11} /> TARGET WATERSHED</div>
        <div className="cb-val">
          <span style={{ color: value ? '#fff' : '#6b7280', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
            {value ? value.name : 'SELECT TARGET'}
          </span>
          <ChevronDown size={13} color="#6b7280" style={{ flexShrink: 0, transition: 'transform 0.18s', transform: open ? 'rotate(180deg)' : '' }} />
        </div>
      </div>
      <Dropdown anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} width={320}>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, padding: '6px 10px' }}>
            <Search size={13} color="#6b7280" />
            <input
              ref={inputRef}
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search watershed..."
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 12, fontFamily: 'Inter, sans-serif' }}
            />
            {q && <X size={13} color="#6b7280" style={{ cursor: 'pointer' }} onClick={() => setQ('')} />}
          </div>
        </div>
        <div style={{ maxHeight: 260, overflowY: 'auto' }}>
          {loading && (
            <div style={{ padding: '12px 16px', color: '#6b7280', fontFamily: 'monospace', fontSize: 11, textAlign: 'center' }}>
              Searching...
            </div>
          )}
          {!loading && results.length === 0 && q.length >= 2 && (
            <div style={{ padding: '12px 16px', color: '#6b7280', fontFamily: 'monospace', fontSize: 11 }}>
              No watersheds found for "{q}"
            </div>
          )}
          {!loading && q.length < 2 && (
            <div style={{ padding: '12px 16px', color: '#4b5563', fontFamily: 'monospace', fontSize: 10 }}>
              TYPE TO SEARCH — e.g. Narmada, Sardar Sarovar, Tapi
            </div>
          )}
          {results.map((r, i) => (
            <div
              key={i}
              onClick={() => { onChange(r); setOpen(false); setQ(''); }}
              style={{
                padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)',
                background: value?.name === r.name ? 'rgba(56,189,248,0.08)' : 'transparent',
                transition: 'background 0.15s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
              onMouseLeave={e => e.currentTarget.style.background = value?.name === r.name ? 'rgba(56,189,248,0.08)' : 'transparent'}
            >
              <div style={{ color: '#fff', fontSize: 12, fontFamily: 'Inter', fontWeight: 600, marginBottom: 2 }}>{r.name}</div>
              {r.river && <div style={{ color: '#6b7280', fontSize: 10, fontFamily: 'monospace' }}>{r.river}{r.state ? ` · ${r.state}` : ''}</div>}
            </div>
          ))}
        </div>
      </Dropdown>
    </>
  );
}

// ─── Searchable Origin Selector ─────────────────────────────────────────────
function OriginSelector({ value, onChange }) {
  const anchorRef = useRef(null);
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  const search = useCallback(async (query) => {
    if (!query || query.length < 3) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/mission/origins/search?q=' + encodeURIComponent(query));
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } catch { setResults([]); }
    setLoading(false);
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q), 400);
  }, [q, search]);

  useEffect(() => {
    if (open && inputRef.current) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  const handleSelect = async (r) => {
    // If it has an id, resolve coordinates
    if (r.id && !r.lat) {
      try {
        const res = await fetch('/api/mission/origins/resolve?placeId=' + encodeURIComponent(r.id));
        const data = await res.json();
        if (data && data.lat) { onChange(data); setOpen(false); setQ(''); return; }
      } catch { }
    }
    onChange({ ...r, lat: r.lat || 22.8, lng: r.lng || 86.18 });
    setOpen(false); setQ('');
  };

  return (
    <>
      <div
        ref={anchorRef}
        className="config-box"
        onClick={() => setOpen(o => !o)}
        style={{ minWidth: 180, cursor: 'pointer' }}
      >
        <div className="cb-label"><Target size={11} /> ORIGIN BASE</div>
        <div className="cb-val">
          <span style={{ color: value ? '#fff' : '#6b7280', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
            {value ? value.name : 'SELECT ORIGIN'}
          </span>
          <ChevronDown size={13} color="#6b7280" style={{ flexShrink: 0, transition: 'transform 0.18s', transform: open ? 'rotate(180deg)' : '' }} />
        </div>
      </div>
      <Dropdown anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} width={300}>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, padding: '6px 10px' }}>
            <Search size={13} color="#6b7280" />
            <input
              ref={inputRef}
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="City, facility or base name..."
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 12, fontFamily: 'Inter, sans-serif' }}
            />
            {q && <X size={13} color="#6b7280" style={{ cursor: 'pointer' }} onClick={() => setQ('')} />}
          </div>
        </div>
        <div style={{ maxHeight: 240, overflowY: 'auto' }}>
          {loading && <div style={{ padding: '12px 16px', color: '#6b7280', fontFamily: 'monospace', fontSize: 11, textAlign: 'center' }}>Searching...</div>}
          {!loading && results.length === 0 && q.length >= 3 && (
            <div style={{ padding: '12px 16px', color: '#6b7280', fontFamily: 'monospace', fontSize: 11 }}>No results. Using manual fallback.</div>
          )}
          {!loading && q.length < 3 && (
            <div style={{ padding: '12px 16px', color: '#4b5563', fontFamily: 'monospace', fontSize: 10 }}>TYPE TO SEARCH — e.g. Bharuch, Vadodara</div>
          )}
          {results.map((r, i) => (
            <div key={i} onClick={() => handleSelect(r)}
              style={{ padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ color: '#fff', fontSize: 12, fontFamily: 'Inter', fontWeight: 600, marginBottom: 2 }}>{r.name}</div>
              {r.address && <div style={{ color: '#6b7280', fontSize: 10, fontFamily: 'monospace' }}>{r.address}</div>}
            </div>
          ))}
          {!loading && q.length >= 3 && results.length === 0 && (
            <div
              onClick={() => { onChange({ type: 'MANUAL', name: q, lat: 22.8, lng: 86.18 }); setOpen(false); setQ(''); }}
              style={{ padding: '10px 16px', cursor: 'pointer', color: '#38bdf8', fontSize: 11, fontFamily: 'monospace', borderTop: '1px solid rgba(255,255,255,0.06)' }}
            >
              + Use "{q}" as manual origin
            </div>
          )}
        </div>
      </Dropdown>
    </>
  );
}

// ─── Simple Dropdown Selector ────────────────────────────────────────────────
function SimpleSelector({ label, icon: Icon, value, display, options, onChange }) {
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <div ref={anchorRef} className="config-box" onClick={() => setOpen(o => !o)} style={{ cursor: 'pointer', minWidth: 140 }}>
        <div className="cb-label">{Icon && <Icon size={11} />} {label}</div>
        <div className="cb-val">
          <span style={{ fontSize: 13, fontWeight: 600 }}>{display}</span>
          <ChevronDown size={13} color="#6b7280" style={{ flexShrink: 0, transition: 'transform 0.18s', transform: open ? 'rotate(180deg)' : '' }} />
        </div>
      </div>
      <Dropdown anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} width={180}>
        {options.map((opt, i) => (
          <div
            key={i}
            onClick={() => { onChange(opt); setOpen(false); }}
            style={{
              padding: '10px 16px', cursor: 'pointer', fontFamily: 'monospace', fontSize: 11, color: '#fff',
              background: opt.value === value || opt.label === display ? 'rgba(56,189,248,0.1)' : 'transparent',
              borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            onMouseLeave={e => e.currentTarget.style.background = opt.value === value || opt.label === display ? 'rgba(56,189,248,0.1)' : 'transparent'}
          >
            {opt.label}
            {(opt.value === value || opt.label === display) && <Check size={11} color="#38bdf8" />}
          </div>
        ))}
      </Dropdown>
    </>
  );
}

// ─── Generating Stage Tracker ────────────────────────────────────────────────
const GEN_STAGES = [
  'RESOLVING TARGET',
  'RETRIEVING SATELLITE CONTEXT',
  'FINDING EVIDENCE GAPS',
  'BUILDING FIELD CANDIDATES',
  'OPTIMIZING ROUTE',
  'VALIDATING TIME WINDOW',
];

function GeneratingOverlay({ stage }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 200, flexDirection: 'column', gap: 24
    }}>
      <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#38bdf8', letterSpacing: '0.15em', marginBottom: 8 }}>
        DHARAWATCH MISSION ENGINE
      </div>
      {GEN_STAGES.map((s, i) => {
        const done = i < stage;
        const active = i === stage;
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: done || active ? 1 : 0.25, transition: 'opacity 0.3s' }}>
            <div style={{ width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: done ? '#10b981' : active ? 'transparent' : 'rgba(255,255,255,0.05)', border: active ? '2px solid #38bdf8' : done ? 'none' : '1px solid rgba(255,255,255,0.1)' }}>
              {done ? <Check size={10} color="#000" /> : active ? <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#38bdf8', animation: 'pulse 1s ease infinite' }} /> : null}
            </div>
            <span style={{ fontFamily: 'monospace', fontSize: 11, color: done ? '#10b981' : active ? '#fff' : '#4b5563', fontWeight: active ? 700 : 400 }}>{s}</span>
            {done && <span style={{ color: '#10b981', fontSize: 10, fontFamily: 'monospace' }}>✓</span>}
          </div>
        );
      })}
    </div>
  );
}

// ─── Format helpers ───────────────────────────────────────────────────────────
function fmtMin(min) {
  if (!min && min !== 0) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ─── Priority badge ───────────────────────────────────────────────────────────
function PriBadge({ p }) {
  const color = p === 'CRITICAL' ? '#f59e0b' : p === 'HIGH' ? '#38bdf8' : p === 'MED' ? '#a78bfa' : '#6b7280';
  return (
    <span style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 700, padding: '2px 6px', borderRadius: 3, border: `1px solid ${color}`, color, background: `${color}18` }}>
      {p}
    </span>
  );
}

// ─── Score bars ───────────────────────────────────────────────────────────────
function ScoreBars({ score }) {
  const filled = Math.round((score / 100) * 5);
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {[...Array(5)].map((_, i) => (
        <div key={i} style={{ width: 10, height: 4, borderRadius: 2, background: i < filled ? '#38bdf8' : 'rgba(255,255,255,0.1)' }} />
      ))}
    </div>
  );
}

// ─── GPX export helper ────────────────────────────────────────────────────────
function exportGPX(mission, candidates, selectedIds) {
  const stops = selectedIds.map(id => candidates.find(c => c.id === id)).filter(Boolean);
  const date = new Date().toISOString();
  const wpts = stops.map((s, i) => `
  <wpt lat="${s.coords[1]}" lon="${s.coords[0]}">
    <name>STOP ${String(i + 1).padStart(2, '0')} - ${s.title}</name>
    <desc>${s.reason}</desc>
    <type>${s.type || 'OBSERVATION'}</type>
  </wpt>`).join('');

  const rtePoints = stops.map(s => `<rtept lat="${s.coords[1]}" lon="${s.coords[0]}"><name>${s.title}</name></rtept>`).join('');

  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="DHARAWATCH Mission Engine" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>DHARAWATCH Field Mission</name>
    <time>${date}</time>
  </metadata>
  ${wpts}
  <rte>
    <name>DHARAWATCH Mission Route</name>
    ${rtePoints}
  </rte>
</gpx>`;

  const blob = new Blob([gpx], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `dharawatch_mission_${Date.now()}.gpx`; a.click();
  URL.revokeObjectURL(url);
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Mission() {
  const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const { loaded: mapsLoaded, error: mapsError } = useGoogleMaps(googleMapsApiKey);

  const navigate = useNavigate();
  const { setCurrentMission, setCurrentWatershed } = useAppContext();
  const mapContainer = useRef(null);
  const map = useRef(null);
  const markersRef = useRef({});
  const originMarkerRef = useRef(null);
  const routeLayerRef = useRef(null);

  // Form state — typed values
  // A watershed handed over from the Watershed page (active context) becomes the mission target.
  const location = useLocation();
  const [target, setTarget] = useState(() => {
    const w = location.state?.watershed;
    if (!w?.id || !w.centroid) return null;
    return { id: w.id, name: w.name, type: 'WATERSHED_CONTEXT', centroid: { lat: w.centroid.lat, lng: w.centroid.lon ?? w.centroid.lng }, lat: w.centroid.lat, lon: w.centroid.lon ?? w.centroid.lng, areaKm2: w.areaKm2, level: w.level, source: w.source };
  });
  const [origin, setOrigin] = useState(null);
  const [windowOpt, setWindowOpt] = useState(WINDOW_OPTIONS[4]);
  const [budget, setBudget] = useState(6);
  const [transitOpt, setTransitOpt] = useState(TRANSIT_OPTIONS[0]);
  const [formErrors, setFormErrors] = useState({});

  // Mission flow state
  const [missionState, setMissionState] = useState('CONFIG');
  const [genStage, setGenStage] = useState(0);
  const [missionData, setMissionData] = useState(null);
  const [savingState, setSavingState] = useState('');

  // ─── Sync mission to Universal Context Bar ─────────────────────────
  useEffect(() => {
    if (missionData) {
      setCurrentMission({
        id: missionData.id,
        name: missionData.name || missionData.target?.name || 'Mission',
        status: missionData.status,
        target: missionData.target,
        selectedStops: missionData.selectedStops
      });
      if (missionData.target) {
        setCurrentWatershed({
          id: missionData.target.id,
          name: missionData.target.name,
          type: 'MISSION_TARGET'
        });
      }
    }
  }, [missionData, setCurrentMission, setCurrentWatershed]);

  const [candidates, setCandidates] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [activeStopId, setActiveStopId] = useState(null);

  const [activeTab, setActiveTab] = useState('candidate_pool');

  // ─── Saved Missions ──────────────────────────────────────────────
  const [savedMissions, setSavedMissions] = useState([]);
  const [savedMissionsOpen, setSavedMissionsOpen] = useState(false);
  const [loadingMissions, setLoadingMissions] = useState(false);
  const [editingMission, setEditingMission] = useState(null);
  const [missionFormData, setMissionFormData] = useState({});

  // Load saved missions on mount
  useEffect(() => {
    loadSavedMissions();
  }, []);

  const loadSavedMissions = async () => {
    setLoadingMissions(true);
    try {
      const missions = await listMissions();
      setSavedMissions(missions || []);
    } catch (err) {
      console.error('Failed to load missions:', err);
    } finally {
      setLoadingMissions(false);
    }
  };

  const handleSaveMission = async () => {
    if (!missionData) return;
    setSavingState('saving');
    try {
      const missionToSave = {
        ...missionData,
        status: 'DRAFT',
        name: missionFormData.name || missionData.target?.name || 'Mission',
        description: missionFormData.description || '',
        priority: missionFormData.priority || 'MEDIUM',
        selectedStops: selectedIds.map((id, idx) => {
          const c = candidates.find(x => x.id === id);
          return c ? { ...c, sequence: idx + 1 } : null;
        }).filter(Boolean),
        notes: missionFormData.notes || ''
      };
      
      const saved = await createMission(missionToSave);
      setSavingState('saved');
      setTimeout(() => setSavingState(''), 2500);
      await loadSavedMissions();
    } catch (err) {
      setSavingState('error');
      setTimeout(() => setSavingState(''), 2500);
      console.error('Save failed:', err);
    }
  };

  const handleLoadMission = async (mission) => {
    try {
      const fullMission = await getMission(mission.id);
      if (fullMission.stops && fullMission.stops.length > 0) {
        // Rebuild candidates from stops
        const stopsAsCandidates = fullMission.stops.map((s, idx) => ({
          id: s.id,
          title: s.title,
          desc: s.objective,
          coords: [s.lng, s.lat],
          reason: s.objective,
          priority: s.priority,
          type: s.type,
          objective: s.objective,
          score: 100,
          confidence: 0.9,
          sequence: s.sequence
        }));
        setCandidates(stopsAsCandidates);
        setSelectedIds(fullMission.stops.map(s => s.id));
        setActiveStopId(fullMission.stops[0]?.id || null);
      }
      setMissionData(fullMission);
      setMissionFormData({ name: fullMission.name, description: fullMission.description, priority: fullMission.priority, notes: fullMission.notes });
      setMissionState('READY');
      setActiveTab('active_plan');
      
      if (map.current && fullMission.map?.center) {
        map.current.panTo({ lat: fullMission.map.center.lat, lng: fullMission.map.center.lng });
        map.current.setZoom(12);
      }
    } catch (err) {
      console.error('Failed to load mission:', err);
      alert('Failed to load mission: ' + err.message);
    }
  };

  const handleDeleteMission = async (missionId) => {
    if (!window.confirm('Delete this mission?')) return;
    try {
      await deleteMission(missionId);
      await loadSavedMissions();
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  };

  // ─── Mission Form Modal ──────────────────────────────────────────
  const [showMissionForm, setShowMissionForm] = useState(false);
  const [missionFormMode, setMissionFormMode] = useState('create'); // 'create' | 'edit'

  const MissionFormModal = () => {
    const [formData, setFormData] = useState({
      name: missionFormData.name || '',
      description: missionFormData.description || '',
      priority: missionFormData.priority || 'MEDIUM',
      notes: missionFormData.notes || ''
    });

    const handleSubmit = async (e) => {
      e.preventDefault();
      setMissionFormData(formData);
      setShowMissionForm(false);
      await handleSaveMission();
    };

    return (
      <div className="mission-form-overlay" onClick={() => setShowMissionForm(false)}>
        <div className="mission-form-modal" onClick={e => e.stopPropagation()}>
          <div className="mission-form-header">
            <h4>{missionFormMode === 'create' ? 'SAVE MISSION AS NEW' : 'EDIT MISSION'}</h4>
            <button className="mission-form-close" onClick={() => setShowMissionForm(false)}><X size={16} /></button>
          </div>
          <form onSubmit={handleSubmit} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 10, color: '#6b7280', marginBottom: 4 }}>MISSION NAME *</label>
              <input 
                value={formData.name} 
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))} 
                className="int-form-input" 
                placeholder="Mission name"
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10, color: '#6b7280', marginBottom: 4 }}>DESCRIPTION</label>
              <textarea 
                value={formData.description} 
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))} 
                className="int-form-input" 
                rows={3}
                placeholder="Mission description..."
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10, color: '#6b7280', marginBottom: 4 }}>PRIORITY</label>
              <select 
                value={formData.priority} 
                onChange={e => setFormData(prev => ({ ...prev, priority: e.target.value }))} 
                className="int-form-input"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10, color: '#6b7280', marginBottom: 4 }}>NOTES</label>
              <textarea 
                value={formData.notes} 
                onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))} 
                className="int-form-input" 
                rows={3}
                placeholder="Additional notes..."
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="button" className="int-form-btn secondary" onClick={() => setShowMissionForm(false)}>CANCEL</button>
              <button type="submit" className="int-form-btn primary" disabled={!formData.name}>
                {missionFormMode === 'create' ? 'SAVE MISSION' : 'UPDATE MISSION'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const handleStartMission = async () => {
    if (!missionData) return;
    setMissionState('ACTIVE');
    try {
      await updateMission(missionData.id, { 
        status: 'IN_PROGRESS', 
        startedAt: new Date().toISOString() 
      });
    } catch { }
  };

  // Initialize Map
  useEffect(() => {
    if (!map.current && mapContainer.current) {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: {
          version: 8,
          sources: {
            satellite: {
              type: 'raster',
              tiles: ['https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'],
              tileSize: 256,
              attribution: 'Google'
            }
          },
          layers: [{ id: 'satellite-layer', type: 'raster', source: 'satellite', minzoom: 0, maxzoom: 22 }]
        },
        center: [86.18, 22.80],
        zoom: 12,
        attributionControl: false
      });

      map.current.on('load', () => {
        map.current.addSource('route-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.current.addLayer({
          id: 'route-layer',
          type: 'line',
          source: 'route-source',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#38bdf8', 'line-width': 3, 'line-dasharray': [2, 2] }
        });
      });
    }
  }, []);

  // ─── Map markers ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!map.current) return;

    // Clear old markers
    Object.values(markersRef.current).forEach(m => {
      if (m && typeof m.remove === 'function') m.remove();
    });
    markersRef.current = {};

    candidates.forEach((c, idx) => {
      const isSelected = selectedIds.includes(c.id);
      const isActive = activeStopId === c.id;
      const seqNum = selectedIds.indexOf(c.id);

      const el = document.createElement('div');
      el.style.cssText = `
        width:${isActive ? 34 : 28}px;
        height:${isActive ? 34 : 28}px;
        border-radius:6px;
        display:flex;
        align-items:center;
        justify-content:center;
        font-family:monospace;
        font-size:${isActive ? 12 : 10}px;
        font-weight:700;
        cursor:pointer;
        transition:all 0.2s ease;
        border:2px solid ${isActive ? '#fff' : isSelected ? '#10b981' : '#38bdf8'};
        background:${isActive ? '#38bdf8' : isSelected ? '#064e3b' : 'rgba(9,15,28,0.9)'};
        color:${isActive ? '#000' : isSelected ? '#10b981' : '#fff'};
        box-shadow:${isActive ? '0 0 20px rgba(56,189,248,0.8)' : isSelected ? '0 0 10px rgba(16,185,129,0.4)' : '0 4px 12px rgba(0,0,0,0.6)'};
      `;
      el.innerText = isSelected ? String(seqNum + 1).padStart(2, '0') : String(idx + 1).padStart(2, '0');

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        setActiveStopId(c.id);
        map.current.flyTo({ center: [c.coords[0], c.coords[1]], zoom: 15 });
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([c.coords[0], c.coords[1]])
        .addTo(map.current);

      markersRef.current[c.id] = marker;
    });

    // Origin marker
    if (originMarkerRef.current) {
      if (typeof originMarkerRef.current.remove === 'function') originMarkerRef.current.remove();
      originMarkerRef.current = null;
    }
    if (origin && origin.lat && origin.lng) {
      const el = document.createElement('div');
      el.style.cssText = `
        width:32px;height:32px;border-radius:50%;
        background:#f59e0b;border:2px solid #fff;
        display:flex;align-items:center;justify-content:center;
        font-size:14px;
        box-shadow:0 0 16px rgba(245,158,11,0.5);
      `;
      el.innerText = '◎';

      originMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([origin.lng, origin.lat])
        .addTo(map.current);
    }
  }, [candidates, selectedIds, activeStopId, origin, mapsLoaded]);

  // ─── Route update ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!map.current || !map.current.getSource('route-source')) return;

    if ((missionState === 'READY' || missionState === 'ACTIVE') && selectedIds.length > 0) {
      let coords = [];
      if (missionData?.map?.routeGeometry?.length > 0) {
        coords = missionData.map.routeGeometry;
      } else {
        // straight-line fallback
        if (origin) coords.push([origin.lng, origin.lat]);
        selectedIds.forEach(id => {
          const c = candidates.find(x => x.id === id);
          if (c) coords.push([c.coords[0], c.coords[1]]);
        });
        if (origin) coords.push([origin.lng, origin.lat]);
      }
      map.current.getSource('route-source').setData({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: {}
        }]
      });
    } else {
      map.current.getSource('route-source').setData({ type: 'FeatureCollection', features: [] });
    }
  }, [selectedIds, candidates, missionState, missionData, origin]);

  // ─── Generate mission ─────────────────────────────────────────────────────
  const handleGenerate = async () => {
    const errs = {};
    if (!target) errs.target = true;
    if (!origin) errs.origin = true;
    if (Object.keys(errs).length > 0) { setFormErrors(errs); return; }
    setFormErrors({});
    setMissionState('GENERATING');
    setGenStage(0);

    // Animate stages in parallel with real fetch
    const stageTimer = (stage) => new Promise(r => setTimeout(() => { setGenStage(stage); r(); }, stage * 700));

    try {
      const [res] = await Promise.all([
        fetch('/api/mission/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetId: target.id || target.name,
            targetName: target.name,
            targetLat: target.centroid?.lat ?? target.lat,
            targetLon: target.centroid?.lng ?? target.lon,
            origin,
            constraints: {
              durationMinutes: windowOpt.minutes,
              maxStops: budget,
              transitMode: transitOpt.value
            }
          })
        }),
        ...GEN_STAGES.map((_, i) => stageTimer(i))
      ]);

      setGenStage(GEN_STAGES.length); // all done
      const json = await res.json();
      if (!json.mission) throw new Error(json.error || 'No mission returned');

      setMissionData(json.mission);

      const mapped = json.mission.candidates.map((c, idx) => ({
        id: c.id,
        title: c.name,
        desc: c.objective || c.reason,
        coords: [parseFloat(c.lng), parseFloat(c.lat)],
        reason: c.reason,
        priority: c.priority >= 0.9 ? 'CRITICAL' : c.priority >= 0.7 ? 'HIGH' : c.priority >= 0.5 ? 'MED' : 'LOW',
        gap: c.evidence,
        score: c.score || 0,
        confidence: c.confidence,
        type: c.type,
        objective: c.objective,
      }));

      setCandidates(mapped);
      setSelectedIds(json.mission.selectedStops.map(s => s.id));
      setActiveStopId(json.mission.selectedStops[0]?.id || null);
      setMissionState('CANDIDATES');
      setActiveTab('candidate_pool');

      if (map.current && json.mission.map?.center) {
        map.current.panTo({
          lat: json.mission.map.center.lat,
          lng: json.mission.map.center.lng
        });
        map.current.setZoom(12);
      }
    } catch (err) {
      console.error('[Mission] generate error:', err);
      setMissionState('CONFIG');
      alert('Mission generation failed: ' + err.message);
    }
  };

  // ─── Build route ───────────────────────────────────────────────────────────
  const handleBuildRoute = () => {
    if (selectedIds.length === 0) return;
    setMissionState('ROUTING');
    setTimeout(() => {
      setMissionState('READY');
      setActiveTab('active_plan');
      if (map.current) {
        const bounds = new maplibregl.LngLatBounds();
        if (origin) bounds.extend([origin.lng, origin.lat]);
        selectedIds.forEach(id => {
          const c = candidates.find(x => x.id === id);
          if (c) bounds.extend([c.coords[0], c.coords[1]]);
        });
        if (!bounds.isEmpty()) {
          map.current.fitBounds(bounds, { padding: 100 });
        }
      }
    }, 800);
  };

  // ─── Save draft ────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!missionData) return;
    setSavingState('saving');
    try {
      await fetch('/api/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...missionData, status: 'DRAFT' })
      });
      setSavingState('saved');
      setTimeout(() => setSavingState(''), 2500);
    } catch {
      setSavingState('error');
      setTimeout(() => setSavingState(''), 2500);
    }
  };

  // ─── Start mission ─────────────────────────────────────────────────────────
  const handleStart = async () => {
    if (!missionData) return;
    setMissionState('ACTIVE');
    try {
      await fetch('/api/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...missionData, status: 'IN_PROGRESS', startedAt: new Date().toISOString() })
      });
    } catch { }
  };

  // ─── Candidate toggle ──────────────────────────────────────────────────────
  const toggleStop = (id) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= budget) return prev;
      return [...prev, id];
    });
  };

  // ─── Load history ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab === 'history') {
      fetch('/api/missions').then(r => r.json()).then(d => setHistory(Array.isArray(d) ? d : [])).catch(() => { });
    }
  }, [activeTab]);

  // ─── Derived values ────────────────────────────────────────────────────────
  const activeCandidate = candidates.find(c => c.id === activeStopId);
  const isActiveSelected = selectedIds.includes(activeStopId);
  const route = missionData?.route;
  const summary = missionData?.summary;

  let activeModeNum = 1;
  if (missionState === 'GENERATING') activeModeNum = 2;
  if (missionState === 'CANDIDATES' || missionState === 'ROUTING') activeModeNum = 3;
  if (missionState === 'READY') activeModeNum = 4;
  if (missionState === 'ACTIVE') activeModeNum = 5;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="mission-container">
      <AppNavigation />
      <div className="mission-content">
        <div ref={mapContainer} className="mission-map-container" />

        {missionState === 'GENERATING' && <GeneratingOverlay stage={genStage} />}

        <div className="mission-ui-layer">
          {/* ── Top Panel ────────────────────────────────────── */}
          <div className="mission-top-section">
            <div className="mission-header-row">
              <div className="mh-left">
                <div className="mh-brand">DHARAWATCH / FIELD / MISSION INTELLIGENCE</div>
                <div className="mh-title">
                  FIELD / MISSION INTELLIGENCE
                  <span className="mh-status-badge">
                    <span className="mh-status-dot" />
                    ORBITAL GAP ANALYSIS SYNCED
                  </span>
                </div>
              </div>
              <div className="mh-right">
                <div>CONSTELLATION: <span>SENTINEL-2 / SPOT-7</span></div>
                <div className="mh-operator">
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: '#fff', fontWeight: 600 }}>CDR. A. VANCE</div>
                    <div>GEOINT SPEC // T1</div>
                  </div>
                  <Crosshair size={18} color="#9ca3af" />
                </div>
              </div>
            </div>

            <div className="mission-hero-row">
              <div className="mission-hero">
                <h1>PLAN THE NEXT FIELD MISSION.</h1>
                <p>Turn satellite change, evidence gaps and spatial context into a focused, highly optimized field ground-truth plan.</p>
              </div>
              <div className="mission-mode-stepper">
                <div>
                  <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#9ca3af', marginBottom: 6 }}>ACTIVE MODE</div>
                  <div className="mode-steps">
                    {['TARGET', 'ANALYZE', 'PLAN', 'REVIEW', 'EXECUTE'].map((label, idx) => {
                      const step = idx + 1;
                      const active = step === activeModeNum;
                      const completed = step < activeModeNum;
                      return (
                        <div key={step} className={`mode-step${completed ? ' completed' : ''}${active ? ' active' : ''}`}>
                          <div className="ms-num">0{step}</div>
                          <div className="ms-dot" />
                          <div className="ms-label">{label}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <button className="capture-btn" onClick={() => navigate('/field')}>
                  <Camera size={14} /> CAPTURE<br />EVIDENCE
                </button>
              </div>
            </div>

            {/* ── Config strip ── */}
            <div className="mission-config-strip">
              <WatershedSelector value={target} onChange={(t) => { setTarget(t); setMissionData(null); if (missionState !== 'CONFIG') setMissionState('CONFIG'); }} />
              <OriginSelector value={origin} onChange={(o) => { setOrigin(o); setMissionData(null); if (missionState !== 'CONFIG') setMissionState('CONFIG'); }} />

              <SimpleSelector
                label="FIELD WINDOW" icon={Clock}
                value={windowOpt.minutes} display={windowOpt.label}
                options={WINDOW_OPTIONS.map(o => ({ ...o, value: o.minutes }))}
                onChange={(o) => { setWindowOpt(o); if (missionState !== 'CONFIG') setMissionState('CONFIG'); }}
              />
              <SimpleSelector
                label="BUDGET STOPS" icon={MapPin}
                value={budget} display={`${budget} STOPS`}
                options={STOP_OPTIONS.map(n => ({ label: `${n} STOP${n > 1 ? 'S' : ''}`, value: n }))}
                onChange={(o) => { setBudget(o.value); if (missionState !== 'CONFIG') setMissionState('CONFIG'); }}
              />
              <SimpleSelector
                label="TRANSIT TYPE" icon={Car}
                value={transitOpt.value} display={transitOpt.label}
                options={TRANSIT_OPTIONS}
                onChange={(o) => { setTransitOpt(o); if (missionState !== 'CONFIG') setMissionState('CONFIG'); }}
              />

              {(missionState === 'CONFIG' || missionState === 'CANDIDATES' || missionState === 'ROUTING' || missionState === 'READY') && (
                <button className="gen-mission-btn" onClick={handleGenerate} disabled={missionState === 'GENERATING'}>
                  {missionState === 'CONFIG' ? (<>GENERATE MISSION <ArrowRight size={14} /></>) : (<>REPLAN MISSION <ArrowRight size={14} /></>)}
                </button>
              )}
              {missionState === 'ACTIVE' && (
                <div style={{ marginLeft: 'auto', background: 'rgba(16,185,129,0.1)', border: '1px solid #10b981', borderRadius: 6, padding: '8px 16px', fontFamily: 'monospace', fontSize: 11, color: '#10b981', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', animation: 'pulse 1s infinite' }} /> MISSION IN PROGRESS
                </div>
              )}
            </div>
          </div>

          {/* ── Map controls ── */}
          <div className="map-controls">
            <button onClick={() => { if (map.current) map.current.setZoom(map.current.getZoom() + 1); }}><ZoomIn size={16} /></button>
            <button onClick={() => { if (map.current) map.current.setZoom(map.current.getZoom() - 1); }}><ZoomOut size={16} /></button>
            <button onClick={() => {
              if (missionData?.map?.center && map.current) {
                map.current.panTo({ lat: missionData.map.center.lat, lng: missionData.map.center.lng });
                map.current.setZoom(12);
              }
            }}><Maximize size={16} /></button>
          </div>

          {/* ── Middle floating panels ── */}
          <div className="mission-middle-section">

            {/* Synthesis panel */}
            {(missionState === 'READY' || missionState === 'ACTIVE') && missionData && (
              <div className="synthesis-panel">
                <div className="syn-header">
                  <div><Layers size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} /> MISSION SYNTHESIS</div>
                  <div className="syn-badge">AI OPTIMIZED</div>
                </div>

                <div style={{ fontFamily: 'Inter', fontSize: 17, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>
                  {selectedIds.length} HIGH-VALUE STOP{selectedIds.length !== 1 ? 'S' : ''} SELECTED
                </div>
                {budget > selectedIds.length && (
                  <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#6b7280', marginTop: -4 }}>
                    {budget} STOP MAX · {selectedIds.length} SELECTED · {budget - selectedIds.length} SLOTS UNUSED
                  </div>
                )}

                <div style={{ fontFamily: 'Inter', fontSize: 12, color: '#d1d5db', lineHeight: 1.5, background: 'rgba(0,0,0,0.3)', borderRadius: 6, padding: 12 }}>
                  Prioritizes the highest-value unverified changes while keeping the mission inside the {windowOpt.label.toLowerCase()} field window.
                  {summary?.isFeasible === false && (
                    <span style={{ color: '#f59e0b', display: 'block', marginTop: 4 }}> ⚠ Mission exceeds time budget — consider reducing stops.</span>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 6, padding: '8px 12px' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 8, color: '#6b7280', marginBottom: 4 }}>DRIVE DISTANCE</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 15, color: '#38bdf8', fontWeight: 700 }}>
                      <Route size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />{route?.driveDistance || '—'}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 6, padding: '8px 12px' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 8, color: '#6b7280', marginBottom: 4 }}>DRIVE TIME</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 15, color: '#38bdf8', fontWeight: 700 }}>
                      <Timer size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />{fmtMin(route?.driveDurationMinutes)}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 6, padding: '8px 12px' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 8, color: '#6b7280', marginBottom: 4 }}>FIELD TIME</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 15, color: '#10b981', fontWeight: 700 }}>
                      <Footprints size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />{fmtMin(route?.fieldDurationMinutes)}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 6, padding: '8px 12px' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 8, color: '#6b7280', marginBottom: 4 }}>TIME BUFFER</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 15, color: route?.bufferMinutes >= 0 ? '#f59e0b' : '#ef4444', fontWeight: 700 }}>
                      <Shield size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />{fmtMin(Math.max(0, route?.bufferMinutes))}
                    </div>
                  </div>
                </div>

                <div className="syn-footer">
                  <CheckCircle2 size={12} /> Confidence: {summary?.confidence ?? '—'}%
                </div>
              </div>
            )}

            {/* Inspector panel */}
            {activeCandidate && (
              <div className="inspector-panel">
                <div className="insp-header">STOP INSPECTOR</div>
                <div className="insp-title-row">
                  <div className="insp-title" style={{ fontSize: 16 }}>
                    {activeCandidate.title}
                  </div>
                  <PriBadge p={activeCandidate.priority} />
                </div>

                <div className="insp-why">
                  <div className="iw-title">WHY VISIT? <ShieldCheck size={12} /></div>
                  <div className="iw-desc">{activeCandidate.reason}</div>
                  {activeCandidate.gap && <div className="iw-sub" style={{ marginTop: 4 }}>Evidence: {activeCandidate.gap}</div>}
                </div>

                <div className="insp-context">
                  <div className="ic-row">
                    <div className="ic-label">TYPE:</div>
                    <div className="ic-val">{activeCandidate.type?.replace('_', ' ')}</div>
                  </div>
                  <div className="ic-row">
                    <div className="ic-label">CONFIDENCE:</div>
                    <div className="ic-val">{activeCandidate.confidence != null ? `${Math.round(activeCandidate.confidence * 100)}%` : '—'}</div>
                  </div>
                  <div className="ic-row">
                    <div className="ic-label">COORDINATES:</div>
                    <div className="ic-val" style={{ fontSize: 9, color: '#6b7280' }}>
                      {activeCandidate.coords[1].toFixed(4)}, {activeCandidate.coords[0].toFixed(4)}
                    </div>
                  </div>
                </div>

                <div className="insp-value-decomp">
                  <div className="ivd-title">EVIDENCE SCORE</div>
                  <div className="ivd-row">
                    <div className="ivd-label">RAW SCORE</div>
                    <ScoreBars score={activeCandidate.score} />
                    <div className="ivd-val">{Math.round(activeCandidate.score)}</div>
                  </div>
                  <div className="ivd-row">
                    <div className="ivd-label">CONFIDENCE</div>
                    <ScoreBars score={(activeCandidate.confidence || 0) * 100} />
                    <div className="ivd-val">{Math.round((activeCandidate.confidence || 0) * 100)}%</div>
                  </div>
                </div>

                <div className="insp-actions">
                  <button
                    className={`insp-btn${isActiveSelected ? ' remove' : ''}`}
                    onClick={() => toggleStop(activeCandidate.id)}
                  >
                    {isActiveSelected ? 'REMOVE FROM PLAN' : 'ADD TO PLAN'}
                  </button>
                  <button className="insp-btn secondary" onClick={() => navigate('/compare')}>
                    <Layers size={13} /> VIEW SATELLITE CONTEXT
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Bottom dock ── */}
          {missionState !== 'CONFIG' && missionState !== 'GENERATING' && (
            <div className="mission-bottom-strip">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="mb-tabs">
                  <div className={`mb-tab${activeTab === 'active_plan' ? ' active' : ''}`} onClick={() => setActiveTab('active_plan')}>
                    <span style={{ color: '#38bdf8' }}>●</span> Active Plan ({selectedIds.length}/{budget} Stops)
                  </div>
                  <div className={`mb-tab${activeTab === 'candidate_pool' ? ' active' : ''}`} onClick={() => setActiveTab('candidate_pool')}>
                    Candidate Pool ({candidates.length} Sites)
                  </div>
                  <div className={`mb-tab${activeTab === 'history' ? ' active' : ''}`} onClick={() => setActiveTab('history')}>
                    <Clock size={11} /> Mission History
                    {history.length > 0 && <span style={{ marginLeft: 4, background: 'rgba(56,189,248,0.2)', borderRadius: 8, padding: '1px 5px', fontSize: 9 }}>{history.length}</span>}
                  </div>
                </div>
                {/* Actions */}
                {(missionState === 'READY' || missionState === 'ACTIVE' || missionState === 'CANDIDATES') && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button
                      className="mbs-btn"
                      onClick={() => exportGPX(missionData, candidates, selectedIds)}
                      disabled={selectedIds.length === 0}
                    >
                      <Download size={13} /> Export GPX
                    </button>
                    
                    {/* Saved Missions Dropdown */}
                    <div style={{ position: 'relative' }}>
                      <button className="mbs-btn" onClick={() => setSavedMissionsOpen(!savedMissionsOpen)}>
                        <Save size={13} /> MISSIONS ({savedMissions.length})
                      </button>
                      {savedMissionsOpen && (
                        <div className="mbs-dropdown" style={{ 
                          position: 'absolute', bottom: '100%', right: 0, marginBottom: 8,
                          minWidth: 320, maxHeight: 300, overflowY: 'auto',
                          background: 'rgba(9,11,15,0.97)', backdropFilter: 'blur(20px)',
                          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
                          boxShadow: '0 8px 32px rgba(0,0,0,0.6)', zIndex: 1000
                        }}>
                          {loadingMissions && <div style={{ padding: 12, textAlign: 'center', color: '#6b7280', fontFamily: 'monospace', fontSize: 11 }}>Loading…</div>}
                          {!loadingMissions && savedMissions.length === 0 && <div style={{ padding: 12, color: '#6b7280', fontFamily: 'monospace', fontSize: 11 }}>No saved missions</div>}
                          {!loadingMissions && savedMissions.map(m => (
                            <div key={m.id} style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}
                              onClick={() => { handleLoadMission(m); setSavedMissionsOpen(false); }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: 12, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {m.name || m.target?.name || 'Unnamed Mission'}
                                </div>
                                <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>
                                  {m.target?.name} · {m.selectedStops?.length || 0} stops · {m.route?.driveDistance || '—'}
                                </div>
                                <div style={{ fontSize: 9, color: '#4b5563', marginTop: 2, fontFamily: 'monospace' }}>
                                  {m.timestamps?.generatedAt ? new Date(m.timestamps.generatedAt).toLocaleDateString() : ''} · {m.status}
                                </div>
                              </div>
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleDeleteMission(m.id); }} 
                                style={{ color: '#6b7280', marginLeft: 8 }}
                              >
                                <Trash2 size={10} />
                              </button>
                            </div>
                          </div>
                          ))}
                          <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                            <button 
                              className="mbs-btn" 
                              style={{ width: '100%', justifyContent: 'center' }}
                              onClick={() => { setMissionFormData({ name: '', description: '', priority: 'MEDIUM', notes: '' }); setMissionFormMode('create'); setShowMissionForm(true); setSavedMissionsOpen(false); }}
                            >
                              <Plus size={12} /> SAVE CURRENT AS NEW
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {missionState === 'CANDIDATES' && (
                      <button className="mbs-btn primary" onClick={handleBuildRoute} disabled={selectedIds.length === 0}>
                        <Route size={13} /> BUILD ROUTE
                      </button>
                    )}
                    {(missionState === 'READY') && (
                      <button className="mbs-btn primary" onClick={handleStart}>
                        <Play size={13} fill="currentColor" /> START ACTIVE MISSION
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Candidate pool tab */}
              {activeTab === 'candidate_pool' && (
                <div className="ms-cards-row">
                  {candidates.length === 0 && (
                    <div style={{ color: '#6b7280', fontFamily: 'monospace', fontSize: 11, padding: '8px 0' }}>No candidates generated yet.</div>
                  )}
                  {candidates.map((c, idx) => {
                    const sel = selectedIds.includes(c.id);
                    const act = activeStopId === c.id;
                    return (
                      <div
                        key={c.id}
                        className={`msc-card${act ? ' active' : ''}`}
                        style={{ border: sel ? '1px solid rgba(16,185,129,0.4)' : undefined, background: sel ? 'rgba(16,185,129,0.06)' : undefined }}
                        onClick={() => { setActiveStopId(c.id); map.current?.panTo({ lat: c.coords[1], lng: c.coords[0] }); map.current?.setZoom(15); }}
                      >
                        <div className="msc-header">
                          <span>SITE {String(idx + 1).padStart(2, '0')}</span>
                          <PriBadge p={c.priority} />
                        </div>
                        <div className="msc-title">{c.title}</div>
                        <div className="msc-desc">{c.gap || c.reason}</div>
                        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <ScoreBars score={c.score} />
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleStop(c.id); }}
                            style={{
                              fontSize: 9, fontFamily: 'monospace', padding: '3px 8px', borderRadius: 3, cursor: 'pointer',
                              border: sel ? '1px solid #ef4444' : '1px solid #10b981',
                              color: sel ? '#ef4444' : '#10b981',
                              background: 'transparent', transition: 'all 0.15s'
                            }}
                          >
                            {sel ? 'REMOVE' : 'ADD'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Active plan tab */}
              {activeTab === 'active_plan' && (
                <div className="ms-cards-row">
                  {selectedIds.length === 0 && (
                    <div style={{ color: '#6b7280', fontFamily: 'monospace', fontSize: 11, padding: '8px 0' }}>No stops in plan. Select candidates from the pool.</div>
                  )}
                  {selectedIds.map((id, idx) => {
                    const c = candidates.find(x => x.id === id);
                    if (!c) return null;
                    const act = activeStopId === id;
                    const isFirst = missionState === 'ACTIVE' && idx === 0;
                    return (
                      <div
                        key={id}
                        className={`msc-card${act ? ' active' : ''}`}
                        onClick={() => { setActiveStopId(id); map.current?.panTo({ lat: c.coords[1], lng: c.coords[0] }); map.current?.setZoom(15); }}
                      >
                        <div className="msc-header">
                          <span>STOP {String(idx + 1).padStart(2, '0')}</span>
                          <span style={{ color: isFirst ? '#10b981' : '#38bdf8', fontSize: 9, fontFamily: 'monospace', fontWeight: 700 }}>
                            {isFirst ? 'ACTIVE' : 'PLANNED'}
                          </span>
                        </div>
                        <div className="msc-title">{c.title}</div>
                        <div className="msc-desc">{c.objective || c.reason}</div>
                        {route?.fieldDurationMinutes && (
                          <div style={{ marginTop: 6, fontSize: 9, fontFamily: 'monospace', color: '#6b7280' }}>
                            ~{Math.round(route.fieldDurationMinutes / selectedIds.length)} min field time
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* History tab */}
              {activeTab === 'history' && (
                <div className="ms-cards-row">
                  {history.length === 0 && (
                    <div style={{ color: '#6b7280', fontFamily: 'monospace', fontSize: 11, padding: '8px 0' }}>No saved missions yet.</div>
                  )}
                  {history.slice(0, 10).map((m, i) => (
                    <div key={m.id || i} className="msc-card">
                      <div className="msc-header">
                        <span>{m.id?.slice(0, 12)?.toUpperCase()}</span>
                        <span style={{ color: '#6b7280' }}>{m.status}</span>
                      </div>
                      <div className="msc-title">{m.target?.name || 'Mission'}</div>
                      <div className="msc-desc">{m.selectedStops?.length || 0} stops · {m.route?.driveDistance || '?'}</div>
                      <div style={{ marginTop: 4, fontSize: 9, color: '#4b5563', fontFamily: 'monospace' }}>
                        {m.timestamps?.generatedAt ? new Date(m.timestamps.generatedAt).toLocaleDateString() : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      {showMissionForm && <MissionFormModal />}
    </div>
  );
}
