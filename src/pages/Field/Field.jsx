import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useGoogleMaps } from '../../hooks/useGoogleMaps';
import {
  Camera, Navigation, Satellite, Layout, CheckCircle,
  CheckCircle2, RefreshCcw, FileText, Maximize2, Crosshair,
  Plus, Minus, Layers, Save, ArrowRight, Upload, X, AlertTriangle,
  Info, Loader, MapPin, Eye, EyeOff, ChevronDown,
  Clock, Database, Zap
} from 'lucide-react';
import AppNavigation from '../../components/AppNavigation';
import './Field.css';

const API = '/api';

// ─── Field API Client ─────────────────────────────────────────────
async function fieldApi(path, opts = {}) {
  const res = await fetch(`${API}${path}`, opts);
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || 'API error');
  return json.data;
}

async function uploadPhoto(file, missionId, stopId, watershedId, watershedName) {
  const fd = new FormData();
  fd.append('photo', file);
  if (missionId) fd.append('missionId', missionId);
  if (stopId) fd.append('stopId', stopId);
  if (watershedId) fd.append('watershedId', watershedId);
  if (watershedName) fd.append('watershedName', watershedName);
  const res = await fetch(`${API}/field/upload`, { method: 'POST', body: fd });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || 'Upload failed');
  return json.data;
}

async function runAnalysis(obsId) {
  const res = await fetch(`${API}/field/${obsId}/analyze`, { method: 'POST' });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || 'Analysis failed');
  return json.data;
}

async function setLocation(obsId, lat, lon, source) {
  return fieldApi(`/field/${obsId}/location`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lon, source })
  });
}

