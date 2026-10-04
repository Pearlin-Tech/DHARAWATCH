/**
 * DHARAWATCH — Evidence
 * Lists every evidence record stored on the local server (evidence table):
 * Field observations committed as evidence and Intervention Evidence Review outcomes.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Camera, ClipboardCheck, RefreshCw } from 'lucide-react';
import AppNavigation from '../../components/AppNavigation';
import { evidenceService } from '../../services/evidenceService';
import './Evidence.css';

const fmt = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const kind = (e) => (e.type === 'INTERVENTION_REVIEW' ? 'REVIEW' : 'FIELD');
const title = (e) => (e.type === 'INTERVENTION_REVIEW' ? e.interventionName || e.interventionId : e.synthesis?.slice(0, 70) || e.observationId || e.id);

export default function Evidence() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState({ status: 'LOADING', items: [] });

  const load = () => {
    setState((s) => ({ ...s, status: 'LOADING' }));
    evidenceService.getAll()
      .then((rows) => setState({ status: 'DONE', items: (Array.isArray(rows) ? rows : []).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)) }))
      .catch((e) => setState({ status: 'ERROR', items: [], error: e.message }));
  };
  useEffect(load, []);

  const selected = state.items.find((e) => e.id === id) || state.items[0];
  const loc = selected?.coordinates;

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
            <span className={`evd-tag ${kind(e).toLowerCase()}`}>{kind(e) === 'REVIEW' ? <ClipboardCheck size={10} /> : <Camera size={10} />} {kind(e)}</span>
            <b>{title(e)}</b>
            <small>{fmt(e.createdAt)}{e.label ? ` · ${e.label}` : e.condition ? ` · ${e.condition}` : ''}</small>
          </button>
        ))}
      </aside>

      <main className="evd-detail">
        {!selected ? <div className="evd-empty">Select an evidence record.</div> : (
          <>
            <div className="evd-title">
              <span className={`evd-tag ${kind(selected).toLowerCase()}`}>{kind(selected)}</span>
              <h1>{title(selected)}</h1>
              <small>{selected.id} · created {fmt(selected.createdAt)}</small>
            </div>
            {selected.observationId && (
              <img className="evd-photo" src={`/api/field/${selected.observationId}/photo`} alt="Field evidence" onError={(ev) => { ev.currentTarget.style.display = 'none'; }} />
            )}
            <dl className="evd-dl">
              {selected.label && <><dt>Evidence status</dt><dd>{selected.label}</dd></>}
              {selected.interventionName && <><dt>Intervention</dt><dd>{selected.interventionName} {selected.interventionType ? `(${selected.interventionType})` : ''}</dd></>}
              {selected.interventionId && !selected.interventionName && <><dt>Intervention</dt><dd>{selected.interventionId}</dd></>}
              {(selected.watershedName || selected.watershedId) && <><dt>Watershed</dt><dd>{selected.watershedName || selected.watershedId}</dd></>}
              {loc?.latitude != null && <><dt>Location</dt><dd>{Number(loc.latitude).toFixed(5)}, {Number(loc.longitude).toFixed(5)}{loc.source ? ` (${loc.source})` : ''}</dd></>}
              {selected.captureTime && <><dt>Captured</dt><dd>{fmt(selected.captureTime)}</dd></>}
              {selected.condition && <><dt>Condition</dt><dd>{selected.condition}</dd></>}
              {selected.themes?.length > 0 && <><dt>Themes</dt><dd>{selected.themes.join(', ')}</dd></>}
              {selected.synthesis && <><dt>Notes</dt><dd>{selected.synthesis}</dd></>}
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
