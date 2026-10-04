/**
 * DHARAWATCH — Evidence
 * Lists every evidence record stored on the local server (evidence table):
 * Field observations committed as evidence and Intervention Evidence Review outcomes.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Camera, ClipboardCheck, RefreshCw, Satellite } from 'lucide-react';
import AppNavigation from '../../components/AppNavigation';
import { evidenceService } from '../../services/evidenceService';
import './Evidence.css';

const fmt = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const kind = (e) => (e.type === 'INTERVENTION_REVIEW' ? 'REVIEW' : e.type === 'detection' ? 'DETECTION' : 'FIELD');
const when = (e) => e.createdAt || e.timestamp || e.capturedAt || null;
const title = (e) => {
  if (e.type === 'INTERVENTION_REVIEW') return e.interventionName || e.interventionId;
  if (e.type === 'detection') return `${e.method?.index || 'Satellite'} detection · ${e.summary?.detectionCount ?? 0} features`;
  const aiText = !['FALLBACK', 'AI_ERROR'].includes(e.aiAnalysis?.status) ? e.aiAnalysis?.data?.observationSummary : null;
  return e.synthesis?.slice(0, 70) || aiText?.slice(0, 70) || (e.watershedName ? `Field observation · ${e.watershedName}` : `Field observation ${e.observationId || ''}`);
};
// centre of a GeoJSON polygon's first ring (detections store their area of interest)
const aoiCenter = (g) => {
  const ring = g?.coordinates?.[0];
  if (!ring?.length) return null;
  const xs = ring.map((c) => c[0]), ys = ring.map((c) => c[1]);
  return { latitude: (Math.min(...ys) + Math.max(...ys)) / 2, longitude: (Math.min(...xs) + Math.max(...xs)) / 2, source: 'AOI centre' };
};

export default function Evidence() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState({ status: 'LOADING', items: [] });

  const load = () => {
    setState((s) => ({ ...s, status: 'LOADING' }));
    evidenceService.getAll()
      .then((rows) => setState({ status: 'DONE', items: (Array.isArray(rows) ? rows : []).sort((a, b) => new Date(when(b) || 0) - new Date(when(a) || 0)) }))
      .catch((e) => setState({ status: 'ERROR', items: [], error: e.message }));
  };
  useEffect(load, []);

  const selected = state.items.find((e) => e.id === id) || state.items[0];
  const rawLoc = selected?.coordinates || aoiCenter(selected?.aoi);
  const loc = rawLoc && { latitude: rawLoc.latitude ?? rawLoc.lat, longitude: rawLoc.longitude ?? rawLoc.lng ?? rawLoc.lon, source: rawLoc.source };
  const ai = selected?.aiAnalysis;
  const aiOk = ai?.data && ai.status !== 'FALLBACK' && ai.status !== 'AI_ERROR';
  const satCtx = selected?.satelliteContext?.status === 'AVAILABLE' ? selected.satelliteContext : null;

  return (
    <div className="evd-page">
      <AppNavigation />
      <aside className="evd-list">
        <div className="evd-head">
          <b>EVIDENCE</b>
          <span>{state.status === 'DONE' ? `${state.items.length} records` : state.status === 'LOADING' ? 'Loading…' : 'Error'}</span>
          <button onClick={load} aria-label="Refresh"><RefreshCw size={12} /></button>
        </div>
        {state.status === 'ERROR' && <div className="evd-empty">Could not load evidence: {state.error}</div>}
        {state.status === 'DONE' && !state.items.length && <div className="evd-empty">No evidence yet. Save a field observation or mark an intervention as reviewed.</div>}
        {state.items.map((e) => (
          <button key={e.id} className={`evd-row ${selected?.id === e.id ? 'on' : ''}`} onClick={() => navigate(`/evidence/${encodeURIComponent(e.id)}`)}>
            <span className={`evd-tag ${kind(e).toLowerCase()}`}>{kind(e) === 'REVIEW' ? <ClipboardCheck size={10} /> : kind(e) === 'DETECTION' ? <Satellite size={10} /> : <Camera size={10} />} {kind(e)}</span>
            <b>{title(e)}</b>
            <small>{fmt(when(e))}{e.label ? ` · ${e.label}` : e.condition ? ` · ${e.condition}` : e.summary?.totalAreaKm2 != null ? ` · ${e.summary.totalAreaKm2.toFixed(2)} km²` : ''}</small>
          </button>
        ))}
      </aside>

      <main className="evd-detail">
        {!selected ? <div className="evd-empty">Select an evidence record.</div> : (
          <>
            <div className="evd-title">
              <span className={`evd-tag ${kind(selected).toLowerCase()}`}>{kind(selected)}</span>
              <h1>{title(selected)}</h1>
              <small>{selected.id} · created {fmt(when(selected))}</small>
            </div>
            {selected.observationId && (
              <img className="evd-photo" src={`/api/field/${selected.observationId}/photo`} alt="Field evidence" onError={(ev) => { ev.currentTarget.style.display = 'none'; }} />
            )}
            <dl className="evd-dl">
              {selected.label && <><dt>Evidence status</dt><dd>{selected.label}</dd></>}
              {selected.interventionName && <><dt>Intervention</dt><dd>{selected.interventionName} {selected.interventionType ? `(${selected.interventionType})` : ''}</dd></>}
              {selected.interventionId && !selected.interventionName && <><dt>Intervention</dt><dd>{selected.interventionId}</dd></>}
              {(selected.watershedName || selected.watershedId) && <><dt>Watershed</dt><dd>{selected.watershedName || selected.watershedId}</dd></>}
              {selected.type === 'detection' && <>
                <dt>Dataset</dt><dd>{selected.dataset?.name} ({selected.dataset?.sensor}) · {selected.dataset?.resolutionMeters} m</dd>
                <dt>Scene</dt><dd>{selected.dataset?.sceneId || '—'}{selected.acquisition?.cloudPercentage != null ? ` · cloud ${Number(selected.acquisition.cloudPercentage).toFixed(1)}%` : ''}</dd>
                <dt>Method</dt><dd>{selected.method?.index} ({selected.method?.nirBand}, {selected.method?.redBand}) threshold {selected.method?.threshold}</dd>
                <dt>Result</dt><dd>{selected.summary?.detectionCount ?? 0} features · {selected.summary?.totalAreaKm2 != null ? `${selected.summary.totalAreaKm2.toFixed(3)} km²` : '—'}</dd>
              </>}
              {loc?.latitude != null && <><dt>Location</dt><dd>{Number(loc.latitude).toFixed(5)}, {Number(loc.longitude).toFixed(5)}{loc.source ? ` (${loc.source})` : ''}</dd></>}
              {selected.captureTime && <><dt>Captured</dt><dd>{fmt(selected.captureTime)}</dd></>}
              {selected.condition && <><dt>Condition</dt><dd>{selected.condition}</dd></>}
              {selected.themes?.length > 0 && <><dt>Themes</dt><dd>{selected.themes.join(', ')}</dd></>}
              {selected.synthesis && <><dt>Notes</dt><dd>{selected.synthesis}</dd></>}
              {selected.type !== 'detection' && selected.type !== 'INTERVENTION_REVIEW' && <><dt>AI observation</dt><dd>{aiOk ? (ai.data.observationSummary || ai.data.scene) : 'Not available (AI was unavailable when this evidence was saved)'}</dd></>}
              {aiOk && ai.data.uncertainty && <><dt>AI limitations</dt><dd>{ai.data.uncertainty}</dd></>}
              {satCtx && <><dt>Satellite context</dt><dd>{satCtx.context?.satellite} {satCtx.context?.processingLevel} · {fmt(satCtx.context?.acquisitionDate)} · cloud {satCtx.context?.cloudCover}%{satCtx.spectral ? ` · NDVI ${satCtx.spectral.ndvi} · NDWI ${satCtx.spectral.ndwi} · NDMI ${satCtx.spectral.ndmi}` : ''}</dd></>}
              {selected.photoHash && <><dt>Photo SHA-256</dt><dd className="evd-mono">{selected.photoHash}</dd></>}
              {selected.satellite && <><dt>Satellite</dt><dd>{selected.satellite.baseline} → {selected.satellite.current}{selected.satellite.change?.ndvi ? ` · NDVI ${selected.satellite.change.ndvi.before} → ${selected.satellite.change.ndvi.after}` : ''}</dd></>}
              {selected.reasons?.length > 0 && <><dt>Reasons</dt><dd>{selected.reasons.join(' ')}</dd></>}
              {selected.limitations?.length > 0 && <><dt>Limitations</dt><dd>{selected.limitations.join(' ')}</dd></>}
            </dl>
            {selected.interventionId && selected.watershedId && (
              <button className="evd-btn" onClick={() => navigate(`/evidence-review?watershed=${encodeURIComponent(selected.watershedId)}&intervention=${encodeURIComponent(selected.interventionId)}`)}>
                <ClipboardCheck size={12} /> OPEN IN EVIDENCE REVIEW
              </button>
            )}
          </>
        )}
      </main>
    </div>
  );
}
