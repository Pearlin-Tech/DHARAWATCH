/**
 * Intervention Evidence Review — panel sections.
 * Every number rendered here comes from the server response; nothing is synthesised client-side.
 */
import React, { useState } from 'react';
import {
  Camera, Satellite, Mountain, ChevronDown, AlertTriangle, CheckCircle2, MapPin, X,
  Sparkles, RefreshCw, Info, ArrowRight, Droplets, Leaf, Waves, Loader2
} from 'lucide-react';
import { gpsStatus, observationDate, FIELD_FRESH_DAYS } from '../../shared/evidenceStatus';

export const fmtDate = (d) => {
  if (!d) return '—';
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? String(d) : t.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
const sign = (v, d = 2) => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(d)}`);
const num = (v, d = 2) => (v == null ? '—' : Number(v).toFixed(d));

// ─── primitives ─────────────────────────────────────────────────
export function StatePill({ state, label }) {
  const s = state || 'IDLE';
  return <span className={`er-pill er-pill-${s.toLowerCase()}`}>{label || s.replace(/_/g, ' ')}</span>;
}

export function Section({ id, icon: Icon, title, pill, open, onToggle, children, actions }) {
  return (
    <section id={`er-sec-${id}`} className={`er-section ${open ? 'open' : ''}`}>
      <header className="er-section-head">
        <button className="er-section-toggle" onClick={onToggle} aria-expanded={open} aria-controls={`er-body-${id}`}>
          {Icon && <Icon size={13} />}
          <span>{title}</span>
          <ChevronDown size={13} className="er-chev" />
        </button>
        <div className="er-section-meta">{pill}{actions}</div>
      </header>
      {open && <div className="er-section-body" id={`er-body-${id}`}>{children}</div>}
    </section>
  );
}

function SectionState({ res, what, onRetry }) {
  if (!res || res.status === 'IDLE') return null;
  if (res.status === 'LOADING') return <div className="er-state"><Loader2 size={13} className="er-spin" /> {res.label || `Loading ${what}…`}</div>;
  if (res.status === 'ERROR' || res.status === 'TIMEOUT') {
    return (
      <div className="er-state error">
        <AlertTriangle size={13} /> <span>{res.status === 'TIMEOUT' ? 'TIMED OUT' : 'ERROR'} — {res.error}</span>
        {onRetry && <button className="er-btn sm" onClick={onRetry}><RefreshCw size={11} /> RETRY</button>}
      </div>
    );
  }
  return null;
}

function Provenance({ rows }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="er-prov">
      <button className="er-link" onClick={() => setOpen(!open)}><Info size={11} /> {open ? 'Hide' : 'Show'} data provenance</button>
      {open && <dl>{rows.filter(([, v]) => v).map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl>}
    </div>
  );
}

// ─── evidence cards (summary tiles) ─────────────────────────────
export function EvidenceCards({ ev, sat, ter, onOpen }) {
  const f = ev.field;
  const s = sat.data;
  const t = ter.data;
  const cards = [
    {
      id: 'field', icon: Camera, label: 'FIELD EVIDENCE', state: ev.components.field.state,
      value: f.photoCount ? `${f.photoCount} photo${f.photoCount > 1 ? 's' : ''}` : f.inspectionCount ? `${f.inspectionCount} inspection${f.inspectionCount > 1 ? 's' : ''}` : 'None',
      sub: f.latestDate ? `Latest ${fmtDate(f.latestDate)}` : 'No field records'
    },
    {
      id: 'satellite', icon: Satellite, label: 'SATELLITE CHANGE', state: ev.components.satellite.state,
      value: s?.status === 'AVAILABLE' && s.change?.ndvi ? `NDVI ${sign(s.change.ndvi.delta)}` : sat.status === 'LOADING' ? '…' : s?.status === 'NO_SUITABLE_IMAGE' ? 'No image' : '—',
      sub: s?.status === 'AVAILABLE' ? `${s.baseline.acquisitionDate} → ${s.current.acquisitionDate}` : ev.components.satellite.detail
    },
    {
      id: 'terrain', icon: Mountain, label: 'TERRAIN CONTEXT', state: ev.components.terrain.state,
      value: t?.flowAccumulation?.level ? `Flow ${t.flowAccumulation.level}` : t?.elevation ? `${t.elevation.mean} m` : ter.status === 'LOADING' ? '…' : '—',
      sub: t?.slope ? `Slope ${t.slope.mean}° · ${t.elevation?.mean ?? '—'} m` : ev.components.terrain.detail
    }
  ];
  return (
    <div className="er-cards">
      {cards.map((c) => (
        <button key={c.id} className={`er-card state-${c.state.toLowerCase()}`} onClick={() => onOpen(c.id)}>
          <div className="er-card-head"><c.icon size={12} /> {c.label}</div>
          <div className="er-card-value">{c.value}</div>
          <div className="er-card-sub" title={c.sub}>{c.sub}</div>
        </button>
      ))}
    </div>
  );
}

// ─── evidence status ────────────────────────────────────────────
export function EvidenceStatusBlock({ ev, review }) {
  return (
    <div className={`er-status tone-${ev.tone}`}>
      <div className="er-status-head">
        <span className="er-status-label">{ev.label}</span>
        <span className="er-status-basis">Categorical — derived from available evidence, not a score</span>
      </div>
      {ev.reasons.length > 0 && <ul className="er-reasons">{ev.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
      {review?.reviewedAt && (
        <div className="er-status-review"><CheckCircle2 size={11} /> Marked reviewed {fmtDate(review.reviewedAt)} as {review.label}{review.baselineDate ? ` (${review.baselineDate} → ${review.currentDate})` : ''}</div>
      )}
    </div>
  );
}

// ─── field evidence ─────────────────────────────────────────────
export function FieldSection({ field, ev, onPhoto, onCapture, onRetry }) {
  if (field.status !== 'AVAILABLE') return <SectionState res={field} what="field evidence" onRetry={onRetry} />;
  const { photos, inspections, nearbyRadiusM } = field;
  const f = ev.field;
  if (!photos.length && !inspections.length) {
    return (
      <div className="er-empty">
        <Camera size={18} />
        <b>NO FIELD EVIDENCE</b>
        <span>No photos are linked to this intervention or located within {nearbyRadiusM} m, and it has no inspection records.</span>
        <button className="er-btn primary" onClick={onCapture}><Camera size={12} /> CAPTURE FIELD EVIDENCE</button>
      </div>
    );
  }
  return (
    <>
      <div className="er-kv-grid">
        <div><span>PHOTOS</span><b>{f.photoCount}</b><small>{f.linkedCount} linked · {f.nearbyCount} within {nearbyRadiusM} m</small></div>
        <div><span>LATEST RECORD</span><b>{fmtDate(f.latestDate)}</b><small>{f.latestKind ? `${f.latestKind}, ${f.ageDays} days ago` : '—'}{f.latestDate && !f.fresh ? ` · older than ${FIELD_FRESH_DAYS} d` : ''}</small></div>
        <div><span>GPS</span><b>{f.exifGpsCount}/{f.photoCount || 0}</b><small>photos with EXIF GPS</small></div>
        <div><span>INSPECTIONS</span><b>{f.inspectionCount}</b><small>{inspections[0] ? `last ${fmtDate(inspections[0].date)}` : 'none recorded'}</small></div>
      </div>
      {photos.length > 0 && (
        <div className="er-photos">
          {photos.map((p) => (
            <button key={p.id} className="er-photo" onClick={() => onPhoto(p)} title="Open photo evidence">
              <img src={p.thumbUrl} alt={`Field photo ${fmtDate(observationDate(p))}`} loading="lazy"
                onError={(e) => { e.currentTarget.replaceWith(Object.assign(document.createElement('span'), { className: 'er-photo-missing', textContent: 'FILE MISSING' })); }} />
              <span className={`er-photo-tag ${p.link === 'LINKED' ? 'linked' : ''}`}>{p.link === 'LINKED' ? 'LINKED' : `${p.distanceM} m`}</span>
              <span className="er-photo-date">{fmtDate(observationDate(p))}</span>
            </button>
          ))}
        </div>
      )}
      {inspections.length > 0 && (
        <div className="er-list">
          <div className="er-list-title">INSPECTION RECORDS (no photographs attached)</div>
          {inspections.map((i) => (
            <div key={i.id} className="er-list-row">
              <span className="er-mono">{fmtDate(i.date)}</span>
              <span className="er-list-main">{i.notes || '—'}</span>
              <span className="er-mono er-dim">{i.inspector || ''} · {i.status}</span>
            </div>
          ))}
        </div>
      )}
      <button className="er-btn" onClick={onCapture}><Camera size={12} /> ADD FIELD OBSERVATION</button>
    </>
  );
}

// ─── satellite change ───────────────────────────────────────────
function SceneTile({ label, scene }) {
  if (!scene) return null;
  if (scene.status !== 'AVAILABLE') {
    return (
      <div className="er-scene none">
        <div className="er-scene-label">{label} · requested {scene.requestedDate}</div>
        <div className="er-scene-empty"><AlertTriangle size={14} /> NO SUITABLE IMAGE<small>{scene.reason}</small></div>
      </div>
    );
  }
  return (
    <div className="er-scene">
      <div className="er-scene-label">{label}</div>
      {scene.thumbUrl ? <img src={scene.thumbUrl} alt={`${label} Sentinel-2 true colour ${scene.acquisitionDate}`} /> : <div className="er-scene-empty">Thumbnail unavailable</div>}
      <div className="er-scene-meta">
        <b>{scene.acquisitionDate}</b>
        <span>requested {scene.requestedDate}{scene.offsetDays ? ` (${scene.offsetDays} d off)` : ''}</span>
        <span>scene cloud {scene.sceneCloudPct ?? '—'}% · clear in area {scene.clearPctInArea ?? '—'}%</span>
      </div>
    </div>
  );
}

const METRICS = [
  { key: 'ndvi', label: 'NDVI', icon: Leaf, what: 'vegetation greenness' },
  { key: 'ndwi', label: 'NDWI', icon: Waves, what: 'surface water signal' },
  { key: 'ndmi', label: 'NDMI', icon: Droplets, what: 'vegetation moisture' }
];

export function SatelliteSection({ sat, request, onRun, onCompare, dirty }) {
  const s = sat.data;
  return (
    <>
      {sat.status === 'IDLE' && <div className="er-state">Choose baseline and current dates above, then run the analysis.</div>}
      <SectionState res={sat} what="satellite analysis" onRetry={onRun} />
      {dirty && sat.status !== 'LOADING' && s && <div className="er-state warn"><Info size={12} /> Dates or radius changed — results below are for the previous selection. <button className="er-btn sm primary" onClick={onRun}>RE-RUN</button></div>}
      {s && (
        <>
          <div className="er-area"><MapPin size={11} /> ANALYSIS AREA · {s.analysisArea.kind === 'circle' ? `${s.analysisArea.radiusM} m radius` : 'intervention polygon'} · {s.analysisArea.areaHa} ha <span className="er-dim">— every value below is computed inside this footprint (outlined in cyan)</span></div>
          <div className="er-scenes">
            <SceneTile label="BEFORE" scene={s.baseline} />
            <SceneTile label="CURRENT" scene={s.current} />
          </div>
          {s.change && (
            <table className="er-metrics">
              <thead><tr><th>Index</th><th>Before</th><th>Current</th><th>Δ</th></tr></thead>
              <tbody>
                {METRICS.map((m) => {
                  const c = s.change[m.key];
                  return (
                    <tr key={m.key}>
                      <td><m.icon size={11} /> {m.label}<small>{m.what}</small></td>
                      <td>{num(c?.before, 3)}</td><td>{num(c?.after, 3)}</td>
                      <td className={c?.delta > 0 ? 'up' : c?.delta < 0 ? 'down' : ''}>{sign(c?.delta, 3)}</td>
                    </tr>
                  );
                })}
                <tr>
                  <td><Droplets size={11} /> Open water<small>NDWI &gt; 0 area</small></td>
                  <td>{num(s.change.waterHa?.before)} ha</td><td>{num(s.change.waterHa?.after)} ha</td>
                  <td>{sign(s.change.waterHa?.delta)} ha</td>
                </tr>
              </tbody>
            </table>
          )}
          {s.landCover && (
            <div className="er-lc">
              <span>LAND COVER (Dynamic World, dominant class)</span>
              {s.landCover.transition ? (
                <>
                  <b>{s.landCover.transition.from} → {s.landCover.transition.to}</b>
                  <small>{s.landCover.transition.changed ? 'Dominant class changed between the two windows.' : 'Dominant class unchanged.'} Before {Math.round((s.landCover.before.dominant.share || 0) * 100)}% · after {Math.round((s.landCover.after.dominant.share || 0) * 100)}% of the area.</small>
                </>
              ) : (
                <>
                  <b>{s.landCover.before?.dominant ? `${s.landCover.before.dominant.name} (${Math.round(s.landCover.before.dominant.share * 100)}%)` : 'No data'} → {s.landCover.after?.dominant ? `${s.landCover.after.dominant.name} (${Math.round(s.landCover.after.dominant.share * 100)}%)` : 'No data'}</b>
                  <small>No transition reported — {[!s.landCover.before?.dominant && `before window ${s.landCover.before?.window?.start ?? ''}–${s.landCover.before?.window?.end ?? ''}: ${s.landCover.before?.reason || 'unavailable'}`, !s.landCover.after?.dominant && `current window ${s.landCover.after?.window?.start ?? ''}–${s.landCover.after?.window?.end ?? ''}: ${s.landCover.after?.reason || 'unavailable'}`].filter(Boolean).join('; ')}.</small>
                </>
              )}
            </div>
          )}
          {s.change && <ObservationText s={s} />}
          <Provenance rows={[
            ['Dataset', `${s.provenance.dataset} (${s.provenance.collection})`],
            ['Resolution', s.provenance.resolution],
            ['Scenes', s.baseline.imageId && s.current.imageId ? `${s.baseline.imageId.split('/').pop()} · ${s.current.imageId.split('/').pop()}` : null],
            ['Selection', s.provenance.selection],
            ['Cloud mask', s.provenance.cloudMask],
            ['Formulas', Object.entries(s.provenance.formulas).map(([k, v]) => `${k.toUpperCase()} = ${v}`).join(' · ')],
            ['Water', s.provenance.waterMethod],
            ['Land cover', `${s.landCover.dataset} — ${s.landCover.method}`],
            ['Computed', fmtDate(s.computedAt)]
          ]} />
        </>
      )}
      <div className="er-row">
        <button className="er-btn primary" onClick={onRun} disabled={sat.status === 'LOADING'}>
          {sat.status === 'LOADING' ? <><Loader2 size={12} className="er-spin" /> ANALYZING…</> : <><Satellite size={12} /> {s ? 'RE-RUN' : 'RUN'} ANALYSIS</>}
        </button>
        <button className="er-btn" onClick={onCompare}><ArrowRight size={12} /> COMPARE SATELLITE</button>
        <span className="er-dim er-mono">{request.baselineDate} → {request.currentDate} · {request.bufferM} m</span>
      </div>
    </>
  );
}

/** Observation (measured) vs interpretation (cautious, never causal). */
function ObservationText({ s }) {
  const c = s.change;
  const parts = METRICS.filter((m) => c[m.key]).map((m) => `${m.label} ${num(c[m.key].before, 2)} → ${num(c[m.key].after, 2)} (${sign(c[m.key].delta)})`);
  const water = c.waterHa && (c.waterHa.before || c.waterHa.after)
    ? ` Observed open-water extent changed from ${num(c.waterHa.before)} ha to ${num(c.waterHa.after)} ha.` : ' No open water (NDWI > 0) was detected in either scene.';
  const ndvi = c.ndvi?.delta;
  const interp = ndvi == null ? null
    : ndvi >= 0.1 ? 'Vegetation cover in the footprint appears greener or denser at the current date.'
    : ndvi <= -0.1 ? 'Vegetation cover in the footprint appears sparser or drier at the current date.'
    : 'Vegetation greenness in the footprint is broadly similar between the two dates.';
  return (
    <div className="er-obs">
      <p><span className="er-tag obs">OBSERVATION</span> Between {s.baseline.acquisitionDate} and {s.current.acquisitionDate}, within the analysis area: {parts.join('; ')}.{water}</p>
      {interp && <p><span className="er-tag interp">INTERPRETATION</span> {interp} This does not by itself establish that the intervention caused the change.</p>}
    </div>
  );
}

// ─── terrain ────────────────────────────────────────────────────
export function TerrainSection({ ter, onRetry }) {
  if (ter.status !== 'AVAILABLE') return <SectionState res={ter} what="terrain context" onRetry={onRetry} />;
  const t = ter.data;
  if (t.status !== 'AVAILABLE') return <div className="er-state">NO TERRAIN DATA for this location.</div>;
  return (
    <>
      <div className="er-terrain">
        <div><span>ELEVATION</span><b>{t.elevation ? `${t.elevation.mean} m` : '—'}</b><small>{t.elevation ? `range ${t.elevation.min}–${t.elevation.max} m` : 'unavailable'}</small></div>
        <div><span>SLOPE</span><b>{t.slope ? `${t.slope.mean}°` : '—'}</b><small>{t.slope?.explanation || 'unavailable'}</small></div>
        <div className="wide"><span>FLOW ACCUMULATION</span><b>{t.flowAccumulation ? `${t.flowAccumulation.level} · ${t.flowAccumulation.upstreamAreaKm2} km² upstream` : '—'}</b><small>{t.flowAccumulation?.explanation || 'unavailable'}</small></div>
        <div className="wide"><span>DRAINAGE PROXIMITY</span><b>{t.drainage?.distanceM != null ? (t.drainage.distanceM < 30 ? 'On a mapped river reach' : `${t.drainage.distanceM.toLocaleString()} m to nearest mapped river`) : 'No mapped river within 25 km'}</b><small>{t.drainage?.note}</small></div>
      </div>
      <Provenance rows={[
        ['Elevation', t.elevation && `${t.elevation.dataset} · ${t.elevation.resolution} · ${t.elevation.method}`],
        ['Slope', t.slope && `${t.slope.dataset} · ${t.slope.resolution} · ${t.slope.method}`],
        ['Flow accumulation', t.flowAccumulation && `${t.flowAccumulation.dataset} · ${t.flowAccumulation.resolution} · ${t.flowAccumulation.method}`],
        ['Drainage', t.drainage && `${t.drainage.dataset}${t.drainage.method ? ` · ${t.drainage.method}` : ''}`],
        ['Computed', fmtDate(t.computedAt)]
      ]} />
    </>
  );
}

// ─── timeline ───────────────────────────────────────────────────
export function TimelineSection({ iv, field, sat }) {
  const ev = [];
  if (iv.metadata.constructionDate) ev.push({ d: iv.metadata.constructionDate, k: 'CONSTRUCTED', t: `${iv.type} constructed (record)` });
  for (const i of iv.metadata.inspections) ev.push({ d: i.date, k: 'INSPECTION', t: `${i.status}${i.notes ? ` — ${i.notes}` : ''}` });
  for (const p of field.photos || []) ev.push({ d: observationDate(p), k: 'FIELD PHOTO', t: `${p.link === 'LINKED' ? 'Linked' : `${p.distanceM} m away`}${p.condition ? ` · ${p.condition}` : ''} · ${gpsStatus(p).label}` });
  if (sat.data?.baseline?.acquisitionDate) ev.push({ d: sat.data.baseline.acquisitionDate, k: 'SATELLITE', t: 'Baseline Sentinel-2 scene' });
  if (sat.data?.current?.acquisitionDate) ev.push({ d: sat.data.current.acquisitionDate, k: 'SATELLITE', t: 'Current Sentinel-2 scene' });
  if (iv.metadata.evidenceReview?.reviewedAt) ev.push({ d: iv.metadata.evidenceReview.reviewedAt, k: 'REVIEW', t: `Marked reviewed — ${iv.metadata.evidenceReview.label}` });
  const rows = ev.filter((e) => e.d).sort((a, b) => new Date(b.d) - new Date(a.d));
  if (!rows.length) return <div className="er-state">No dated events for this intervention.</div>;
  return (
    <ol className="er-timeline">
      {rows.map((e, i) => (
        <li key={`${e.k}-${e.d}-${i}`} className={`k-${e.k.split(' ')[0].toLowerCase()}`}>
          <span className="er-mono">{fmtDate(e.d)}</span><b>{e.k}</b><span>{e.t}</span>
        </li>
      ))}
    </ol>
  );
}

// ─── synthesized assessment (deterministic, verified inputs only) ──
export function AssessmentSection({ ev, field, sat, ter }) {
  const f = ev.field;
  const s = sat.data?.status === 'AVAILABLE' ? sat.data : null;
  const t = ter.data?.status === 'AVAILABLE' ? ter.data : null;
  const insp = field.inspections?.[0];
  const rows = [
    ['FIELD', field.status !== 'AVAILABLE' ? 'Field records not loaded.'
      : `${f.photoCount ? `${f.photoCount} field photo(s) (${f.linkedCount} linked, ${f.nearbyCount} nearby), ${f.exifGpsCount} with EXIF GPS.` : 'No field photos.'} ${f.inspectionCount ? `${f.inspectionCount} inspection record(s); latest ${fmtDate(insp?.date)} (${insp?.status})${insp?.notes ? `: "${insp.notes}"` : ''}.` : 'No inspection records.'}`],
    ['SATELLITE', s ? `Sentinel-2 ${s.baseline.acquisitionDate} → ${s.current.acquisitionDate}, ${s.analysisArea.areaHa} ha footprint: observed NDVI ${sign(s.change.ndvi?.delta)}, NDWI ${sign(s.change.ndwi?.delta)}, NDMI ${sign(s.change.ndmi?.delta)}.${s.landCover?.transition ? ` Dominant land cover ${s.landCover.transition.from} → ${s.landCover.transition.to}.` : ''}`
      : sat.data?.status === 'NO_SUITABLE_IMAGE' ? `No valid comparison: ${sat.data.baseline?.reason || sat.data.current?.reason}` : 'No satellite comparison available.'],
    ['TERRAIN', t ? `Mean elevation ${t.elevation?.mean ?? '—'} m, mean slope ${t.slope?.mean ?? '—'}°.${t.flowAccumulation ? ` Upstream contributing area ≈ ${t.flowAccumulation.upstreamAreaKm2} km² (${t.flowAccumulation.level}).` : ''}${t.drainage?.distanceM != null ? ` Nearest mapped river: ${t.drainage.distanceM} m.` : ''}` : 'No terrain context available.'],
    ['OVERALL', `${ev.label}. ${ev.reasons.join(' ')}`]
  ];
  return (
    <div className="er-assess">
      {rows.map(([k, v]) => <div key={k} className="er-assess-row"><span>{k}</span><p>{v}</p></div>)}
      <div className="er-assess-row"><span>LIMITATIONS</span>{ev.limitations.length ? <ul>{ev.limitations.map((l) => <li key={l}>{l}</li>)}</ul> : <p>None identified from the available data.</p>}</div>
      <p className="er-dim er-small">Summarises only verified inputs on this page. Observed changes are not attributed to the intervention.</p>
    </div>
  );
}

// ─── AI brief ───────────────────────────────────────────────────
const BRIEF_LABELS = { keyFinding: 'KEY FINDING', fieldEvidence: 'FIELD EVIDENCE', satelliteObservation: 'SATELLITE OBSERVATION', terrainContext: 'TERRAIN CONTEXT', evidenceQuality: 'EVIDENCE QUALITY', limitations: 'LIMITATIONS', recommendedNextAction: 'RECOMMENDED NEXT ACTION' };
export function BriefSection({ brief, onGenerate }) {
  const b = brief.data;
  return (
    <>
      {brief.status === 'IDLE' && <div className="er-state">Optional. The AI receives only the verified facts on this page (rebuilt server-side) and every number in its answer is checked against them.</div>}
      <SectionState res={brief} what="AI brief" onRetry={onGenerate} />
      {b && b.status !== 'AVAILABLE' && (
        <div className="er-state warn"><AlertTriangle size={12} /> AI SUMMARY UNAVAILABLE — {b.reason}</div>
      )}
      {b?.status === 'AVAILABLE' && (
        <div className="er-brief">
          {Object.entries(BRIEF_LABELS).map(([k, label]) => <div key={k}><span>{label}</span><p>{b.sections[k]}</p></div>)}
          <small className="er-dim">Generated {fmtDate(b.generatedAt)} by {b.model}. Numbers verified against supplied facts.</small>
        </div>
      )}
      <button className="er-btn" onClick={onGenerate} disabled={brief.status === 'LOADING'}>
        {brief.status === 'LOADING' ? <><Loader2 size={12} className="er-spin" /> GENERATING…</> : <><Sparkles size={12} /> {b ? 'REGENERATE' : 'GENERATE'} AI EVIDENCE BRIEF</>}
      </button>
    </>
  );
}

// ─── photo viewer ───────────────────────────────────────────────
export function PhotoViewer({ photo, intervention, onClose }) {
  if (!photo) return null;
  const g = gpsStatus(photo);
  const loc = photo.location;
  const cam = photo.exif?.camera;
  const ai = photo.ai;
  return (
    <div className="er-modal" role="dialog" aria-modal="true" aria-label="Field photo evidence" onClick={onClose}>
      <div className="er-modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="er-modal-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
        <div className="er-modal-img">
          <img src={photo.photoUrl} alt="Field evidence"
            onError={(e) => { e.currentTarget.replaceWith(Object.assign(document.createElement('div'), { className: 'er-photo-missing big', textContent: 'Photo file is not available on the server.' })); }} />
        </div>
        <div className="er-modal-side">
          <div className="er-modal-title">FIELD PHOTO EVIDENCE</div>
          <dl className="er-dl">
            <dt>Intervention</dt><dd>{intervention?.name} <small>({photo.link === 'LINKED' ? 'explicitly linked' : `matched by distance, ${photo.distanceM} m`})</small></dd>
            <dt>Date</dt><dd>{fmtDate(observationDate(photo))} <small>{photo.captureTime ? '(capture time)' : '(upload time — no capture time in photo)'}</small></dd>
            <dt>GPS</dt><dd>{g.label}</dd>
            <dt>Latitude</dt><dd className="er-mono">{loc?.latitude != null ? Number(loc.latitude).toFixed(6) : '—'}</dd>
            <dt>Longitude</dt><dd className="er-mono">{loc?.longitude != null ? Number(loc.longitude).toFixed(6) : '—'}</dd>
            <dt>Condition</dt><dd>{photo.condition || 'Not recorded'}</dd>
            <dt>Notes</dt><dd>{photo.notes || '—'}</dd>
            <dt>Source</dt><dd className="er-mono">Field observation {photo.id}{photo.evidenceId ? ` · evidence ${photo.evidenceId}` : ''}</dd>
          </dl>
          <div className="er-modal-sub">EXIF</div>
          <dl className="er-dl">
            <dt>Status</dt><dd>{photo.exif?.status || '—'}</dd>
            <dt>Capture</dt><dd>{photo.exif?.captureTime ? fmtDate(photo.exif.captureTime) : '—'}</dd>
            <dt>Camera</dt><dd>{[cam?.make, cam?.model].filter(Boolean).join(' ') || '—'}{cam?.focalLength ? ` · ${cam.focalLength}` : ''}</dd>
          </dl>
          <div className="er-modal-sub"><Sparkles size={11} /> AI OBSERVATION</div>
          {!ai ? <div className="er-dim er-small">No AI analysis has been run for this photo.</div>
            : ai.fallback ? <div className="er-dim er-small">AI unavailable when this photo was processed (deterministic fallback, not shown).</div>
            : ai.status === 'AI_ERROR' ? <div className="er-dim er-small">AI analysis failed: {ai.error?.slice(0, 160)}</div>
            : (
              <div className="er-ai">
                {ai.scene && <p>{ai.scene}</p>}
                {ai.structures?.length > 0 && <ul>{ai.structures.map((st, i) => <li key={i}>{st.status === 'IDENTIFIED' ? '' : 'Possible '}{String(st.type).replace(/_/g, ' ')} — {st.condition}{st.notes ? `: ${st.notes}` : ''} <small>({st.status})</small></li>)}</ul>}
                {ai.vegetation && <p><b>Vegetation:</b> {ai.vegetation.present ? `${ai.vegetation.density || ''} ${ai.vegetation.type || ''}` : 'none visible'}</p>}
                {ai.water && <p><b>Water:</b> {ai.water.present ? ai.water.type : 'none visible'}</p>}
                {ai.hazards?.present && <p><b>Possible issues:</b> {(ai.hazards.types || []).join(', ')}</p>}
                {ai.summary && <p>{ai.summary}</p>}
                <p className="er-small"><b>Limitations:</b> {ai.uncertainty || 'Not stated.'}{ai.needsHumanReview ? ' Flagged for human review.' : ''}</p>
                {ai.model && <small className="er-dim">Model: {ai.model}</small>}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

