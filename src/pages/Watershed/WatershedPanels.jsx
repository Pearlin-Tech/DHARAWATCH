import React, { useMemo, useState } from 'react';
import { RefreshCw, Play, Pause, SkipBack, SkipForward, MapPin, Pen, Trash2, Activity, Plus, X, Eye, ClipboardCheck } from 'lucide-react';
import { WATERSHED_LAYERS, LAYER_GROUPS, paletteGradient } from '../../shared/layerRegistry.js';
import { formatArea } from '../../shared/geo.js';
import {
  INTERVENTION_TYPES, INTERVENTION_STATUSES, getInterventionStatusInfo
} from '../../services/interventionClient';

// ─── shared bits ─────────────────────────────────────────────────
const TONE = {
  ACTIVE: '#10b981', AVAILABLE: '#10b981', LIVE: '#10b981', DONE: '#10b981', SUCCESS: '#10b981',
  PARTIAL: '#f59e0b', TIMEOUT: '#f59e0b', DEVIATION: '#f59e0b', HIGH: '#ef4444', MEDIUM: '#f59e0b',
  LOADING: '#38bdf8', ERROR: '#ef4444', REJECTED: '#ef4444',
  NO_DATA: '#94a3b8', 'NO DATA': '#94a3b8', OFF: '#64748b', IDLE: '#64748b', INSUFFICIENT_DATA: '#94a3b8',
  NO_ATTENTION_ITEMS: '#10b981', WITHIN_RANGE: '#10b981', UNAVAILABLE: '#94a3b8', NO_IMAGE: '#94a3b8'
};
export function Pill({ status, label, title }) {
  const s = String(status || 'IDLE');
  const c = TONE[s] || '#94a3b8';
  return (
    <span className={`ws-pill ${s === 'LOADING' ? 'is-loading' : ''}`} style={{ color: c, borderColor: `${c}55`, background: `${c}14` }} title={title}>
      {s === 'LOADING' && <span className="ws-pill-dot" style={{ background: c }} />}
      {label ?? s.replace(/_/g, ' ')}
    </span>
  );
}
export function Retry({ onClick, label = 'RETRY' }) {
  return <button className="ws-mini-btn" onClick={onClick}><RefreshCw size={10} /> {label}</button>;
}
export function ResourceState({ res, what, loadingText }) {
  if (res.status === 'LOADING') return <div className="ws-state loading"><span className="ws-spinner sm" /> {loadingText || `Loading ${what}…`}</div>;
  if (res.status === 'TIMEOUT') return <div className="ws-state warn">TIMEOUT — {what} did not respond ({res.error?.message}). <Retry onClick={res.retry} /></div>;
  if (res.status === 'ERROR') return <div className="ws-state error">ERROR — {res.error?.code}: {res.error?.message} <Retry onClick={res.retry} /></div>;
  return null;
}
const fmt = (v, d = 3) => (v == null || !Number.isFinite(v) ? '—' : Number(v).toFixed(d));
const signed = (v, d = 3) => (v == null ? '—' : `${v > 0 ? '+' : ''}${Number(v).toFixed(d)}`);

// ─── FINGERPRINT ─────────────────────────────────────────────────
const METRIC_ROWS = [
  { key: 'ndvi', label: 'NDVI', sub: 'Vegetation', color: '#10b981', min: -0.2, max: 0.8, layer: 'ndvi' },
  { key: 'ndwi', label: 'NDWI', sub: 'Surface water', color: '#3b82f6', min: -0.6, max: 0.4, layer: 'ndwi' },
  { key: 'ndmi', label: 'NDMI', sub: 'Vegetation moisture', color: '#06b6d4', min: -0.4, max: 0.6, layer: 'ndmi' }
];

export function fingerprintSummary(res) {
  if (res.status !== 'DONE') return { status: res.status, label: res.status === 'IDLE' ? 'NO CONTEXT' : res.status };
  const s = res.data.summary || { live: 0, total: 3 };
  return { status: s.live === s.total ? 'AVAILABLE' : s.live ? 'PARTIAL' : 'NO_DATA', label: `${s.live}/${s.total} LIVE METRICS` };
}

