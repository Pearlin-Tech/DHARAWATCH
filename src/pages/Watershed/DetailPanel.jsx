import React, { useRef, useState } from 'react';
import { ExternalLink, Sparkles } from 'lucide-react';
import { formatArea } from '../../shared/geo.js';
import { Pill, ResourceState, Retry } from './WatershedPanels';

const SECTIONS = [
  ['overview', 'OVERVIEW'], ['geography', 'GEOGRAPHY'], ['hydrology', 'HYDROLOGY'], ['eo', 'EARTH OBSERVATION'],
  ['landcover', 'LAND COVER'], ['temporal', 'TEMPORAL CHANGE'], ['interventions', 'INTERVENTIONS'], ['field', 'FIELD EVIDENCE'],
  ['history', 'HISTORY'], ['media', 'MEDIA'], ['sources', 'SOURCES'], ['ai', 'AI BRIEF']
];
const n0 = (v) => (v == null ? '—' : Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 }));
const f3 = (v) => (v == null ? '—' : Number(v).toFixed(3));

function KV({ k, v, src }) {
  return <div className="dt-kv"><span className="dt-k">{k}</span><span className="dt-v">{v ?? '—'}</span>{src && <span className="dt-src">{src}</span>}</div>;
}
function Section({ id, title, status, children, refs }) {
  return (
    <section className="dt-sec" ref={(el) => { refs.current[id] = el; }} data-section={id}>
      <h4>{title}{status && <Pill status={status} />}</h4>
      {children}
    </section>
  );
}

