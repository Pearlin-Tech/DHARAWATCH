import React from 'react';
import { X, Crosshair, Layers, MapPin } from 'lucide-react';
import { formatArea } from '../../shared/geo.js';

const Spinner = () => <span className="ws-spinner sm" />;

function Metric({ k, v }) {
  return (
    <div className="sel-metric">
      <span className="sel-k">{k}</span>
      <span className="sel-v">{v ?? '—'}</span>
    </div>
  );
}

function CandidateRow({ c, selected, onSelect, onHover, onOpen }) {
  return (
    <label
      className={`sel-cand ${selected ? 'selected' : ''} ${c.id ? '' : 'disabled'}`}
      onMouseEnter={() => onHover?.(c.id)}
      onMouseLeave={() => onHover?.(null)}
    >
      <input type="radio" name="ws-cand" checked={selected} onChange={() => onSelect(c.id)} />
      <div className="sel-cand-main">
        <div className="sel-cand-name">{c.name}</div>
        <div className="sel-cand-meta">
          <span>LEVEL {c.level}</span>
          <span>{formatArea(c.areaKm2)}</span>
          {c.overlapPercent != null && <span className="ov">{c.overlapPercent >= 99.5 ? '100' : c.overlapPercent.toFixed(c.overlapPercent < 10 ? 1 : 0)}% overlap</span>}
          <span className="src">HYDROSHEDS</span>
        </div>
      </div>
      <button type="button" className="sel-open" onClick={(e) => { e.preventDefault(); onOpen(c); }}>OPEN</button>
    </label>
  );
}

/**
 * The single "pick a watershed" surface — used for searched places AND drawn areas.
 * It never auto-selects when several watersheds are plausible, and never invents one when none exist.
 */
export default function SelectionPanel({ selection, onSelectId, onHover, onOpen, onOpenSelected, onUseDrawn, onDiscard }) {
  if (!selection) return null;
  const { kind, status, place, metrics, drawn, candidates = [], selectedId, error } = selection;
  const m = drawn || metrics;
  const sel = candidates.find(c => c.id === selectedId) || null;
  const isDrawn = kind === 'drawn';
  const recommended = selection.recommendedId && candidates.find(c => c.id === selection.recommendedId);
  const multiLevel = new Set(candidates.map(c => c.level)).size > 1;

  let headline = 'WATERSHEDS FOUND';
  if (status === 'ANALYZING' || status === 'LOADING') headline = isDrawn ? 'ANALYZING DRAWN AREA…' : 'RESOLVING WATERSHED…';
  else if (status === 'EMPTY') headline = isDrawn ? 'NO MATCHING WATERSHED FOUND' : 'WATERSHED NOT RESOLVED';
  else if (status === 'ERROR') headline = 'WATERSHED RESOLUTION UNAVAILABLE';
  else if (isDrawn && recommended) headline = 'WATERSHED DETECTED';
  else if (isDrawn) headline = 'WATERSHEDS FOUND · AREA CROSSES BOUNDARIES';
  else headline = 'WATERSHEDS CONTAINING THIS LOCATION';

  return (
    <aside className="ws-selection-panel" aria-label="Watershed selection">
      <header className="sel-head">
        <div className="sel-title">
          {isDrawn ? <Layers size={13} /> : <MapPin size={13} />}
          <span>{isDrawn ? 'DRAWN AREA' : 'LOCATION FOUND'}</span>
        </div>
        <button className="sel-x" onClick={onDiscard} title="Close"><X size={14} /></button>
      </header>

      {!isDrawn && place && (
        <div className="sel-place">
          <div className="sel-place-name">{place.name}</div>
          <div className="sel-place-sub">
            {[place.type, place.country || place.region].filter(Boolean).join(' · ')}
            <span className="mono"> · {place.lat.toFixed(4)}°, {place.lon.toFixed(4)}°</span>
          </div>
        </div>
      )}

      {isDrawn && m && (
        <div className="sel-metrics">
          <Metric k="AREA" v={formatArea(m.areaKm2)} />
          <Metric k="PERIMETER" v={m.perimeterKm != null ? `${m.perimeterKm.toFixed(1)} km` : null} />
          <Metric k="CENTROID" v={m.centroid ? `${m.centroid.lat.toFixed(3)}°, ${m.centroid.lon.toFixed(3)}°` : null} />
          <Metric k="BBOX" v={m.bbox ? `${m.bbox[0].toFixed(2)}, ${m.bbox[1].toFixed(2)} → ${m.bbox[2].toFixed(2)}, ${m.bbox[3].toFixed(2)}` : null} />
          <Metric k="COUNTRY" v={m.countries?.length ? m.countries.join(' / ') : (status === 'ANALYZING' ? '…' : '—')} />
          <Metric k="WATERSHEDS" v={status === 'ANALYZING' ? '…' : candidates.length} />
        </div>
      )}

      <div className={`sel-headline ${status === 'EMPTY' || status === 'ERROR' ? 'warn' : ''}`}>
        {(status === 'ANALYZING' || status === 'LOADING') && <Spinner />}
        {headline}
      </div>

      {status === 'READY' && isDrawn && recommended && (
        <p className="sel-note">This polygon lies within <strong>{recommended.name}</strong> ({recommended.overlapPercent >= 99.5 ? '100' : recommended.overlapPercent.toFixed(0)}% overlap). Pick the basin scale below, or analyze the drawn area itself.</p>
      )}
      {status === 'READY' && isDrawn && !recommended && (
        <p className="sel-note">The polygon intersects several basins. Select the watershed you want to open — none is chosen for you.</p>
      )}
      {status === 'READY' && !isDrawn && candidates.length > 1 && (
        <p className="sel-note">HydroSHEDS is hierarchical — choose the scale to analyze. {recommended ? '' : 'Level 7 is a typical sub-basin scale.'}</p>
      )}

      {status === 'READY' && (
        <div className="sel-list" role="radiogroup">
          {candidates.map(c => (
            <CandidateRow key={c.id} c={c} selected={c.id === selectedId} onSelect={onSelectId} onHover={onHover} onOpen={onOpen} />
          ))}
        </div>
      )}

      {(status === 'EMPTY') && (
        <p className="sel-note warn">
          {isDrawn
            ? 'No HydroSHEDS watershed intersects this polygon. You can still analyze the drawn geometry directly.'
            : 'The location was found, but no HydroSHEDS watershed intersects it (ocean / uncovered area).'}
        </p>
      )}
      {status === 'ERROR' && (
        <p className="sel-note warn"><strong>{error?.code || 'ANALYSIS_FAILED'}</strong> — {error?.message || 'Resolution failed'}</p>
      )}

      <footer className="sel-actions">
        {status === 'READY' && (
          <button className="sel-btn primary" disabled={!sel} onClick={onOpenSelected}>
            <Crosshair size={12} /> {isDrawn && recommended && selectedId === recommended.id ? 'OPEN WATERSHED' : 'OPEN SELECTED'}
          </button>
        )}
        {isDrawn && status !== 'ANALYZING' && (
          <button className="sel-btn" onClick={onUseDrawn}>
            {status === 'EMPTY' || status === 'ERROR' ? 'ANALYZE CUSTOM AREA' : 'ANALYZE DRAWN AREA'}
          </button>
        )}
        <button className="sel-btn ghost" onClick={onDiscard}>{isDrawn ? 'DISCARD' : 'CLOSE'}</button>
      </footer>
    </aside>
  );
}