export function FingerprintBody({ ctx, res, onShowLayer, onOpenDetail }) {
  if (!ctx) return <div className="ws-empty">Select a watershed — search, pick a demo, or double-click the map.</div>;
  const fp = res.data;
  return (
    <div className="fp-body">
      <ResourceState res={res} what="Earth observation fingerprint" loadingText="Computing Sentinel-2 NDVI · NDWI · NDMI over the active geometry…" />
      {METRIC_ROWS.map((r) => {
        const m = fp?.metrics?.[r.key];
        const st = res.status === 'LOADING' ? 'LOADING' : m?.status || (res.status === 'DONE' ? 'NO_DATA' : res.status);
        const pct = m?.value == null ? 0 : Math.max(2, Math.min(100, ((m.value - r.min) / (r.max - r.min)) * 100));
        return (
          <button key={r.key} className="fp-metric" onClick={() => onShowLayer(r.layer)} title={`Show ${r.label} layer on the map`}>
            <div className="fp-metric-head">
              <span className="fp-metric-label">{r.label}<small>{r.sub}</small></span>
              <span className="fp-metric-value">{m?.value != null ? fmt(m.value) : ''}</span>
              <Pill status={st} label={st === 'AVAILABLE' ? 'LIVE' : undefined} />
            </div>
            <div className="fp-track"><div className="fp-fill" style={{ width: `${pct}%`, background: r.color }} /></div>
            {m?.status === 'AVAILABLE' && (
              <div className="fp-prov">{m.datasetLabel} · {m.windowStart} → {m.windowEnd} · {m.imageCount} scenes · {m.formula} · zonal mean @ {m.analysisScaleM} m</div>
            )}
            {m && m.status !== 'AVAILABLE' && m.reason && <div className="fp-prov warn">{m.reason}</div>}
          </button>
        );
      })}
      {fp && (
        <>
          <div className="fp-sub-row">
            <span className="fp-sub-label">LAND COVER</span>
            {fp.metrics.landCover?.status === 'AVAILABLE' ? (
              <>
                <div className="lc-bar">{fp.metrics.landCover.classes.map((c) => <span key={c.id} style={{ width: `${c.share * 100}%`, background: c.color }} title={`${c.name} ${(c.share * 100).toFixed(1)}%`} />)}</div>
                <span className="fp-sub-val">{fp.metrics.landCover.top.name} {(fp.metrics.landCover.top.share * 100).toFixed(0)}%</span>
              </>
            ) : <Pill status={fp.metrics.landCover?.status} />}
          </div>
          <div className="fp-sub-row">
            <span className="fp-sub-label">DRAINAGE</span>
            {fp.metrics.drainage?.status === 'AVAILABLE'
              ? <span className="fp-sub-val">{fp.metrics.drainage.segments.toLocaleString()} reaches · {fp.metrics.drainage.lengthKm?.toLocaleString()} km</span>
              : <Pill status={fp.metrics.drainage?.status} />}
          </div>
        </>
      )}
      {ctx && <button className="ws-link-btn" onClick={onOpenDetail}><Eye size={11} /> OPEN WATERSHED INTELLIGENCE</button>}
    </div>
  );
}

// ─── LAYERS ──────────────────────────────────────────────────────
function Legend({ id, meta }) {
  const def = WATERSHED_LAYERS[id];
  const lg = meta?.legend || def.legend;
  if (!lg) return null;
  if (lg.type === 'classes') {
    return <div className="lg-classes">{lg.items.map((i) => <span key={i.label}><i style={{ background: i.color }} />{i.label}</span>)}</div>;
  }
  if (lg.type === 'text') return <div className="lg-text">{lg.text}</div>;
  const min = lg.min ?? def.legend?.min, max = lg.max ?? def.legend?.max;
  return (
    <div className="lg-gradient">
      <div className="lg-ramp" style={{ background: paletteGradient(id) }} />
      <div className="lg-labels"><span>{min}{lg.unit ? ` ${lg.unit}` : ''} · {def.legend?.minLabel}</span><span>{def.legend?.maxLabel} · {max}{lg.unit ? ` ${lg.unit}` : ''}</span></div>
    </div>
  );
}