export default function DetailBody({ ctx, intel, media, fp, tl, tli, att, ints, field, brief, onBrief, onSelectId }) {
  const refs = useRef({});
  const bodyRef = useRef(null);
  const [imgIdx, setImgIdx] = useState(0);
  React.useEffect(() => setImgIdx(0), [ctx?.key]);
  if (!ctx) return <div className="ws-empty">Select a watershed to open its intelligence profile.</div>;
  const I = intel.data;
  const ov = I?.overview;
  const geo = I?.geography;
  const hyd = I?.hydrology;
  const hist = I?.history;
  const m = fp.data?.metrics;
  const images = media.data?.images || [];
  const img = images[imgIdx];
  const myObs = (field.data || []).filter((o) => o.watershedId === ctx.id);
  const jump = (id) => refs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="dt-root" ref={bodyRef}>
      <nav className="dt-nav">{SECTIONS.map(([id, label]) => <button key={id} onClick={() => jump(id)}>{label}</button>)}</nav>
      <div className="dt-scroll">
        <Section id="overview" title="OVERVIEW" refs={refs}>
          <div className="dt-hero">
            {img ? <img src={img.url} alt={img.title} loading="lazy" /> : <div className="dt-hero-ph">{media.status === 'LOADING' ? 'Loading image…' : 'NO IMAGE AVAILABLE'}</div>}
            <div className="dt-hero-txt">
              <div className="dt-name">{ctx.name}</div>
              <div className="dt-sub">{ctx.isCustom ? 'Custom analysis area' : `Watershed · HydroSHEDS Level ${ctx.level}`} · {formatArea(ctx.areaKm2)}</div>
              <div className="dt-tech">{ctx.technicalName || ctx.id} · {ctx.id}</div>
              {ctx.metadata?.description && <div className="dt-desc">{ctx.metadata.description}</div>}
            </div>
          </div>
          <KV k="Name source" v={ov?.naming?.method || ctx.naming?.method || (ctx.isCustom ? 'User-provided name' : '—')} />
          {(ov?.naming?.scope || ctx.naming?.scope) && <KV k="Name scope" v={(ov?.naming?.scope || ctx.naming.scope).replace(/_/g, ' ')} />}
          <KV k="Main river" v={ctx.river || hyd?.outletReach?.riverSystem || 'Not named in dataset'} src="HydroSHEDS BAS_NAME / BB_NAME" />
          <KV k="Record" v={ctx.isDemo ? 'Curated demo' : ctx.isSaved ? 'Saved by you' : ctx.isCustom ? 'Unsaved draft' : 'HydroBASINS feature'} />
        </Section>

        <Section id="geography" title="GEOGRAPHY" status={intel.status === 'DONE' ? null : intel.status} refs={refs}>
          <ResourceState res={intel} what="watershed intelligence" loadingText="Loading geography, hierarchy and hydrology from HydroSHEDS…" />
          <KV k="Area" v={formatArea(ctx.areaKm2)} src="geodesic, active geometry" />
          {geo && <>
            <KV k="Perimeter" v={geo.perimeterKm ? `${n0(geo.perimeterKm)} km` : '—'} />
            <KV k="Centroid" v={geo.centroid ? `${geo.centroid.lat.toFixed(4)}°, ${geo.centroid.lon.toFixed(4)}°` : '—'} />
            <KV k="Countries" v={geo.countries?.length ? geo.countries.join(', ') : geo.countriesStatus} src="USDOS LSIB 2017" />
            <KV k="Near" v={geo.nearPlace} src="OSM Nominatim (centroid)" />
            {geo.pfafstetter != null && <KV k="Pfafstetter code" v={geo.pfafstetter} src="HydroBASINS" />}
            {geo.upstreamAreaKm2 != null && <KV k="Upstream area" v={`${n0(geo.upstreamAreaKm2)} km²`} src="HydroBASINS UP_AREA" />}
            {geo.coastal != null && <KV k="Drains to coast" v={geo.coastal ? 'Yes (coastal unit)' : 'No'} />}
            {geo.endorheic != null && <KV k="Endorheic" v={geo.endorheic ? 'Yes' : 'No'} />}
          </>}
          {I?.hierarchy?.parent && (
            <div className="dt-hier">
              <span className="dt-k">Parent basin</span>
              <button className="ws-link-btn" onClick={() => onSelectId(I.hierarchy.parent.id)}>L{I.hierarchy.parent.level} · Pfaf {I.hierarchy.parent.pfaf} · {n0(I.hierarchy.parent.areaKm2)} km²</button>
            </div>
          )}
          {I?.hierarchy?.children?.length > 0 && (
            <div className="dt-hier">
              <span className="dt-k">Sub-basins ({I.hierarchy.children.length})</span>
              <div className="dt-chips">{I.hierarchy.children.map((c) => <button key={c.id} className="ws-chip" onClick={() => onSelectId(c.id)}>L{c.level} · {c.pfaf} · {n0(c.areaKm2)} km²</button>)}</div>
            </div>
          )}
        </Section>

        <Section id="hydrology" title="HYDROLOGY" status={hyd?.status || (intel.status === 'DONE' ? null : intel.status)} refs={refs}>
          {hyd?.status === 'AVAILABLE' ? <>
            <KV k="River reaches" v={n0(hyd.reachCount)} src="intersecting the area" />
            <KV k="Network length" v={`${n0(hyd.networkLengthKm)} km`} />
            <KV k="Largest river order" v={hyd.largestRiverOrder} src="1 = largest" />
            {hyd.outletReach && <>
              <KV k="Outlet river" v={[hyd.outletReach.backboneRiver, hyd.outletReach.riverSystem && `(${hyd.outletReach.riverSystem} system)`].filter(Boolean).join(' ') || 'Unnamed'} />
              <KV k="Mean discharge at outlet" v={hyd.outletReach.meanDischargeM3s != null ? `${n0(hyd.outletReach.meanDischargeM3s)} m³/s` : '—'} src="long-term modelled" />
              <KV k="Degree of regulation" v={hyd.outletReach.degreeOfRegulationPct != null ? `${hyd.outletReach.degreeOfRegulationPct}%` : '—'} src="reservoir influence (DOR)" />
              <KV k="Free-flowing at outlet" v={hyd.outletReach.freeFlowing ? 'Yes' : 'No'} src={`CSI ${hyd.outletReach.connectivityStatusIndex}`} />
            </>}
            <KV k="Regulated reaches" v={`${n0(hyd.regulatedReaches)} (DOR > 2%)`} />
            <div className="fp-prov">{hyd.datasetLabel}. {hyd.notes}</div>
          </> : hyd ? <div className="ws-state">{hyd.status} — {hyd.reason || 'No river reaches intersect this area.'}</div> : null}
          {hist?.riverFacts && (
            <div className="dt-facts">
              <div className="dt-k">River facts (Wikidata {hist.riverFacts.qid})</div>
              {hist.riverFacts.lengthKm && <KV k="Length" v={`${n0(hist.riverFacts.lengthKm)} km`} />}
              {hist.riverFacts.dischargeM3s && <KV k="Discharge" v={`${n0(hist.riverFacts.dischargeM3s)} m³/s`} />}
              {hist.riverFacts.drainageAreaKm2 && <KV k="Drainage area" v={`${n0(hist.riverFacts.drainageAreaKm2)} km²`} />}
              {hist.riverFacts.source && <KV k="Source" v={hist.riverFacts.source} />}
              {hist.riverFacts.mouth && <KV k="Mouth" v={hist.riverFacts.mouth} />}
              {hist.riverFacts.tributaries?.length > 0 && <KV k="Tributaries" v={hist.riverFacts.tributaries.join(', ')} />}
            </div>
          )}
        </Section>

        <Section id="eo" title="EARTH OBSERVATION" status={fp.status === 'DONE' ? fp.data.status : fp.status} refs={refs}>
          <ResourceState res={fp} what="fingerprint" />
          {m && ['ndvi', 'ndwi', 'ndmi'].filter((k) => m[k]).map((k) => (
            <div key={k} className="dt-metric">
              <KV k={`${m[k].label} · ${m[k].name}`} v={m[k].status === 'AVAILABLE' ? f3(m[k].value) : m[k].status} />
              {m[k].status === 'AVAILABLE'
                ? <div className="fp-prov">{m[k].datasetLabel} · {m[k].formula} · native {m[k].nativeResolution} · {m[k].windowStart} → {m[k].windowEnd} · {m[k].imageCount} scenes · {m[k].method} @ {m[k].analysisScaleM} m · {m[k].provider}</div>
                : <div className="fp-prov warn">{m[k].reason}</div>}
            </div>
          ))}
          {att.data?.comparisons?.find((c) => c.metric.startsWith('SMAP')) && (() => { const c = att.data.comparisons.find((x) => x.metric.startsWith('SMAP')); return <KV k="Soil moisture (SMAP)" v={`${f3(c.current)} m³/m³`} src={`${c.source} · ${c.currentWindow}`} />; })()}
        </Section>

        <Section id="landcover" title="LAND COVER" status={m?.landCover?.status} refs={refs}>
          {m?.landCover?.status === 'AVAILABLE' ? <>
            {m.landCover.classes.map((c) => (
              <div key={c.id} className="dt-lc"><i style={{ background: c.color }} /><span>{c.name}</span><div className="dt-lc-bar"><div style={{ width: `${c.share * 100}%`, background: c.color }} /></div><b>{(c.share * 100).toFixed(1)}%</b></div>
            ))}
            <div className="fp-prov">{m.landCover.datasetLabel} · {m.landCover.method} · {m.landCover.windowStart} → {m.landCover.windowEnd} · {m.landCover.imageCount} scenes · {m.landCover.analysisScaleM} m</div>
          </> : <div className="ws-state">{fp.status === 'LOADING' ? 'Loading…' : m?.landCover?.reason || 'Unavailable'}</div>}
        </Section>

        <Section id="temporal" title="TEMPORAL CHANGE" status={att.status === 'DONE' ? att.data.status : att.status} refs={refs}>
          {tl.status === 'DONE' && tl.data.status === 'AVAILABLE' && <KV k="Latest Sentinel-2 date" v={tl.data.observations[tl.data.observations.length - 1].date} src={`${tl.data.totalObservations} dates since ${tl.data.dateRange.start}`} />}
          {tl.status !== 'DONE' && <KV k="Observations" v={tl.status} />}
          <ResourceState res={att} what="change indicators" />
          {att.data?.comparisons?.map((c) => <KV key={c.metric} k={c.metric} v={`${f3(c.current)} vs ${f3(c.reference)} (Δ ${c.delta > 0 ? '+' : ''}${f3(c.delta)})`} src={c.status.replace('_', ' ')} />)}
          {att.data && <div className="fp-prov">{att.data.message}</div>}
          {tli.status === 'DONE' && tli.data.series?.length > 0 && (
            <div className="fp-prov">Monthly indices: {tli.data.series.filter((s) => s.status === 'AVAILABLE').map((s) => `${s.month} NDVI ${s.ndvi}`).join(' · ')}</div>
          )}
        </Section>

        <Section id="interventions" title="INTERVENTIONS" status={ints.status === 'DONE' ? (ints.data.length ? 'AVAILABLE' : 'NO_DATA') : ints.status} refs={refs}>
          {ints.status === 'DONE' && (ints.data.length ? ints.data.map((i) => <KV key={i.id} k={i.type} v={`${i.name} · ${i.status}`} />) : <div className="ws-state">NO INTERVENTIONS FOUND</div>)}
        </Section>

        <Section id="field" title="FIELD EVIDENCE" status={field.status === 'DONE' ? (myObs.length ? 'AVAILABLE' : 'NO_DATA') : field.status} refs={refs}>
          {field.status === 'DONE' && (myObs.length
            ? myObs.slice(0, 20).map((o) => <KV key={o.id} k={(o.captureTime || o.createdAt || '').slice(0, 10)} v={o.condition || o.status} src={o.location ? `${o.location.lat?.toFixed?.(4)}, ${(o.location.lon ?? o.location.lng)?.toFixed?.(4)}` : ''} />)
            : <div className="ws-state">No field observations are linked to this watershed yet.</div>)}
          <ResourceState res={field} what="field observations" />
        </Section>

        <Section id="history" title="HISTORY" status={hist?.status} refs={refs}>
          {hist?.status === 'AVAILABLE' ? hist.articles.map((a) => (
            <div key={a.title} className="dt-article">
              <div className="dt-article-head"><b>{a.title}</b>{a.description && <span> — {a.description}</span>}</div>
              <p>{a.extract}</p>
              <a href={a.url} target="_blank" rel="noreferrer">Wikipedia <ExternalLink size={10} /></a>
            </div>
          )) : <div className="ws-state">HISTORY NOT AVAILABLE{hist?.reason ? ` — ${hist.reason}` : ''}</div>}
          {hist?.license && <div className="fp-prov">{hist.license}</div>}
        </Section>

        <Section id="media" title="MEDIA" status={media.status === 'DONE' ? media.data.status : media.status} refs={refs}>
          <ResourceState res={media} what="images" />
          {images.length > 0 ? (
            <div className="dt-gallery">
              {images.map((im, i) => (
                <figure key={im.fullUrl} className={i === imgIdx ? 'active' : ''} onClick={() => setImgIdx(i)}>
                  <img src={im.url} alt={im.title} loading="lazy" />
                  <figcaption>
                    <b>{im.title}</b> · {im.author || 'Unknown author'} · {im.licenseUrl ? <a href={im.licenseUrl} target="_blank" rel="noreferrer">{im.license}</a> : im.license}
                    {' · '}<a href={im.sourcePage} target="_blank" rel="noreferrer">Wikimedia Commons</a> · via “{im.article}”
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : media.status === 'DONE' && <div className="ws-state">NO IMAGE AVAILABLE — {media.data.reason}</div>}
        </Section>

        <Section id="sources" title="SOURCES" refs={refs}>
          <ul className="dt-sources">
            <li>Boundary: {ctx.isCustom ? 'user-supplied geometry' : `WWF HydroSHEDS HydroBASINS (${ctx.sourceDataset || 'WWF/HydroSHEDS/v1/Basins'}) feature ${ctx.sourceFeatureId ?? ''}`}</li>
            <li>Rivers / naming / hydrology: WWF/HydroSHEDS/v1/FreeFlowingRivers (Grill et al., 2019)</li>
            <li>NDVI · NDWI · NDMI · true colour: COPERNICUS/S2_SR_HARMONIZED (ESA Copernicus), via Google Earth Engine</li>
            <li>Land cover: GOOGLE/DYNAMICWORLD/V1 · Terrain: USGS/SRTMGL1_003 · Soil moisture: NASA/SMAP/SPL4SMGP/008</li>
            <li>Countries: USDOS/LSIB_SIMPLE/2017 · Nearest place: OpenStreetMap Nominatim</li>
            {hist?.articles?.map((a) => <li key={a.url}>History: <a href={a.url} target="_blank" rel="noreferrer">{a.title}</a> (Wikipedia, CC BY-SA 4.0)</li>)}
            {hist?.riverFacts && <li>River facts: <a href={hist.riverFacts.url} target="_blank" rel="noreferrer">Wikidata {hist.riverFacts.qid}</a> (CC0)</li>}
            {images.map((im) => <li key={im.sourcePage}>Image: <a href={im.sourcePage} target="_blank" rel="noreferrer">{im.title}</a> — {im.author}, {im.license}</li>)}
          </ul>
        </Section>

        <Section id="ai" title="AI BRIEF" status={brief.status === 'IDLE' ? null : brief.status === 'DONE' ? brief.data.status : brief.status} refs={refs}>
          {brief.status === 'IDLE' && <button className="ws-mini-btn primary" onClick={onBrief}><Sparkles size={11} /> GENERATE BRIEF FROM VERIFIED DATA</button>}
          <ResourceState res={brief} what="AI brief" loadingText="Collecting verified facts and generating brief (up to ~2 min)…" />
          {brief.status === 'DONE' && brief.data.status === 'AVAILABLE' && <>
            {[['executiveSummary', 'Executive summary'], ['currentEarthObservation', 'Current Earth observation'], ['hydrology', 'Hydrology'], ['vegetationMoisture', 'Vegetation / moisture'], ['temporalChange', 'Temporal change'], ['interventions', 'Interventions'], ['fieldEvidence', 'Field evidence'], ['dataLimitations', 'Data limitations']]
              .map(([k, label]) => <div key={k} className="dt-brief"><b>{label}</b><p>{brief.data.sections[k]}</p></div>)}
            <div className="fp-prov">Model {brief.data.model} · {brief.data.validation} · generated {brief.data.generatedAt}</div>
            <Retry onClick={onBrief} label="REGENERATE" />
          </>}
          {brief.status === 'DONE' && brief.data.status !== 'AVAILABLE' && <div className="ws-state warn">AI BRIEF {brief.data.status === 'UNAVAILABLE' ? 'UNAVAILABLE' : brief.data.status} — {brief.data.reason} <Retry onClick={onBrief} /></div>}
        </Section>
      </div>
    </div>
  );
}