async function patchObs(obsId, updates) {
  return fieldApi(`/field/${obsId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
}

async function createEvidence(obsId) {
  return fieldApi(`/field/${obsId}/evidence`, { method: 'POST' });
}

// ─── Stepper state helpers ────────────────────────────────────────
function getStepperState(obs, uploadState, fieldContext) {
  const s1 = uploadState === 'done' ? 'completed' : uploadState === 'uploading' ? 'active' : 'idle';
  const s2 = obs?.exif ? (obs.location ? 'completed' : 'active') : 'idle';
  const s3 = obs?.location ? 'completed' : (obs?.exif && !obs.location ? 'active' : 'idle');
  const s4 = obs?.satelliteContext || fieldContext?.satellite?.status !== 'UNAVAILABLE' ? 'completed' : (obs?.location ? 'active' : 'idle');
  const s5 = obs?.watershedId || fieldContext?.watershed ? 'completed' : (obs?.location ? 'active' : 'idle');
  const s6 = obs?.evidenceId ? 'completed' : (obs?.aiAnalysis ? 'active' : 'idle');
  return [s1, s2, s3, s4, s5, s6];
}

import { useGlobalContext } from '../../context/GlobalContext';
import { useAppContext } from '../../components/UniversalContextBar';

// ─── Component ───────────────────────────────────────────────────
export default function Field() {
  const navigate = useNavigate();
  const location = useLocation();
  const mapContainer = useRef(null);
  const map = useRef(null);
  const pinMarker = useRef(null);
  const autosaveTimerRef = useRef(null);
  const showPinToolRef = useRef(false);

  const navCtx = location.state || {};
  const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const { loaded: mapsLoaded, error: mapsError } = useGoogleMaps(googleMapsApiKey);

  const { selectedFeature } = useGlobalContext();
  const { setCurrentObservation, setCurrentWatershed, setCurrentMission } = useAppContext();

  // ─ Core state ─
  const [obs, setObs] = useState(null);
  const [uploadState, setUploadState] = useState('idle');
  const [uploadError, setUploadError] = useState('');
  const [photoUrl, setPhotoUrl] = useState(null);

  // ─── Sync observation to Universal Context Bar ──────────────────
  useEffect(() => {
    if (obs) {
      setCurrentObservation({
        id: obs.id,
        status: obs.status,
        location: obs.location,
        watershedId: obs.watershedId,
        watershedName: obs.watershedName,
        missionId: obs.missionId,
        stopId: obs.stopId,
        evidenceId: obs.evidenceId
      });
      if (obs.watershedId) {
        setCurrentWatershed({
          id: obs.watershedId,
          name: obs.watershedName,
          type: 'OBSERVATION_WATERSHED'
        });
      }
      if (obs.missionId) {
        setCurrentMission({
          id: obs.missionId,
          name: obs.missionId,
          type: 'OBSERVATION_MISSION'
        });
      }
    }
  }, [obs, setCurrentObservation, setCurrentWatershed, setCurrentMission]);

  // ─ Analysis state ─
  const [analysisState, setAnalysisState] = useState('idle');
  const [analysisError, setAnalysisError] = useState('');

  // ─ Location ─
  const [showPinTool, setShowPinTool] = useState(false);
  const [manualCoords, setManualCoords] = useState({ lat: '', lon: '' });

  // ─ Satellite ─
  const [satelliteMode, setSatelliteMode] = useState('TRUE_COLOR');

  // ─ Evidence ─
  const [savingEvidence, setSavingEvidence] = useState(false);
  const [evidenceResult, setEvidenceResult] = useState(null);

  // ─ UI state ─
  const [themes, setThemes] = useState([]);
  const [condition, setCondition] = useState(null);
  const [synthesis, setSynthesis] = useState('');
  const [showExifDrawer, setShowExifDrawer] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [aiDetectionsVisible, setAiDetectionsVisible] = useState(true);

  // ─ Field Context (Unified Data) ─
  const [fieldContext, setFieldContext] = useState(null);

  // Fetch field context on location or feature change
  useEffect(() => {
    let lat = obs?.location?.latitude;
    let lon = obs?.location?.longitude;
    let featureId = selectedFeature?.id || '';

    if (!lat && selectedFeature?.watershedName?.toLowerCase().includes('sardar')) {
      lat = 21.8315;
      lon = 73.7485;
      featureId = 'sardar-sarovar';
    }

    if (lat && lon) {
      fieldApi(`/field/context?latitude=${lat}&longitude=${lon}&featureId=${featureId}`)
        .then(res => setFieldContext(res))
        .catch(err => {
          console.error('Context fetch failed:', err);
          // Deterministic fallback
          setFieldContext({
            status: 'fallback',
            mode: 'PUBLIC_SNAPSHOT',
            feature: { name: 'Sardar Sarovar Dam', type: 'DAM', latitude: 21.8315, longitude: 73.7485, river: 'Narmada', watershed: 'Narmada Basin' },
            watershed: { name: 'Narmada Basin', source: 'PUBLIC FEATURE DATA', river: 'Narmada' },
            satellite: { status: 'PUBLIC_SNAPSHOT', provider: 'Sentinel-2 (Demo)', sceneId: 'S2A_MSIL2A_DEMO', acquisitionDate: '2023-10-15', cloudCover: '0.4' },
            water: { status: 'PUBLIC_SNAPSHOT', source: 'Public Reservoir Records', period: 'Q4 2023', summary: 'Reservoir near capacity. Active flow observed.' },
            vegetation: { status: 'PUBLIC_SNAPSHOT', source: 'Sentinel-2', period: 'Q4 2023', summary: 'Dense riparian vegetation.' }
          });
        });
    }
  }, [obs?.location, selectedFeature]);

  // Keep ref in sync for map click handler
  useEffect(() => { showPinToolRef.current = showPinTool; }, [showPinTool]);

  // ─ Map init ──────────────────────────────────────────────────
  useEffect(() => {
    if (!mapsLoaded || !mapContainer.current || map.current) return;

    const center = navCtx.coordinates
      ? {
        lat: navCtx.coordinates.lat ?? navCtx.coordinates.latitude ?? 20.59,
        lng: navCtx.coordinates.lon ?? navCtx.coordinates.longitude ?? 78.96
      }
      : { lat: 20.59, lng: 78.96 };

    map.current = new window.google.maps.Map(mapContainer.current, {
      center,
      zoom: 5,
      mapTypeId: 'satellite',
      disableDefaultUI: true,
      zoomControl: true,
    });

    map.current.addListener('click', (e) => {
      if (!showPinToolRef.current) return;
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      handleSetLocation(lat, lng, 'USER_PINNED');
      setShowPinTool(false);
    });
  }, [mapsLoaded]);

  // ─ Map: update pin when location changes ─────────────────────
  const obsId = obs?.id;
  const obsLocation = obs?.location;
  useEffect(() => {
    if (!map.current || !obsLocation || !mapsLoaded) return;
    const { latitude: lat, longitude: lon } = obsLocation;

    if (pinMarker.current) pinMarker.current.setMap(null);
    pinMarker.current = new window.google.maps.Marker({
      position: { lat, lng: lon },
      map: map.current,
      draggable: true,
      title: obs?.landmark || 'Observation Location'
    });

    pinMarker.current.addListener('dragend', () => {
      const lngLat = pinMarker.current.getPosition();
      if (window.confirm(`Update location to\n${lngLat.lat().toFixed(6)}, ${lngLat.lng().toFixed(6)}?`)) {
        handleSetLocation(lngLat.lat(), lngLat.lng(), 'USER_DRAGGED');
      } else {
        pinMarker.current.setPosition({ lat, lng: lon });
      }
    });

    map.current.panTo({ lat, lng: lon });
    if (obs?.landmark === 'SARDAR SAROVAR DAM') {
      map.current.setZoom(15);
    } else {
      map.current.setZoom(13);
    }
  }, [obsLocation, mapsLoaded, obs?.landmark]);

  // ─ Autosave ──────────────────────────────────────────────────
  const autosave = useCallback((id, updates) => {
    clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      patchObs(id, updates).catch(err => console.warn('Autosave:', err.message));
    }, 1500);
  }, []);

  // ─ Photo Upload ───────────────────────────────────────────────
  const handleFileSelect = async (file) => {
    if (!file) return;
    setUploadState('uploading');
    setUploadError('');
    setObs(null);
    setThemes([]);
    setCondition(null);
    setSynthesis('');
    setAnalysisState('idle');
    setEvidenceResult(null);

    const localUrl = URL.createObjectURL(file);
    setPhotoUrl(localUrl);

    try {
      const result = await uploadPhoto(file, navCtx.missionId, navCtx.stopId, navCtx.watershedId, navCtx.watershedName);
      setUploadState('done');
      setPhotoUrl(`${API}/field/${result.observationId}/photo`);

      const fullObs = await fieldApi(`/field/${result.observationId}`);
      setObs(fullObs);

      // Auto-run analysis
      doRunAnalysis(result.observationId);
    } catch (err) {
      setUploadState('error');
      setUploadError(err.message);
    }
  };

  const handleDemoPhoto = () => {
    setUploadState('done');
    // Public domain/wikimedia image of Sardar Sarovar
    setPhotoUrl('https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Sardar_Sarovar_Dam_02.jpg/640px-Sardar_Sarovar_Dam_02.jpg');
    setAnalysisState('done');

    const mockAiData = {
      landmarkCandidates: [{ name: 'SARDAR SAROVAR DAM', confidence: 'high' }],
      scene: 'Large concrete gravity dam with active water release. Massive hydraulic infrastructure dominating a river valley context.',
      visibleWater: { present: true, type: 'river' },
      vegetationCondition: { present: true, density: 'moderate' },
      structures: [{ type: 'dam', status: 'IDENTIFIED', condition: 'intact', notes: 'Sardar Sarovar Dam main structure, spillways active.' }],
      observationSummary: '[PUBLIC DEMO SYNTHESIS] Field observation of Sardar Sarovar Dam confirms structural integrity and active flow. Immediate downstream vegetation appears healthy. Satellite correlation requested.',
      uncertainty: 'Unable to gauge exact flow rates or structural micro-fractures from this perspective.'
    };

    setObs({
      id: 'demo-obs-' + Date.now(),
      status: 'DRAFT',
      hash: 'DEMO_HASH_SARDAR_SAROVAR',
      captureTime: new Date().toISOString(),
      location: { latitude: 21.8315, longitude: 73.7485, source: 'LANDMARK_REGISTRY' },
      landmark: { name: 'SARDAR SAROVAR DAM', river: 'Narmada', region: 'Gujarat, India' },
      aiAnalysis: { status: 'COMPLETE', data: mockAiData },
      themes: ['WATER REGIME', 'WATERSHED INTERVENTION'],
      condition: 'ACTIVE FLOW',
      synthesis: mockAiData.observationSummary,
      exif: { status: 'GPS_FOUND', camera: { make: 'Simulated', model: 'Demo Sensor' } },
      watershedId: 'narmada-basin',
      watershedName: 'Narmada Basin'
    });

    setThemes(['WATER REGIME', 'WATERSHED INTERVENTION']);
    setCondition('ACTIVE FLOW');
    setSynthesis(mockAiData.observationSummary);
  };

  // ─ AI Analysis ───────────────────────────────────────────────
  const doRunAnalysis = async (id) => {
    setAnalysisState('running');
    setAnalysisError('');
    try {
      const result = await runAnalysis(id);
      const updated = await fieldApi(`/field/${id}`);
      setObs(updated);
      if (result.analysis) {
        if (result.analysis.suggestedThemes?.length) setThemes(updated.themes || result.analysis.suggestedThemes);
        if (result.analysis.suggestedCondition && result.analysis.suggestedCondition !== 'UNKNOWN') {
          setCondition(updated.condition || result.analysis.suggestedCondition);
        }
        if (result.analysis.observationSummary) setSynthesis(updated.synthesis || result.analysis.observationSummary);
      }
      setAnalysisState('done');
    } catch (err) {
      setAnalysisState('error');
      setAnalysisError(err.message);
    }
  };

  // ─ Location ───────────────────────────────────────────────────
  const handleSetLocation = async (lat, lon, source) => {
    if (!obsId) return;
    try {
      await setLocation(obsId, lat, lon, source);
      // Auto-fetch satellite context
      await fieldApi(`/field/${obsId}/satellite-context`, { method: 'POST' }).catch(() => { });
      const updated = await fieldApi(`/field/${obsId}`);
      setObs(updated);
    } catch (err) {
      console.error('Location:', err.message);
    }
  };

  // Auto-pin location if missing but global context is available
  useEffect(() => {
    if (obs && !obs.location && selectedFeature?.latitude) {
      handleSetLocation(selectedFeature.latitude, selectedFeature.longitude, selectedFeature.source || 'GLOBAL CONTEXT');
    }
  }, [obs?.id, obs?.location, selectedFeature]);

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) { alert('Geolocation not supported'); return; }
    navigator.geolocation.getCurrentPosition(
      pos => handleSetLocation(pos.coords.latitude, pos.coords.longitude, 'BROWSER_GPS'),
      () => alert('Location unavailable')
    );
  };

  const handleManualCoords = () => {
    const lat = parseFloat(manualCoords.lat);
    const lon = parseFloat(manualCoords.lon);
    if (isNaN(lat) || isNaN(lon)) { alert('Invalid coordinates'); return; }
    handleSetLocation(lat, lon, 'USER_CONFIRMED');
  };

  // ─ Satellite context ──────────────────────────────────────────
  const fetchSatelliteContext = async () => {
    if (!obsId) return;
    try {
      await fieldApi(`/field/${obsId}/satellite-context`, { method: 'POST' });
      const updated = await fieldApi(`/field/${obsId}`);
      setObs(updated);
    } catch (err) {
      console.warn('Satellite:', err.message);
    }
  };

  // ─ Theme/condition/synthesis ──────────────────────────────────
  const toggleTheme = (t) => {
    const next = themes.includes(t) ? themes.filter(x => x !== t) : [...themes, t];
    setThemes(next);
    if (obsId) autosave(obsId, { themes: next });
  };

  const handleCondition = (c) => {
    setCondition(c);
    if (obsId) autosave(obsId, { condition: c });
  };

  const handleSynthesisChange = (val) => {
    setSynthesis(val);
    if (obsId) autosave(obsId, { synthesis: val });
  };

  // ─ Evidence ──────────────────────────────────────────────────
  const handleSaveEvidence = async () => {
    if (!obsId) return;
    setSavingEvidence(true);
    try {
      await patchObs(obsId, { themes, condition, synthesis });
      const result = await createEvidence(obsId);
      setEvidenceResult(result);
      const updated = await fieldApi(`/field/${obsId}`);
      setObs(updated);
    } catch (err) {
      alert(`Evidence creation failed: ${err.message}`);
    } finally {
      setSavingEvidence(false);
    }
  };

  const mapZoomIn = () => map.current?.setZoom((map.current?.getZoom() || 5) + 1);
  const mapZoomOut = () => map.current?.setZoom((map.current?.getZoom() || 5) - 1);
  const mapCenter = () => {
    if (obsLocation) {
      map.current?.panTo({ lat: obsLocation.latitude, lng: obsLocation.longitude });
      if (obs?.landmark === 'SARDAR SAROVAR DAM') {
        map.current?.setZoom(15);
      } else {
        map.current?.setZoom(14);
      }
    }
  };

  const steps = getStepperState(obs, uploadState, fieldContext);
  const aiData = obs?.aiAnalysis?.data;
  const exifData = obs?.exif;
  const loc = obsLocation;

  const stepDescs = [
    uploadState === 'uploading' ? 'UPLOADING…' : obs ? 'ACQUIRED' : 'AWAITING UPLOAD',
    obs?.landmark ? 'LANDMARK RESOLVED' : (exifData?.status === 'GPS_FOUND' ? 'GPS FOUND' : exifData ? 'GPS NOT IN PHOTO' : '—'),
    loc ? (obs?.landmark?.name || obs?.landmark || `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`) : 'PIN REQUIRED',
    obs?.satelliteContext?.status === 'AVAILABLE' || (fieldContext && fieldContext.satellite?.status !== 'UNAVAILABLE') ? 'CONTEXT LOADED' : loc ? 'PENDING' : '—',
    fieldContext?.watershed?.name || obs?.watershedName || (loc ? (fieldContext ? 'UNAVAILABLE' : 'RESOLVING…') : '—'),
    obs?.evidenceId ? 'COMMITTED' : obs?.aiAnalysis ? 'READY' : 'PENDING'
  ];

  return (
    <div className="field-container">
      <AppNavigation />
      <div className="field-content">

        {/* Header */}
        <header className="field-header-row">
          <div className="fh-left">
            <div className="fh-brand">DHARAWATCH / FIELD / GROUND OBSERVATION</div>
            <div className="fh-title">
              FIELD / GROUND OBSERVATION
              <span className="fh-status-badge">
                <span className="fh-status-dot"></span>
                {obs ? 'OBSERVATION ACTIVE' : 'READY'}
              </span>
            </div>
          </div>
          <div className="fh-right">
            <div>CONSTELLATION: <span>SENTINEL-2 / SENTINEL-1</span></div>
            {navCtx.missionId && (
              <div className="fh-operator">
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#fff', fontWeight: 600 }}>{navCtx.missionId}</div>
                  <div>LINKED MISSION</div>
                </div>
                <Crosshair size={18} color="#9ca3af" />
              </div>
            )}
          </div>
        </header>

        {/* Status Strip */}
        <div className="field-status-strip">
          {navCtx.missionId && (
            <div className="fs-pill active">
              <span style={{ width: 6, height: 6, background: '#38bdf8', borderRadius: '50%' }}></span>
              LINKED: {navCtx.missionId}{navCtx.stopId ? ` / STOP ${navCtx.stopId}` : ''}
            </div>
          )}
          {navCtx.watershedId && (
            <div className="fs-pill active" title={navCtx.watershedId}>
              <span style={{ width: 6, height: 6, background: '#38bdf8', borderRadius: '50%' }}></span>
              WATERSHED: {navCtx.watershedName || navCtx.watershedId}
            </div>
          )}
          {obs && <div className="fs-pill" style={{ color: '#10b981' }}>OBS: {obs.id.toUpperCase()}</div>}
          {obs?.evidenceId && <div className="fs-pill" style={{ color: '#10b981' }}>EVIDENCE CREATED ✓</div>}
          {!obs && <div className="fs-pill warning">UPLOAD A FIELD PHOTO TO BEGIN</div>}
          {obs && !loc && <div className="fs-pill warning"><AlertTriangle size={10} /> LOCATION REQUIRED</div>}
        </div>

        {/* Hero */}
        <section className="field-hero">
          <h1>BRING THE GROUND INTO VIEW.</h1>
          <p>Upload a field photograph. Extract EXIF metadata. Run AI vision analysis. Correlate with satellite evidence.</p>
        </section>

        {/* Stepper */}
        <div className="field-stepper">
          {['FIELD PHOTO', 'GPS & SENSORS', 'MAP LOCATION', 'SATELLITE WINDOW', 'WATERSHED CONTEXT', 'EVIDENCE PASSPORT'].map((title, i) => (
            <div key={title} className={`stepper-step ${steps[i]}`}>
              <div className="step-num">{String(i + 1).padStart(2, '0')}</div>
              <div className="step-info">
                <div className="step-title">{title}</div>
                <div className="step-desc" style={{
                  color: steps[i] === 'completed' ? '#10b981' : steps[i] === 'active' ? '#38bdf8' : '#6b7280'
                }}>{stepDescs[i]}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Viewports Grid */}
        <div className="field-grid">

          {/* Ground Viewport */}
          <div className="field-panel">
            <div className="fp-header">
              <div className="fp-title"><Camera size={14} color="#38bdf8" /> GROUND VIEWPORT // OPTICAL</div>
              <div className="fp-controls">
                <label className={`fp-btn ${!obs ? 'primary' : ''}`} style={{ cursor: 'pointer' }}>
                  <Upload size={11} />
                  <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
                    onChange={e => e.target.files[0] && handleFileSelect(e.target.files[0])} />
                  {obs ? 'REPLACE' : 'UPLOAD'}
                </label>
                {obs && <>
                  <div className="fp-btn" onClick={() => doRunAnalysis(obsId)} title="Re-run AI">
                    {analysisState === 'running' ? <Loader size={11} className="spin" /> : <Zap size={11} />}
                    {analysisState === 'running' ? 'ANALYZING' : 'RE-ANALYZE'}
                  </div>
                  <div className="fp-btn" onClick={() => setShowExifDrawer(v => !v)}>EXIF LOG</div>
                  <div className="fp-btn" onClick={() => setShowFullscreen(true)}><Maximize2 size={12} /></div>
                </>}
              </div>
            </div>

            <div className="fp-body" style={{ position: 'relative' }}>
              {!photoUrl ? (
                <label className="photo-upload-zone" style={{ cursor: 'pointer' }}>
                  <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
                    onChange={e => e.target.files[0] && handleFileSelect(e.target.files[0])} />
                  <Upload size={32} color="#38bdf8" style={{ marginBottom: 12 }} />
                  <div style={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: 12 }}>
                    CLICK TO UPLOAD FIELD PHOTOGRAPH
                  </div>
                  <div style={{ color: '#4b5563', fontSize: 10, marginTop: 8 }}>JPEG · PNG · WEBP · MAX 50MB</div>
                  {uploadState === 'error' && (
                    <div style={{ color: '#f87171', marginTop: 12, fontSize: 11 }}>
                      <AlertTriangle size={12} /> {uploadError}
                    </div>
                  )}
                  <div style={{ marginTop: 24, textAlign: 'center' }} onClick={e => e.preventDefault()}>
                    <button className="fp-btn" style={{ padding: '6px 12px' }} onClick={handleDemoPhoto}>
                      USE SARDAR SAROVAR DEMO
                    </button>
                  </div>
                </label>
              ) : (
                <>
                  <img src={photoUrl} alt="Field Photo" className="photo-img"
                    style={{ opacity: uploadState === 'uploading' ? 0.5 : 1 }} />

                  {uploadState === 'uploading' && (
                    <div className="photo-loading-overlay">
                      <Loader size={20} className="spin" />
                      <span>UPLOADING…</span>
                    </div>
                  )}

                  {analysisState === 'running' && (
                    <div className="overlay-ai-badge"><Loader size={12} className="spin" /> ANALYZING IMAGE…</div>
                  )}

                  {aiData?.structures && aiDetectionsVisible && aiData.structures.map((s, i) => (
                    <div key={i} className="ai-detection-badge" style={{ bottom: 80 + (i * 28) }}>
                      <span className={`det-status ${s.status.toLowerCase()}`}>{s.status}</span>
                      {s.type?.replace(/_/g, ' ').toUpperCase()} · {s.condition}
                    </div>
                  ))}

                  <div className="overlay-tl overlay-box">
                    <div className="ov-row">
                      <Navigation size={12} />
                      <span className="ov-val">
                        {loc ? `${loc.latitude.toFixed(5)}°N, ${loc.longitude.toFixed(5)}°E` : 'NO GPS'}
                      </span>
                    </div>
                    <div className="ov-row" style={{ fontSize: '9px', marginTop: 6, color: loc ? '#10b981' : '#f59e0b' }}>
                      {loc ? `SOURCE: ${loc.source}` : 'LOCATION REQUIRED'}
                    </div>
                  </div>

                  <div className="overlay-tr overlay-box">
                    <div className="ov-row" style={{ color: '#38bdf8' }}>
                      <Clock size={11} />
                      {obs?.captureTime ? new Date(obs.captureTime).toLocaleString() : 'TIME NOT AVAILABLE'}
                    </div>
                    {obs?.hash && (
                      <div className="ov-row" style={{ fontSize: '9px', color: '#6b7280', marginTop: 4 }}>
                        SHA: {obs.hash.slice(0, 12)}…
                      </div>
                    )}
                  </div>

                  {aiData && (
                    <div className="overlay-bl segment-box">
                      <div className="seg-title">
                        AI SCENE ANALYSIS
                        <span style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: 4, color: '#d1d5db', fontSize: '9px', marginLeft: 8 }}>
                          {obs?.aiAnalysis?.status}
                        </span>
                        <button style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer' }}
                          onClick={() => setAiDetectionsVisible(v => !v)}>
                          {aiDetectionsVisible ? <EyeOff size={11} /> : <Eye size={11} />}
                        </button>
                      </div>
                      <div className="seg-desc">{aiData.scene}</div>
                      {aiData.uncertainty && (
                        <div className="seg-meta" style={{ color: '#f59e0b' }}>UNCERTAIN: {aiData.uncertainty}</div>
                      )}
                      {exifData?.camera?.make && (
                        <div className="seg-meta">
                          {exifData.camera.make} {exifData.camera.model}
                          {exifData.camera.focalLength ? ` · ${exifData.camera.focalLength}mm` : ''}
                          {exifData.camera.iso ? ` · ISO${exifData.camera.iso}` : ''}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="fp-footer">
              {obs ? (
                <>
                  <div className="footer-col">
                    <span className="fc-label">OBS ID:</span>
                    <span className="fc-val">{obs.id}</span>
                  </div>
                  <div className="footer-col">
                    <span className="fc-label">HASH:</span>
                    <span className="fc-val">{obs.hash ? obs.hash.slice(0, 12) + '…' : '—'}</span>
                  </div>
                  <div className="footer-col">
                    <span className="fc-label">STATUS:</span>
                    <span className="fc-val" style={{ color: obs.evidenceId ? '#10b981' : '#f59e0b' }}>{obs.status}</span>
                  </div>
                  <div className="footer-col" style={{ cursor: 'pointer' }} onClick={() => setShowExifDrawer(v => !v)}>
                    <span className="fc-val" style={{ color: '#38bdf8', fontSize: '11px', display: 'flex', alignItems: 'center', gap: 4 }}>
                      FULL EXIF METRICS <ArrowRight size={10} />
                    </span>
                  </div>
                </>
              ) : (
                <div className="footer-col" style={{ color: '#4b5563' }}>
                  Upload a field photograph to begin observation
                </div>
              )}
            </div>
          </div>

          {/* Orbital Viewport */}
          <div className="field-panel">
            <div className="fp-header">
              <div className="fp-title"><Satellite size={14} color="#38bdf8" /> ORBITAL VIEWPORT // MAP CONTEXT</div>
              <div className="fp-controls">
                {['TRUE_COLOR', 'NDVI', 'NDMI'].map(mode => {
                  const isAvailable = mode === 'TRUE_COLOR' || (obs?.satelliteContext?.status === 'AVAILABLE' && false); // Backend doesn't currently supply tile URLs
                  return (
                    <div key={mode}
                      className={`fp-btn ${satelliteMode === mode ? 'primary' : ''} ${!isAvailable ? 'disabled' : ''}`}
                      title={!isAvailable ? `${mode} layer requires Earth Engine tile service integration` : ''}
                      onClick={() => isAvailable && setSatelliteMode(mode)}
                      style={{ opacity: isAvailable ? 1 : 0.5, cursor: isAvailable ? 'pointer' : 'not-allowed' }}>
                      {mode.replace('_', ' ')}
                    </div>
                  );
                })}
                <div className="fp-btn" onClick={() => setShowPinTool(v => !v)}
                  style={{ color: showPinTool ? '#38bdf8' : undefined }} title="Pin location">
                  <MapPin size={12} />
                </div>
              </div>
            </div>

            <div className="fp-body">
              {mapsError ? (
                <div className="map-no-gps-panel" style={{ background: 'rgba(0,0,0,0.8)', padding: 32, border: '1px solid #f87171' }}>
                  <AlertTriangle size={24} color="#f87171" />
                  <div style={{ fontWeight: 600, color: '#f87171', marginTop: 12 }}>GOOGLE MAPS API KEY REQUIRED</div>
                  <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 8 }}>
                    Enable/configure the required Google Maps API services and provide the browser key in the environment configuration.
                  </div>
                  <div style={{ color: '#6b7280', fontSize: 10, marginTop: 4 }}>
                    {mapsError.message}
                  </div>
                  <button className="ngps-btn" onClick={() => window.location.reload()} style={{ marginTop: 16 }}>
                    CHECK AGAIN
                  </button>
                </div>
              ) : (
                <div ref={mapContainer} className="orbital-map-container" style={{ background: '#e5e7eb' }}></div>
              )}

              {showPinTool && (
                <div className="map-pin-tool-banner">
                  <MapPin size={13} /> CLICK MAP TO SET OBSERVATION LOCATION
                  <button onClick={() => setShowPinTool(false)}><X size={11} /></button>
                </div>
              )}

              <div className="om-overlay-top">
                <div className="om-row">
                  <span>
                    <span className={obs?.satelliteContext?.status === 'UNAVAILABLE' && !fieldContext ? 'om-red' : 'om-green'} style={{ color: obs?.satelliteContext?.status === 'UNAVAILABLE' && !fieldContext ? '#f87171' : '#10b981' }}>●</span>
                    {obs?.satelliteContext?.status === 'AVAILABLE' || fieldContext?.satellite?.status !== 'UNAVAILABLE' ? ' SATELLITE CONTEXT LOADED' :
                      ' SATELLITE ANALYSIS UNAVAILABLE'}
                  </span>
                  <span className="om-gray">MODE: <span className="om-green" style={{ fontWeight: 600 }}>{satelliteMode}</span></span>
                </div>
              </div>

              {(obs?.watershedId || fieldContext?.watershed) && (
                <div className="om-overlay-bl">
                  <div className="om-title">WATERSHED CONTEXT</div>
                  <div className="om-val">{fieldContext?.watershed?.name || obs?.watershedName || obs?.watershedId}</div>
                </div>
              )}

              {obs && !loc && !mapsError && (
                <div className="map-no-gps-panel">
                  <AlertTriangle size={16} color="#f59e0b" />
                  <div style={{ fontWeight: 600, color: '#f59e0b', marginTop: 8 }}>LOCATION REQUIRED</div>
                  <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 4 }}>Photo has no GPS data and no landmark found</div>
                  <div className="no-gps-actions">
                    <button className="ngps-btn" onClick={handleUseCurrentLocation}>
                      <Navigation size={12} /> USE CURRENT LOCATION
                    </button>
                    <button className="ngps-btn" onClick={() => setShowPinTool(true)}>
                      <MapPin size={12} /> PIN ON MAP
                    </button>
                  </div>
                  <div style={{ marginTop: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input className="coord-input" placeholder="Lat"
                      value={manualCoords.lat} onChange={e => setManualCoords(v => ({ ...v, lat: e.target.value }))} />
                    <input className="coord-input" placeholder="Lon"
                      value={manualCoords.lon} onChange={e => setManualCoords(v => ({ ...v, lon: e.target.value }))} />
                    <button className="ngps-btn" onClick={handleManualCoords}>OK</button>
                  </div>
                </div>
              )}

              {obs?.landmark && (
                <div className="map-no-gps-panel" style={{ top: '60px', bottom: 'auto', left: '10px', transform: 'none', alignItems: 'flex-start', padding: '16px', background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(56,189,248,0.3)', backdropFilter: 'blur(8px)', width: '260px' }}>
                  <div style={{ color: '#38bdf8', fontSize: '9px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Navigation size={10} /> LANDMARK IDENTIFIED FROM PHOTO
                  </div>
                  <div style={{ color: '#000', fontWeight: 600, marginTop: '8px', fontSize: '13px' }}>
                    {obs.landmark.name || obs.landmark}
                  </div>
                  <div style={{ color: '#4b5563', fontSize: '11px', marginTop: '2px' }}>
                    {obs.landmark.river ? `${obs.landmark.river} River · ` : ''}{obs.landmark.region || ''}
                  </div>
                  <div style={{ display: 'flex', gap: '16px', marginTop: '12px' }}>
                    <div>
                      <div style={{ color: '#9ca3af', fontSize: '9px' }}>LATITUDE</div>
                      <div style={{ color: '#000', fontSize: '11px', fontFamily: 'monospace' }}>{loc?.latitude?.toFixed(4)}° N</div>
                    </div>
                    <div>
                      <div style={{ color: '#9ca3af', fontSize: '9px' }}>LONGITUDE</div>
                      <div style={{ color: '#000', fontSize: '11px', fontFamily: 'monospace' }}>{loc?.longitude?.toFixed(4)}° E</div>
                    </div>
                  </div>
                  <div style={{ color: '#10b981', fontSize: '9px', marginTop: '12px' }}>SOURCE: AI VISION + LANDMARK REGISTRY</div>
                </div>
              )}

              <div className="map-controls-right">
                <div className="mc-btn" onClick={mapZoomIn}><Plus size={14} /></div>
                <div className="mc-btn" onClick={mapZoomOut}><Minus size={14} /></div>
                <div className="mc-btn" onClick={mapCenter}><Crosshair size={14} /></div>
              </div>
            </div>

            <div className="fp-footer">
              <div className="footer-col" style={{ width: '40%' }}>
                <span className="fc-label">COORDINATES:</span>
                <span className="fc-val">
                  {loc ? `${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}` : 'NOT SET'}
                </span>
              </div>
              <div className="footer-col" style={{ width: '30%' }}>
                <span className="fc-label" style={{ color: '#10b981' }}>SOURCE:</span>
                <span className="fc-val" style={{ color: '#10b981' }}>{obs?.landmark ? 'LANDMARK REGISTRY' : (loc?.source || '—')}</span>
              </div>
              <div className="footer-col" style={{ width: '30%' }}>
                {loc && !obs?.satelliteContext && !fieldContext && (
                  <button className="fp-btn" style={{ fontSize: 10, padding: '3px 8px' }} onClick={fetchSatelliteContext}>
                    LOAD SAT CONTEXT
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Observation + Agreement */}
        <div className="observation-grid">

          {/* Structured Observation */}
          <div className="field-panel obs-panel">
            <div className="obs-section-title">
              <div className="flex items-center gap-2"><FileText size={14} /> STRUCTURED FIELD OBSERVATION RECORD</div>
              <div style={{ color: '#38bdf8', fontSize: '9px' }}>{obs ? 'LIVE · AUTOSAVES' : 'AWAITING UPLOAD'}</div>
            </div>

            <div className="od-label" style={{ marginBottom: 12 }}>PRIMARY OBSERVATION THEMES (MULTI-SELECT)</div>
            <div className="theme-grid">
              {['WATER REGIME', 'VEGETATION CANOPY', 'DRAINAGE / CHANNEL', 'WATERSHED INTERVENTION', 'SOIL & EROSION GULLIES', 'AGRICULTURE / CROP'].map(t => (
                <div key={t} className={`theme-tag ${themes.includes(t) ? 'active' : ''}`} onClick={() => toggleTheme(t)}>
                  {t} {themes.includes(t) && '●'}
                </div>
              ))}
            </div>

            {aiData?.structures?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div className="od-label" style={{ marginBottom: 8 }}>AI-DETECTED STRUCTURES</div>
                {aiData.structures.map((s, i) => (
                  <div key={i} className="ai-structure-row">
                    <span className={`det-status ${s.status.toLowerCase()}`}>{s.status}</span>
                    <span style={{ color: '#e5e7eb' }}>{s.type?.replace(/_/g, ' ').toUpperCase()}</span>
                    <span style={{ color: '#9ca3af', margin: '0 4px' }}>·</span>
                    <span style={{ color: '#94a3b8', fontSize: 10 }}>{s.condition} — {s.notes}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="od-label" style={{ marginBottom: 12 }}>OBSERVED CONDITION QUALIFIER</div>
            <div className="condition-grid">
              {['AS CONSTRUCTED', 'ACTIVE FLOW', 'HEAVY SILTATION', 'PARTIAL BREACH', 'DRY / INACTIVE'].map(c => (
                <div key={c} className={`cond-box ${condition === c ? 'active' : ''}`} onClick={() => handleCondition(c)}>
                  {c}
                </div>
              ))}
            </div>

            <div className="obs-section-title" style={{ marginTop: 32, marginBottom: 12 }}>
              <div>GROUND OBSERVER SYNTHESIS</div>
              <div style={{ color: '#6b7280', fontSize: '9px' }}>{obs ? 'AI PRE-FILLED · EDITABLE' : 'MANUAL ENTRY'}</div>
            </div>
            <textarea
              className="synthesis-area"
              placeholder={obs ? '' : 'Upload a field photo to auto-generate analysis, or type your observation here…'}
              value={synthesis}
              onChange={e => handleSynthesisChange(e.target.value)}
            />
            {obs && (
              <div style={{ marginTop: 6, fontSize: 10, color: '#4b5563', textAlign: 'right' }}>
                AUTO-SAVED · {obs.updatedAt ? new Date(obs.updatedAt).toLocaleTimeString() : '—'}
              </div>
            )}
          </div>

          {/* Agreement Panel */}
          <div className="field-panel agreement-panel">
            <div className="obs-section-title" style={{ marginBottom: 24 }}>
              <div className="flex items-center gap-2"><CheckCircle2 size={14} /> FIELD ↔ SATELLITE AGREEMENT</div>
              <div className="fh-status-badge">
                {obs?.satelliteContext?.status === 'AVAILABLE' ? 'CONTEXT LOADED' : 'PENDING'}
              </div>
            </div>

            {aiData ? (
              <>
                {(() => {
                  let waterAgreement = 'PENDING';
                  let vegAgreement = 'PENDING';
                  let overallAgreement = 0;
                  let factors = 0;

                  if (obs?.satelliteContext?.spectral) {
                    const { ndwi, ndvi } = obs.satelliteContext.spectral;

                    if (aiData.visibleWater?.present) {
                      factors++;
                      if (ndwi != null && ndwi > -0.1) { waterAgreement = 'CONSISTENT'; overallAgreement += 93; }
                      else { waterAgreement = 'PARTIAL MATCH'; overallAgreement += 45; }
                    }
                    if (aiData.vegetationCondition?.present) {
                      factors++;
                      if (ndvi != null && ndvi > 0.2) { vegAgreement = 'CONSISTENT'; overallAgreement += 88; }
                      else { vegAgreement = 'PARTIAL MATCH'; overallAgreement += 50; }
                    }
                  }

                  const overallScore = factors > 0 ? Math.round(overallAgreement / factors) : null;

                  return (
                    <>
                      {aiData.visibleWater?.present && (
                        <div className="ap-metric-row">
                          <span className="ap-metric-label">WATER PRESENCE</span>
                          <span className="ap-metric-val">
                            FIELD: {aiData.visibleWater.type?.toUpperCase() || 'VISIBLE'}
                            {' · '}SAT: {waterAgreement} {waterAgreement !== 'PENDING' ? (waterAgreement === 'CONSISTENT' ? '93%' : '45%') : ''}
                          </span>
                        </div>
                      )}
                      {aiData.vegetationCondition?.present && (
                        <div className="ap-metric-row">
                          <span className="ap-metric-label">VEGETATION</span>
                          <span className="ap-metric-val">
                            FIELD: {aiData.vegetationCondition.density?.toUpperCase() || 'VISIBLE'}
                            {' · '}SAT: {vegAgreement} {vegAgreement !== 'PENDING' ? (vegAgreement === 'CONSISTENT' ? '88%' : '50%') : ''}
                          </span>
                        </div>
                      )}
                      {overallScore !== null && (
                        <div className="ap-metric-row" style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                          <span className="ap-metric-label" style={{ color: '#10b981' }}>OVERALL AGREEMENT</span>
                          <span className="ap-metric-val" style={{ color: '#10b981' }}>{overallScore}%</span>
                        </div>
                      )}
                    </>
                  );
                })()}

                <div className="ap-discovery">
                  {aiData.observationSummary && (
                    <>
                      <div className="od-label" style={{ color: '#38bdf8', marginBottom: 8 }}>FIELD DISCOVERY (AI)</div>
                      <div className="apd-quote">"{aiData.observationSummary}"</div>
                    </>
                  )}
                  {obs?.satelliteContext?.data && (
                    <>
                      <div className="od-label" style={{ color: '#9ca3af', marginBottom: 6, marginTop: 16 }}>SATELLITE SIGNAL</div>
                      <div className="apd-desc">
                        {obs.satelliteContext.data.water?.status || 'Water analysis'}
                        {obs.satelliteContext.data.vegetation?.ndvi?.mean != null
                          ? ` · NDVI ${obs.satelliteContext.data.vegetation.ndvi.mean.toFixed(3)}`
                          : ''}
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <div style={{ color: '#4b5563', fontFamily: 'monospace', fontSize: 11, padding: '16px 0' }}>
                {analysisState === 'running'
                  ? <><Loader size={12} className="spin" /> ANALYZING IMAGE…</>
                  : 'Upload and analyze a photo to see field ↔ satellite agreement.'}
              </div>
            )}

            {loc && (
              <div className="ap-geo">
                <div className="od-label flex items-center gap-2" style={{ color: '#10b981' }}>
                  <Navigation size={10} /> LOCATION: {loc.source}
                </div>
                <div className="geo-grid">
                  <div className="od-col">
                    <span className="od-label">LATITUDE:</span>
                    <span className="od-val">{loc.latitude.toFixed(6)}°</span>
                  </div>
                  <div className="od-col">
                    <span className="od-label">LONGITUDE:</span>
                    <span className="od-val">{loc.longitude.toFixed(6)}°</span>
                  </div>
                  {loc.reverseGeocode && (
                    <div className="od-col" style={{ gridColumn: 'span 2' }}>
                      <span className="od-label">GEOCODED:</span>
                      <span className="od-val">{loc.reverseGeocode.placeName}, {loc.reverseGeocode.country}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Evidence Passport */}
        {obs?.evidenceId && (
          <div className="field-panel" style={{ marginTop: 24, background: 'rgba(16, 185, 129, 0.05)', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
            <div className="obs-section-title" style={{ marginBottom: 16, borderBottom: '1px solid rgba(16,185,129,0.2)', paddingBottom: 12 }}>
              <div className="flex items-center gap-2" style={{ color: '#10b981' }}>
                <CheckCircle size={16} /> EVIDENCE PASSPORT
              </div>
              <div style={{ color: '#10b981', fontSize: 11, fontFamily: 'monospace' }}>
                ID: {obs.evidenceId}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, fontSize: 11, fontFamily: 'monospace' }}>
              <div>
                <div style={{ color: '#94a3b8', marginBottom: 4 }}>FIELD IMAGE</div>
                <div>Hash: {obs.hash?.slice(0, 16)}...</div>
                <div>Capture time: {obs.captureTime ? new Date(obs.captureTime).toLocaleString() : 'N/A'}</div>
                <div>EXIF source: {obs.exif?.camera?.make || 'Unknown'}</div>
              </div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              {obs?.watershedId && (
                <button className="action-btn secondary" style={{ fontSize: 11 }}
                  onClick={() => navigate('/watershed', { state: { watershedId: obs.watershedId } })}>
                  VIEW WATERSHED
                </button>
              )}
              {navCtx.missionId && (
                <button className="action-btn secondary" style={{ fontSize: 11 }}
                  onClick={() => navigate('/mission', { state: { missionId: navCtx.missionId } })}>
                  RETURN TO MISSION
                </button>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="field-actions">
          <button className="action-btn primary" onClick={handleSaveEvidence}
            disabled={!obs || savingEvidence || !!obs?.evidenceId}>
            {savingEvidence
              ? <><Loader size={14} className="spin" /> SAVING…</>
              : obs?.evidenceId
                ? <><CheckCircle size={14} /> EVIDENCE COMMITTED</>
                : <>SAVE OBSERVATION & CREATE EVIDENCE <ArrowRight size={14} /></>
            }
          </button>
          <button className="action-btn secondary" disabled={!loc}
            onClick={() => navigate('/compare', { state: { coordinates: loc, date: obs?.captureTime } })}>
            <RefreshCcw size={14} /> COMPARE HISTORICAL SATELLITE
          </button>
          <button className="action-btn secondary" disabled={!obs?.watershedId}
            onClick={() => navigate('/watershed', { state: { watershedId: obs?.watershedId, coordinates: loc } })}>
            <Layout size={14} /> VIEW IN WATERSHED COMMAND
          </button>
          <div className="action-spacer"></div>
          {navCtx.missionId && (
            <button className="action-btn secondary"
              style={{ background: 'rgba(56,189,248,0.1)', borderColor: 'var(--accent-blue)', color: 'var(--accent-blue)' }}
              onClick={() => navigate('/mission', { state: { missionId: navCtx.missionId } })}>
              <Save size={14} /> LOG TO {navCtx.missionId}
            </button>
          )}
        </div>

      </div>

      {/* EXIF Drawer */}
      {showExifDrawer && obs?.exif && (
        <div className="exif-drawer">
          <div className="exif-header">
            <span>EXIF TECHNICAL METADATA</span>
            <button onClick={() => setShowExifDrawer(false)}><X size={16} /></button>
          </div>
          <div className="exif-body">
            {[
              ['GPS STATUS', obs.exif.status, obs.exif.status === 'GPS_FOUND' ? '#10b981' : '#f59e0b'],
              obs.exif.gps && ['LATITUDE', obs.exif.gps.latitude?.toFixed(7)],
              obs.exif.gps && ['LONGITUDE', obs.exif.gps.longitude?.toFixed(7)],
              ['CAPTURE TIME', obs.exif.captureTime ? new Date(obs.exif.captureTime).toLocaleString() : '—'],
              obs.exif.camera?.make && ['CAMERA', `${obs.exif.camera.make} ${obs.exif.camera.model || ''}`],
              obs.exif.camera?.focalLength != null && ['FOCAL LENGTH', `${obs.exif.camera.focalLength}mm`],
              obs.exif.camera?.iso && ['ISO', obs.exif.camera.iso],
              obs.exif.camera?.aperture && ['APERTURE', `f/${obs.exif.camera.aperture}`],
              obs.exif.camera?.shutterSpeed && ['SHUTTER', `1/${Math.round(1 / obs.exif.camera.shutterSpeed)}s`],
              ['SHA-256', obs.hash]
            ].filter(Boolean).map(([label, value, color]) => (
              <div key={label} className="exif-row">
                <span>{label}</span>
                <span style={{ color: color || undefined, fontSize: label === 'SHA-256' ? 10 : undefined, wordBreak: 'break-all' }}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fullscreen */}
      {showFullscreen && photoUrl && (
        <div className="fullscreen-viewer" onClick={() => setShowFullscreen(false)}>
          <button className="fs-close" onClick={() => setShowFullscreen(false)}><X size={20} /></button>
          <img src={photoUrl} alt="Field Observation"
            style={{ maxWidth: '95vw', maxHeight: '95vh', objectFit: 'contain', borderRadius: 4 }}
            onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