export function LayersBody({ ctx, layers, onToggle, onOpacity, onReset }) {
  const groups = useMemo(() => LAYER_GROUPS.map((g) => [g, Object.values(WATERSHED_LAYERS).filter((l) => l.group === g)]), []);
  return (
    <div className="ly-body">
      {!ctx && <div className="ws-empty">Layers load for the active watershed.</div>}
      {groups.map(([g, list]) => (
        <div key={g} className="ly-group">
          <div className="ly-group-head">{g}</div>
          {list.map((def) => {
            const l = layers[def.id];
            const status = !ctx ? 'OFF' : l.status;
            return (
              <div key={def.id} className={`ly-row ${l.enabled ? 'on' : ''}`} data-layer={def.id}>
                <div className="ly-line">
                  <button className="ly-toggle" role="switch" aria-checked={l.enabled} disabled={!ctx} onClick={() => onToggle(def.id)}
                    style={{ borderColor: def.color, background: l.enabled ? def.color : 'transparent' }} title={l.enabled ? 'Hide layer' : 'Show layer'} />
                  <span className="ly-label" onClick={() => ctx && onToggle(def.id)}>{def.label}</span>
                  {def.coarseResolution && <span className="ly-tag">{def.resolution}</span>}
                  <Pill status={status} label={status === 'NO_DATA' ? 'NO DATA' : undefined} title={l.error || ''} />
                </div>
                {l.enabled && ctx && (
                  <div className="ly-detail">
                    <label className="ly-opacity">
                      <span>OPACITY</span>
                      <input type="range" min="0" max="1" step="0.05" value={l.opacity} onChange={(e) => onOpacity(def.id, parseFloat(e.target.value))} />
                      <span className="ly-op-val">{Math.round(l.opacity * 100)}%</span>
                    </label>
                    {l.status === 'LOADING' && <div className="ly-note">{l.meta?.tileUrl ? `Earth Engine rendering tiles… ${l.tiles} loaded so far` : 'Requesting Earth Engine tile layer…'}</div>}
                    {(l.status === 'NO_DATA' || l.status === 'ERROR') && <div className={`ly-note ${l.status === 'ERROR' ? 'err' : ''}`}>{l.error}{l.meta?.checked ? ` (checked ${l.meta.checked.start} → ${l.meta.checked.end})` : ''}</div>}
                    {def.id !== 'boundary' && <Legend id={def.id} meta={l.meta} />}
                    <div className="ly-prov">
                      {def.dataset} · {def.resolution}
                      {l.meta?.windowStart ? ` · ${l.meta.windowStart} → ${l.meta.windowEnd}` : l.meta?.date ? ` · ${l.meta.date}` : ''}
                      {l.meta?.imageCount ? ` · ${l.meta.imageCount} scenes` : ''}
                      {l.tiles ? ` · ${l.tiles} tiles rendered` : ''}
                      {l.meta?.note ? ` · ${l.meta.note}` : ''}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
      <button className="ws-mini-btn wide" onClick={onReset}>RESET LAYERS</button>
    </div>
  );
}

// ─── TIMELINE ────────────────────────────────────────────────────
function IndexChart({ series }) {
  const pts = series.filter((s) => s.status === 'AVAILABLE');
  if (pts.length < 1) return null;
  const W = 300, H = 74, pad = 4;
  const keys = [['ndvi', '#10b981'], ['ndwi', '#3b82f6'], ['ndmi', '#06b6d4']];
  const vals = pts.flatMap((p) => keys.map(([k]) => p[k])).filter((v) => v != null);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const sx = (i) => pad + (series.length > 1 ? (i / (series.length - 1)) * (W - 2 * pad) : W / 2);
  const sy = (v) => H - pad - ((v - lo) / (hi - lo || 1)) * (H - 2 * pad);
  return (
    <svg className="tl-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {keys.map(([k, c]) => {
        const d = series.map((s, i) => (s.status === 'AVAILABLE' && s[k] != null ? `${sx(i)},${sy(s[k])}` : null)).filter(Boolean);
        return (
          <g key={k}>
            {d.length > 1 && <polyline points={d.join(' ')} fill="none" stroke={c} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />}
            {d.map((p) => { const [x, y] = p.split(','); return <circle key={p} cx={x} cy={y} r="2" fill={c} />; })}
          </g>
        );
      })}
    </svg>
  );
}

export function TimelineBody({ ctx, res, idx }) {
  const [sel, setSel] = useState(null);
  const [playing, setPlaying] = useState(false);
  const obs = res.data?.observations || [];
  React.useEffect(() => { setSel(null); setPlaying(false); }, [ctx?.key]);
  React.useEffect(() => {
    if (!playing || !obs.length) return undefined;
    const t = setInterval(() => setSel((i) => { const n = i == null ? 0 : i + 1; if (n >= obs.length) { setPlaying(false); return i; } return n; }), 700);
    return () => clearInterval(t);
  }, [playing, obs.length]);
  if (!ctx) return <div className="ws-empty">Select a watershed to load Sentinel-2 observations.</div>;
  const t0 = obs.length ? new Date(obs[0].date).getTime() : 0;
  const span = obs.length ? (new Date(obs[obs.length - 1].date).getTime() - t0) || 1 : 1;
  const o = sel != null ? obs[sel] : null;
  const series = idx.data?.series || [];
  return (
    <div className="tl-body">
      <ResourceState res={res} what="Sentinel-2 acquisition list" loadingText="Listing real Sentinel-2 acquisitions over the area…" />
      {res.status === 'DONE' && res.data.status === 'NO_DATA' && <div className="ws-state">NO DATA — {res.data.message} ({res.data.dateRange.start} → {res.data.dateRange.end})</div>}
      {obs.length > 0 && (
        <>
          <div className="tl-head">
            <button className="tl-btn" aria-label="Previous" onClick={() => setSel((i) => Math.max(0, (i ?? obs.length) - 1))}><SkipBack size={11} /></button>
            <button className="tl-btn" aria-label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying((p) => !p)}>{playing ? <Pause size={11} /> : <Play size={11} />}</button>
            <button className="tl-btn" aria-label="Next" onClick={() => setSel((i) => Math.min(obs.length - 1, (i ?? -1) + 1))}><SkipForward size={11} /></button>
            <span className="tl-stat"><b>{obs.length}</b> dates · {res.data.totalScenes.toLocaleString()} scenes · {res.data.clearObservations} with &lt;30% cloud</span>
            <span className="tl-range">{res.data.dateRange.start} → {res.data.dateRange.end}</span>
          </div>
          <div className="tl-ribbon">
            <div className="tl-track" />
            {obs.map((ob, i) => (
              <button key={ob.date} className={`tl-obs ${i === sel ? 'active' : ''}`} aria-label={ob.date}
                style={{ left: `${((new Date(ob.date).getTime() - t0) / span) * 100}%`, opacity: 1 - Math.min(0.75, ob.cloudCover / 120), background: ob.cloudCover < 30 ? '#38bdf8' : '#64748b' }}
                title={`${ob.date} · ${ob.scenes} scenes · cloud ${ob.cloudCover}%`} onClick={() => setSel(i)} />
            ))}
          </div>
          <div className="tl-selected">
            {o ? <>
              <b>{o.date}</b> · {o.scenes} scene{o.scenes > 1 ? 's' : ''} · mean cloud {o.cloudCover}% · <span className="mono" title={o.sampleImageId}>{o.sampleImageId.split('/').pop()}</span>
            </> : <span className="dim">Select a date — dots are real acquisitions (blue = &lt;30% cloud). Footprint test: {res.data.lineage?.footprintTest}.</span>}
          </div>
        </>
      )}
      <div className="tl-idx">
        <div className="tl-idx-head">
          <span>MONTHLY INDICES</span>
          <span className="lg-dots"><i style={{ background: '#10b981' }} />NDVI <i style={{ background: '#3b82f6' }} />NDWI <i style={{ background: '#06b6d4' }} />NDMI</span>
          <Pill status={idx.status === 'DONE' ? idx.data.status : idx.status} />
        </div>
        <ResourceState res={idx} what="monthly NDVI/NDWI/NDMI" loadingText="Computing monthly cloud-masked composites (independent of the date list)…" />
        {series.length > 0 && (
          <>
            <IndexChart series={series} />
            <div className="tl-idx-table">
              {series.map((s) => (
                <span key={s.month} title={s.status === 'AVAILABLE' ? `${s.imageCount} scenes` : s.reason || s.status}>
                  <b>{s.month.slice(2)}</b>{s.status === 'AVAILABLE' ? <>{fmt(s.ndvi, 2)}<br />{fmt(s.ndwi, 2)}<br />{fmt(s.ndmi, 2)}</> : <em>{s.status.replace('_', ' ')}</em>}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── ATTENTION ───────────────────────────────────────────────────
export function attentionStatus(res) {
  if (res.status !== 'DONE') return res.status;
  return res.data.status;
}
export function AttentionBody({ ctx, res, onCompare }) {
  if (!ctx) return <div className="ws-empty">Select a watershed to check change indicators.</div>;
  const a = res.data;
  return (
    <div className="att-body">
      <ResourceState res={res} what="attention analysis" loadingText="Comparing current indices with the same window one year earlier…" />
      {a && <div className={`ws-state ${a.status === 'AVAILABLE' ? 'warn' : ''}`}>{a.message}</div>}
      {(a?.items || []).map((it) => (
        <div key={it.id} className="att-card">
          <div className="att-card-head"><b>{it.type.replace(/_/g, ' ')}</b><Pill status={it.severity} /></div>
          <div className="att-card-reason">{it.reason}</div>
          <div className="att-card-meta">now {fmt(it.currentValue)} · ref {fmt(it.referenceValue)} · Δ {signed(it.delta)} · {it.source} · {it.date}</div>
          <div className="att-card-actions"><button className="ws-mini-btn" onClick={onCompare}>COMPARE</button></div>
        </div>
      ))}
      {a?.comparisons?.length > 0 && (
        <table className="att-table">
          <thead><tr><th>Indicator</th><th>Now</th><th>Year ago</th><th>Δ</th><th /></tr></thead>
          <tbody>{a.comparisons.map((c) => (
            <tr key={c.metric} title={`${c.source} · ${c.currentWindow} vs ${c.referenceWindow}`}>
              <td>{c.metric}</td><td>{fmt(c.current)}</td><td>{fmt(c.reference)}</td><td>{signed(c.delta)}</td><td><Pill status={c.status} label={c.status === 'WITHIN_RANGE' ? 'OK' : c.status === 'NO_DATA' ? 'NO DATA' : 'Δ'} /></td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {a?.lineage?.current && <div className="fp-prov">Current {a.lineage.current} vs reference {a.lineage.reference} · SMAP {a.smapStatus?.replace('_', ' ')}</div>}
    </div>
  );
}

// ─── INTERVENTIONS ───────────────────────────────────────────────
function InterventionForm({ initial, ctx, onSubmit, onCancel, busy }) {
  const c = ctx?.centroid;
  const [f, setF] = useState({
    name: initial?.name || '', type: initial?.type || INTERVENTION_TYPES[0], status: initial?.status || 'PLANNED',
    lat: initial?.coordinates?.lat ?? (c ? +c.lat.toFixed(5) : ''), lng: initial?.coordinates?.lng ?? (c ? +c.lon.toFixed(5) : ''),
    notes: initial?.notes || '', constructionDate: initial?.constructionDate?.slice(0, 10) || ''
  });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const valid = f.name.trim() && Number.isFinite(parseFloat(f.lat)) && Number.isFinite(parseFloat(f.lng));
  return (
    <div className="int-form">
      <input className="ws-input" placeholder="Name *" value={f.name} onChange={set('name')} />
      <div className="int-form-row">
        <select className="ws-input" value={f.type} onChange={set('type')}>{INTERVENTION_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        <select className="ws-input" value={f.status} onChange={set('status')}>{INTERVENTION_STATUSES.map((s) => <option key={s} value={s}>{getInterventionStatusInfo(s).label}</option>)}</select>
      </div>
      <div className="int-form-row">
        <input className="ws-input" placeholder="Latitude *" value={f.lat} onChange={set('lat')} />
        <input className="ws-input" placeholder="Longitude *" value={f.lng} onChange={set('lng')} />
      </div>
      <input className="ws-input" type="date" value={f.constructionDate} onChange={set('constructionDate')} title="Construction date" />
      <textarea className="ws-input" rows={2} placeholder="Notes" value={f.notes} onChange={set('notes')} />
      <div className="int-form-row end">
        <button className="ws-mini-btn" onClick={onCancel}>CANCEL</button>
        <button className="ws-mini-btn primary" disabled={!valid || busy} onClick={() => onSubmit({
          name: f.name.trim(), type: f.type, status: f.status, coordinates: { lat: parseFloat(f.lat), lng: parseFloat(f.lng) },
          notes: f.notes, constructionDate: f.constructionDate ? new Date(f.constructionDate).toISOString() : null
        })}>{busy ? 'SAVING…' : initial?.id ? 'UPDATE' : 'CREATE'}</button>
      </div>
    </div>
  );
}

function InspectionForm({ onSubmit, onCancel, busy }) {
  const [f, setF] = useState({ date: new Date().toISOString().slice(0, 10), status: 'COMPLETED', inspector: 'FIELD_TEAM', notes: '' });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <div className="int-form">
      <div className="int-form-row">
        <input className="ws-input" type="date" value={f.date} onChange={set('date')} />
        <select className="ws-input" value={f.status} onChange={set('status')}>{['COMPLETED', 'IN_PROGRESS', 'FAILED', 'SCHEDULED'].map((s) => <option key={s}>{s}</option>)}</select>
      </div>
      <input className="ws-input" placeholder="Inspector" value={f.inspector} onChange={set('inspector')} />
      <textarea className="ws-input" rows={2} placeholder="Inspection notes" value={f.notes} onChange={set('notes')} />
      <div className="int-form-row end">
        <button className="ws-mini-btn" onClick={onCancel}>CANCEL</button>
        <button className="ws-mini-btn primary" disabled={busy} onClick={() => onSubmit(f)}>ADD INSPECTION</button>
      </div>
    </div>
  );
}

export function InterventionsBody({ ctx, res, api, onFly, onField, onReview, focusId }) {
  const [editing, setEditing] = useState(null); // null | {} (new) | intervention
  const [inspecting, setInspecting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  if (!ctx) return <div className="ws-empty">Select a watershed to manage its interventions.</div>;
  const list = res.status === 'DONE' ? res.data : [];
  const run = async (fn) => { setBusy(true); setErr(null); try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <div className="int-body">
      <ResourceState res={res} what="interventions" />
      {res.status === 'DONE' && list.length === 0 && !editing && <div className="ws-state">NO INTERVENTIONS FOUND for {ctx.name}.</div>}
      {err && <div className="ws-state error">{err}</div>}
      {list.map((iv) => {
        const si = getInterventionStatusInfo(iv.status);
        const last = iv.inspections?.[iv.inspections.length - 1];
        return (
          <div key={iv.id} className={`int-card ${focusId === iv.id ? 'focused' : ''}`} style={{ borderLeftColor: si.color }}>
            <div className="int-card-head">
              <div><b>{iv.name}</b><small>{iv.type}</small></div>
              <span className="int-status" style={{ color: si.color, background: si.bg }}>{si.label}</span>
            </div>
            {iv.notes && <div className="int-notes">{iv.notes}</div>}
            <div className="int-meta">
              {iv.coordinates && <span>{iv.coordinates.lat?.toFixed?.(4)}, {iv.coordinates.lng?.toFixed?.(4)}</span>}
              {iv.constructionDate && <span>Built {iv.constructionDate.slice(0, 10)}</span>}
              <span>{iv.inspections?.length || 0} inspection(s){last ? ` · last ${last.date?.slice(0, 10)} ${last.status}` : ''}</span>
            </div>
            <div className="int-actions">
              <button className="ws-mini-btn" onClick={() => onFly(iv)} title="Fly to"><MapPin size={10} /></button>
              {onReview && <button className="ws-mini-btn primary" onClick={() => onReview(iv)} title="Open Intervention Evidence Review"><ClipboardCheck size={10} /> REVIEW EVIDENCE</button>}
              <button className="ws-mini-btn" onClick={() => { setInspecting(iv); setEditing(null); }}><Activity size={10} /> INSPECT</button>
              <button className="ws-mini-btn" onClick={() => { setEditing(iv); setInspecting(null); }}><Pen size={10} /> EDIT</button>
              <button className="ws-mini-btn danger" disabled={busy} onClick={() => window.confirm(`Delete intervention "${iv.name}"?`) && run(() => api.remove(iv.id))}><Trash2 size={10} /></button>
            </div>
            {inspecting?.id === iv.id && <InspectionForm busy={busy} onCancel={() => setInspecting(null)} onSubmit={(d) => run(async () => { await api.inspect(iv.id, d); setInspecting(null); })} />}
            {editing?.id === iv.id && <InterventionForm initial={iv} ctx={ctx} busy={busy} onCancel={() => setEditing(null)} onSubmit={(d) => run(async () => { await api.update(iv.id, d); setEditing(null); })} />}
          </div>
        );
      })}
      {editing && !editing.id && <InterventionForm initial={null} ctx={ctx} busy={busy} onCancel={() => setEditing(null)} onSubmit={(d) => run(async () => { await api.create(d); setEditing(null); })} />}
      <div className="int-footer">
        {!editing && <button className="ws-mini-btn primary" onClick={() => setEditing({})}><Plus size={10} /> ADD INTERVENTION</button>}
        <button className="ws-mini-btn" onClick={onField}>FIELD OBSERVATION</button>
      </div>
    </div>
  );
}

// ─── CANDIDATES (draw analysis / point resolution) ──────────────
export function CandidateList({ title, candidates, activeId, onView, onSelect, onHover, extra }) {
  const groups = useMemo(() => {
    const g = new Map();
    candidates.forEach((c, i) => { const k = c.level ?? '—'; if (!g.has(k)) g.set(k, []); g.get(k).push({ ...c, _n: i + 1 }); });
    return [...g.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
  }, [candidates]);
  const n = candidates.length;
  return (
    <div className="cand-wrap">
      <div className="cand-head">
        <b>{n} WATERSHED{n === 1 ? '' : 'S'} FOUND</b>
        {title && <span>{title}</span>}
        <span className="cand-range">{n ? `1–${n} of ${n}` : '0 of 0'}</span>
      </div>
      {extra}
      <div className="cand-list" data-testid="candidate-list">
        {groups.map(([lvl, list]) => (
          <div key={lvl}>
            <div className="cand-level">LEVEL {lvl} <span>{list.length}</span></div>
            {list.map((c) => (
              <div key={c.id} className={`cand-row ${c.id === activeId ? 'active' : ''}`} onMouseEnter={() => onHover?.(c)} onMouseLeave={() => onHover?.(null)}>
                <span className="cand-n">{c._n}</span>
                <div className="cand-main">
                  <div className="cand-name" title={c.name}>{c.name}</div>
                  <div className="cand-meta">
                    L{c.level} · {formatArea(c.areaKm2)}
                    {c.overlapPercent != null && ` · ${c.overlapPercent.toFixed(c.overlapPercent < 10 ? 1 : 0)}% of drawn area`}
                    {c.coveragePercent != null && ` · covers ${c.coveragePercent.toFixed(c.coveragePercent < 10 ? 1 : 0)}% of basin`}
                    {' · '}{c.technicalName || c.sourceFeatureId}
                  </div>
                </div>
                <div className="cand-btns">
                  <button className="ws-mini-btn" onClick={() => onView(c)} title="Fly to and highlight">VIEW</button>
                  <button className="ws-mini-btn primary" onClick={() => onSelect(c)} title="Make active watershed">SELECT</button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CloseX({ onClick }) {
  return <button className="panel-action-btn" onClick={onClick} aria-label="Close"><X size={14} /></button>;
}
