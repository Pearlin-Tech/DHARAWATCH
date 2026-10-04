/**
 * DHARAWATCH — Watershed Intelligence (detail panel, media, AI brief)
 *
 * Every value returned here comes from a named source:
 *   - HydroSHEDS HydroBASINS / free-flowing rivers (Earth Engine) — geography, hierarchy, hydrology
 *   - Wikipedia REST summary + Wikidata claims — history / river facts (CC BY-SA, attributed)
 *   - Wikimedia Commons imageinfo — photographs with author + licence
 *   - The project database — interventions, field observations
 * Missing information is reported as UNAVAILABLE, never filled in.
 */
import ee from '@google/earthengine';
import {
  evalEE, memo, cget, basinsFC, RIVERS, levelOfHybasId, countriesFor, geometryRef,
  computeFingerprint, computeAttention, computeTimeline, computeTimelineIndices, nameBasin
} from './geospatial.js';
import { reverseGeocode } from './geocoder.js';

const UA = 'DHARAWATCH/1.0 (https://github.com/dharawatch; watershed intelligence)';
const round = (v, d = 2) => (v == null || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 10 ** d) / 10 ** d);

async function getJSON(url, timeout = 10000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: c.signal });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).host}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms / 1000}s`)), ms))]);
const settle = async (p) => { try { return { ok: true, v: await p }; } catch (e) { return { ok: false, e }; } };

// ─── HydroSHEDS: hierarchy + hydrology ────────────────────────────
async function hierarchy(ctx) {
  if (!/^hybas-/.test(ctx.id || '') && !/^hybas-/.test(ctx.sourceId || '')) return null;
  const pfaf = Number(ctx.metadata?.PFAF_ID);
  const L = ctx.level || levelOfHybasId(ctx.sourceId || ctx.id);
  if (!Number.isFinite(pfaf) || !L) return null;
  return memo(`hier:${ctx.sourceId || ctx.id}`, async () => {
    const props = ['HYBAS_ID', 'PFAF_ID', 'SUB_AREA', 'UP_AREA'];
    const pick = (fc) => fc.toList(12).map(f => ee.Feature(f).toDictionary(props));
    const parentQ = L > 1 ? pick(basinsFC(L - 1).filter(ee.Filter.eq('PFAF_ID', Math.floor(pfaf / 10)))) : ee.List([]);
    const childQ = L < 12 ? pick(basinsFC(L + 1).filter(ee.Filter.rangeContains('PFAF_ID', pfaf * 10 + 1, pfaf * 10 + 9))) : ee.List([]);
    const r = await evalEE(ee.Dictionary({ parent: parentQ, children: childQ }), 45000);
    const mk = (p, lvl) => ({ id: `hybas-${p.HYBAS_ID}`, level: lvl, pfaf: p.PFAF_ID, areaKm2: round(p.SUB_AREA, 0), upstreamAreaKm2: round(p.UP_AREA, 0) });
    return {
      parent: r.parent?.[0] ? mk(r.parent[0], L - 1) : null,
      children: (r.children || []).map(c => mk(c, L + 1)).sort((a, b) => a.pfaf - b.pfaf),
      method: 'Pfafstetter code nesting (parent = code ÷ 10, children = code × 10 + 1…9)',
      dataset: 'WWF/HydroSHEDS/v1/Basins'
    };
  });
}

async function hydrology(ctx) {
  return memo(`hydro:${ctx.sourceId || ctx.id}`, async () => {
    const g = ee.Geometry(ctx.geometry);
    const fc = ee.FeatureCollection(RIVERS).filterBounds(g);
    const props = ['BAS_NAME', 'BB_NAME', 'UPLAND_SKM', 'DIS_AV_CMS', 'RIV_ORD', 'DOR', 'CSI', 'CSI_FF', 'LENGTH_KM', 'COUNTRY'];
    const outlet = fc.sort('UPLAND_SKM', false).first();
    const r = await evalEE(ee.Dictionary({
      n: fc.size(), len: fc.aggregate_sum('LENGTH_KM'), minOrd: fc.aggregate_min('RIV_ORD'),
      outlet: ee.Algorithms.If(fc.size().gt(0), ee.Feature(outlet).toDictionary(props), null),
      regulated: fc.filter(ee.Filter.gt('DOR', 2)).size(),
      freeFlowing: fc.filter(ee.Filter.eq('CSI_FF', 1)).size()
    }), 90000);
    const o = r.outlet || null;
    return {
      status: r.n > 0 ? 'AVAILABLE' : 'NO_DATA',
      reachCount: r.n, networkLengthKm: round(r.len, 0), largestRiverOrder: r.minOrd ?? null,
      regulatedReaches: r.regulated, freeFlowingReaches: r.freeFlowing,
      outletReach: o ? {
        riverSystem: o.BAS_NAME || null, backboneRiver: o.BB_NAME || null, upstreamAreaKm2: round(o.UPLAND_SKM, 0),
        meanDischargeM3s: round(o.DIS_AV_CMS, 1), riverOrder: o.RIV_ORD, degreeOfRegulationPct: round(o.DOR, 1),
        connectivityStatusIndex: round(o.CSI, 1), freeFlowing: o.CSI_FF === 1, country: o.COUNTRY || null
      } : null,
      notes: 'Reaches intersecting the area; discharge = long-term average modelled discharge (HydroSHEDS / WaterGAP); DOR = degree of regulation by upstream reservoirs (%).',
      dataset: RIVERS, datasetLabel: 'HydroSHEDS free-flowing rivers (Grill et al. 2019)'
    };
  });
}

// ─── Wikipedia / Wikidata ─────────────────────────────────────────
const WIKI_OK = /\briver\b|\bbasin\b|\bwatershed\b|\btributar|\bdrainage\b|\bdam\b|\breservoir\b/i;

async function wikiSummary(title) {
  return memo(`wiki:${title}`, async () => {
    const j = await getJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}?redirect=true`);
    if (!j || j.type !== 'standard') return null;
    if (!WIKI_OK.test(`${j.description || ''} ${j.extract || ''}`.slice(0, 600))) return null;
    return {
      title: j.title, description: j.description || null, extract: j.extract || null,
      url: j.content_urls?.desktop?.page || null, wikidataId: j.wikibase_item || null,
      image: j.originalimage?.source || null, thumbnail: j.thumbnail?.source || null
    };
  });
}

async function firstArticle(titles) {
  for (const t of titles) {
    const r = await wikiSummary(t).catch(() => null);
    if (r) return r;
  }
  return null;
}

const UNITS = { Q828224: 'km', Q11573: 'm', Q712226: 'km²', Q25343: 'm²', Q794261: 'm³/s' };
async function wikidataFacts(qid) {
  if (!qid) return null;
  return memo(`wdf:${qid}`, async () => {
    const j = await getJSON(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=claims&format=json`);
    const cl = j?.entities?.[qid]?.claims || {};
    const qty = (p) => {
      const v = cl[p]?.find(c => c.rank !== 'deprecated')?.mainsnak?.datavalue?.value;
      if (!v) return null;
      const unit = UNITS[String(v.unit).split('/').pop()];
      return unit ? { value: Number(v.amount), unit } : null;
    };
    const ents = (p, n = 12) => (cl[p] || []).map(c => c.mainsnak?.datavalue?.value?.id).filter(Boolean).slice(0, n);
    const ids = [...new Set([...ents('P403', 1), ...ents('P885', 1), ...ents('P974'), ...ents('P17')])];
    let labels = {};
    if (ids.length) {
      const l = await getJSON(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join('|')}&props=labels&languages=en&format=json`);
      for (const [id, e] of Object.entries(l?.entities || {})) labels[id] = e.labels?.en?.value;
    }
    const lab = (arr) => arr.map(i => labels[i]).filter(Boolean);
    return {
      qid, url: `https://www.wikidata.org/wiki/${qid}`,
      lengthKm: (() => { const q = qty('P2043'); return q ? (q.unit === 'm' ? q.value / 1000 : q.unit === 'km' ? q.value : null) : null; })(),
      dischargeM3s: (() => { const q = qty('P2225'); return q?.unit === 'm³/s' ? q.value : null; })(),
      drainageAreaKm2: (() => { const q = qty('P2053'); return q ? (q.unit === 'm²' ? q.value / 1e6 : q.unit === 'km²' ? q.value : null) : null; })(),
      mouth: lab(ents('P403', 1))[0] || null,
      source: lab(ents('P885', 1))[0] || null,
      tributaries: lab(ents('P974')),
      countries: lab(ents('P17'))
    };
  });
}

/** Commons file metadata (author, licence) for an upload.wikimedia.org URL. */
async function commonsInfo(imageUrl) {
  if (!imageUrl) return null;
  const file = decodeURIComponent(imageUrl.split('?')[0].split('/').pop()).replace(/^\d+px-/, '');
  return memo(`commons:${file}`, async () => {
    const j = await getJSON(`https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent('File:' + file)}&prop=imageinfo&iiprop=url|extmetadata|mime&iiurlwidth=900&format=json`);
    const page = Object.values(j?.query?.pages || {})[0];
    const ii = page?.imageinfo?.[0];
    if (!ii) throw new Error(`no imageinfo for File:${file} (${page?.missing !== undefined ? 'missing on Commons' : JSON.stringify(j).slice(0, 160)})`);
    if (!/^image\/(jpeg|png|webp)/.test(ii.mime || '')) throw new Error(`File:${file} is ${ii.mime}, not a photograph`);
    const md = ii.extmetadata || {};
    const strip = (h) => (h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || null;
    return {
      url: ii.thumburl || ii.url, fullUrl: ii.url, title: strip(md.ObjectName?.value) || file.replace(/_/g, ' '),
      author: strip(md.Artist?.value), credit: strip(md.Credit?.value),
      license: strip(md.LicenseShortName?.value), licenseUrl: md.LicenseUrl?.value || null,
      sourcePage: ii.descriptionurl, source: 'Wikimedia Commons'
    };
  });
}

function knowledgeTitles(ctx) {
  const river = ctx.riverSystem || ctx.river || null;
  const feature = ctx.metadata?.feature || null;
  if (!river && !feature) return null;
  return {
    river: river ? [`${river} River`, river, `${river} river`] : [],
    basin: river ? [`${river} Basin`, `${river} basin`, `${river} drainage basin`] : [],
    feature: feature ? [feature] : []
  };
}

async function knowledge(ctx) {
  const titles = knowledgeTitles(ctx);
  if (!titles) return { status: 'UNAVAILABLE', reason: 'No named river system is associated with this area, so no history lookup was made.' };
  const [riverA, basinA, featureA] = await Promise.all([firstArticle(titles.river), firstArticle(titles.basin), firstArticle(titles.feature)]);
  if (!riverA && !basinA && !featureA) return { status: 'UNAVAILABLE', reason: `No Wikipedia article found for ${titles.river[0] || titles.feature[0]}.` };
  const facts = await wikidataFacts(riverA?.wikidataId).catch(() => null);
  const articles = [riverA, basinA, featureA].filter(Boolean).filter((a, i, arr) => arr.findIndex(b => b.title === a.title) === i);
  return {
    status: 'AVAILABLE', articles: articles.map(({ image, thumbnail, ...a }) => a), riverFacts: facts,
    license: 'Text: Wikipedia, CC BY-SA 4.0 · Facts: Wikidata, CC0'
  };
}

// ─── Public API ───────────────────────────────────────────────────
export async function getIntel(ctx) {
  const key = ctx.sourceId || ctx.id || 'geom';
  const center = ctx.center || (ctx.centroid ? [ctx.centroid.lon, ctx.centroid.lat] : null);
  if (/^hybas-/.test(ctx.id || '') && !ctx.naming) await nameBasin(ctx);
  const [countries, near, hier, hyd, know] = await Promise.all([
    settle(withTimeout(countriesFor(ctx.geometry), 40000, 'Country lookup')),
    settle(center ? withTimeout(reverseGeocode(center[1], center[0]), 12000, 'Reverse geocode') : Promise.resolve(null)),
    settle(withTimeout(hierarchy(ctx), 50000, 'Hierarchy')),
    settle(withTimeout(hydrology(ctx), 95000, 'Hydrology')),
    settle(withTimeout(knowledge(ctx), 30000, 'History lookup'))
  ]);
  const err = (s) => ({ status: /timed out/.test(s.e?.message) ? 'TIMEOUT' : 'ERROR', reason: s.e?.message });
  const md = ctx.metadata || {};
  return {
    id: ctx.id, key,
    overview: {
      name: ctx.name, technicalName: ctx.technicalName || null, naming: ctx.naming || null,
      type: ctx.isCustom ? 'Custom analysis area' : 'Watershed (HydroBASINS)', level: ctx.level ?? null,
      source: ctx.isCustom ? 'User geometry' : 'HydroSHEDS HydroBASINS v1c',
      sourceFeatureId: ctx.sourceFeatureId ?? null, isDemo: !!ctx.isDemo, isSaved: !!ctx.isSaved,
      description: md.description || null
    },
    geography: {
      areaKm2: round(ctx.areaKm2, 0), perimeterKm: round(ctx.perimeterKm, 0),
      centroid: center ? { lon: round(center[0], 4), lat: round(center[1], 4) } : null, bbox: ctx.bbox || null,
      countries: countries.ok ? countries.v : [], countriesStatus: countries.ok ? (countries.v.length ? 'AVAILABLE' : 'NO_DATA') : err(countries).status,
      nearPlace: near.ok ? near.v : null,
      pfafstetter: md.PFAF_ID ?? null, subAreaKm2: round(md.SUB_AREA_KM2, 0), upstreamAreaKm2: round(md.UP_AREA_KM2, 0),
      endorheic: md.ENDO == null ? null : md.ENDO === 1 || md.ENDO === 2,
      coastal: md.COAST == null ? null : md.COAST === 1,
      sources: ['USDOS/LSIB_SIMPLE/2017 (countries)', 'OpenStreetMap Nominatim (nearest place)', 'HydroBASINS attributes']
    },
    hierarchy: hier.ok ? hier.v : err(hier),
    hydrology: hyd.ok ? hyd.v : err(hyd),
    history: know.ok ? know.v : err(know),
    computedAt: new Date().toISOString()
  };
}

export async function getMedia(ctx) {
  const titles = knowledgeTitles(ctx);
  if (!titles) return { status: 'NO_IMAGE', images: [], reason: 'No named river or landmark is associated with this area.' };
  return memo(`media:${ctx.sourceId || ctx.id}`, async () => {
    const arts = await Promise.all([firstArticle(titles.feature), firstArticle(titles.river), firstArticle(titles.basin)]);
    const seen = new Set();
    const images = [];
    const diagnostics = [];
    for (const a of arts.filter(Boolean)) {
      if (!a.image) { diagnostics.push({ article: a.title, result: 'article has no lead image' }); continue; }
      if (seen.has(a.image)) continue;
      seen.add(a.image);
      try {
        const info = await commonsInfo(a.image);
        if (info) images.push({ ...info, article: a.title, articleUrl: a.url });
        else diagnostics.push({ article: a.title, result: 'lead image is not a photograph (e.g. SVG map) or has no Commons record' });
      } catch (e) { diagnostics.push({ article: a.title, result: `Commons lookup failed: ${e.message}` }); }
    }
    return images.length
      ? { status: 'AVAILABLE', images, diagnostics, searched: [...titles.feature, titles.river[0], titles.basin[0]].filter(Boolean) }
      : { status: 'NO_IMAGE', images: [], diagnostics, reason: 'No usable Commons photograph found for the matching articles.', searched: [...titles.feature, titles.river[0], titles.basin[0]].filter(Boolean) };
  });
}

// ─── AI brief (server-side only; key never leaves the server) ─────
/** AI_MODEL wins; otherwise ask the provider which Flash models this key can call (cached 1h). */
let modelCache = null;
export async function pickModels(apiKey) {
  if (process.env.AI_MODEL) return [process.env.AI_MODEL];
  if (modelCache && Date.now() - modelCache.t < 3600000) return modelCache.v;
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': apiKey }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const list = ((await r.json()).models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => m.name.replace(/^models\//, ''))
    .filter(n => /^gemini-[\d.]+-flash$/.test(n))
    .sort((a, b) => parseFloat(b.split('-')[1]) - parseFloat(a.split('-')[1]));
  if (!list.length) throw new Error('no generateContent-capable Gemini Flash model available for this key');
  modelCache = { t: Date.now(), v: list };
  return list;
}
const BRIEF_SECTIONS = ['executiveSummary', 'currentEarthObservation', 'hydrology', 'vegetationMoisture', 'temporalChange', 'interventions', 'fieldEvidence', 'dataLimitations'];

export function numbersIn(text) {
  return (String(text).replace(/(\d),(\d{3})/g, '$1$2').match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
}
export function allowedNumbers(facts) {
  const set = new Set();
  const add = (n) => { for (const d of [0, 1, 2, 3]) set.add(Number(n.toFixed(d))); };
  const walk = (v) => {
    if (typeof v === 'number' && Number.isFinite(v)) {
      add(v); add(Math.abs(v)); add(v * 100); add(Math.abs(v * 100));
      add(v / 1e6); add(v / 1e3);
    } else if (typeof v === 'string') numbersIn(v).forEach(n => { add(n); add(Math.abs(n)); });
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(facts);
  return set;
}

/**
 * One server-side Gemini call that must return JSON. Picks a model this key can use (retired models are
 * skipped), tries up to 3 models with one retry each on 429/503. `image` = { mimeType, base64 } for vision.
 * Returns { json, model } or { error: { status, reason, model? } }.
 */
export async function callGeminiJSON({ prompt, image = null, timeoutMs = 60000 }) {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) return { error: { status: 'UNAVAILABLE', reason: 'AI_API_KEY is not configured on the server.' } };
  let models;
  try { models = await pickModels(apiKey); } catch (e) { return { error: { status: 'ERROR', reason: `Could not list AI models: ${e.message}` } }; }
  const parts = image ? [{ inline_data: { mime_type: image.mimeType, data: image.base64 } }, { text: prompt }] : [{ text: prompt }];
  let lastErr = null;
  for (const m of models.slice(0, 3)) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.1, responseMimeType: 'application/json' } }),
          signal: AbortSignal.timeout(timeoutMs)
        });
        const body = await r.json().catch(() => null);
        if (!r.ok) {
          lastErr = { status: 'ERROR', reason: `AI provider returned HTTP ${r.status} for ${m}: ${body?.error?.message?.slice(0, 160) || 'no detail'}`, model: m };
          if (r.status === 429 || r.status === 503) { await new Promise(res => setTimeout(res, 2500)); continue; }
          break;
        }
        const text = body?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
        let json = null;
        try { json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || 'null'); } catch (_) { /* invalid JSON */ }
        return { json, model: m };
      } catch (e) {
        lastErr = { status: /timeout|abort/i.test(e.message) ? 'TIMEOUT' : 'ERROR', reason: e.message, model: m };
      }
    }
  }
  return { error: lastErr || { status: 'ERROR', reason: 'No AI model responded.' } };
}

export async function getBrief({ input, ctx, store }) {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) return { status: 'UNAVAILABLE', reason: 'AI_API_KEY is not configured on the server.' };
  const ref = await geometryRef(input);
  const [fp, att, tl, tli, intel, ints, obs] = await Promise.all([
    settle(withTimeout(computeFingerprint(input), 110000, 'Fingerprint')),
    settle(withTimeout(computeAttention(input), 110000, 'Attention')),
    settle(withTimeout(computeTimeline(input), 60000, 'Timeline')),
    Promise.resolve({ ok: true, v: cget(`tli:${ref.key}`) }),
    settle(withTimeout(getIntel(ctx), 100000, 'Intel')),
    settle(store.getAllRows('interventions')),
    settle(store.getAllRows('field_observations'))
  ]);
  const pickMetric = (m) => m && { value: m.value ?? null, status: m.status, window: m.windowStart ? `${m.windowStart} to ${m.windowEnd}` : null, images: m.imageCount ?? null };
  const facts = {
    watershed: { name: ctx.name, level: ctx.level ?? null, areaKm2: round(ctx.areaKm2, 0), source: ctx.isCustom ? 'user-drawn area' : 'HydroSHEDS HydroBASINS', namingMethod: ctx.naming?.method || null },
    geography: intel.ok ? { countries: intel.v.geography.countries, nearestPlace: intel.v.geography.nearPlace, upstreamAreaKm2: intel.v.geography.upstreamAreaKm2, coastal: intel.v.geography.coastal, endorheic: intel.v.geography.endorheic } : 'UNAVAILABLE',
    hydrology: intel.ok && intel.v.hydrology?.status === 'AVAILABLE' ? { riverReaches: intel.v.hydrology.reachCount, networkLengthKm: intel.v.hydrology.networkLengthKm, outlet: intel.v.hydrology.outletReach } : 'UNAVAILABLE',
    riverFacts: intel.ok && intel.v.history?.riverFacts ? intel.v.history.riverFacts : 'UNAVAILABLE',
    earthObservation: fp.ok ? { status: fp.v.status, ndvi: pickMetric(fp.v.metrics.ndvi), ndwi: pickMetric(fp.v.metrics.ndwi), ndmi: pickMetric(fp.v.metrics.ndmi), dataset: 'Sentinel-2 SR Harmonized' } : 'UNAVAILABLE',
    landCover: fp.ok && fp.v.metrics.landCover?.status === 'AVAILABLE' ? fp.v.metrics.landCover.classes.slice(0, 5).map(c => ({ class: c.name, sharePct: round(c.share * 100, 1) })) : 'UNAVAILABLE',
    changeVersusOneYearEarlier: att.ok ? { status: att.v.status, comparisons: att.v.comparisons.map(c => ({ metric: c.metric, current: c.current, reference: c.reference, delta: c.delta, status: c.status })), flagged: att.v.items.map(i => i.type) } : 'UNAVAILABLE',
    observations: tl.ok && tl.v.status === 'AVAILABLE' ? { sentinel2Dates: tl.v.totalObservations, clearDates: tl.v.clearObservations, from: tl.v.dateRange.start, to: tl.v.dateRange.end } : 'UNAVAILABLE',
    monthlyIndices: tli.v?.series ? tli.v.series.filter(s => s.status === 'AVAILABLE').map(s => ({ month: s.month, ndvi: s.ndvi, ndwi: s.ndwi, ndmi: s.ndmi })) : 'NOT COMPUTED',
    interventions: ints.ok ? ints.v.filter(i => i.watershedId === ctx.id).map(i => ({ name: i.name, type: i.type, status: i.status })) : 'UNAVAILABLE',
    fieldObservations: obs.ok ? obs.v.filter(o => o.watershedId === ctx.id).length : 'UNAVAILABLE'
  };
  const prompt = `Create a concise watershed intelligence brief using ONLY the verified facts in the JSON below.
Do not invent measurements, dates, watershed names, river names, interventions or scientific conclusions.
Do not introduce any number that is not present in the facts. If information is missing or "UNAVAILABLE", say it is unavailable.
Clearly distinguish measured observations (from the data) from interpretation (prefix interpretation with "Interpretation:").
NDMI is canopy/vegetation moisture, not soil moisture. NDWI > 0 usually indicates open water; a basin-wide mean NDWI is normally negative.
Return JSON with string fields: ${BRIEF_SECTIONS.join(', ')}. Each field 1-4 sentences.

FACTS:
${JSON.stringify(facts)}`;
  const { json, model, error } = await callGeminiJSON({ prompt });
  if (!model) return error;
  if (!json) return { status: 'ERROR', reason: 'AI response was not valid JSON.', model };
  // Anti-hallucination gate: every number in the brief must exist in the supplied facts.
  const allowed = allowedNumbers(facts);
  const unverified = [...new Set(BRIEF_SECTIONS.flatMap(k => numbersIn(json[k] || '')).filter(n => !allowed.has(n) && !(Number.isInteger(n) && n >= 0 && n <= 12)))];
  const sections = Object.fromEntries(BRIEF_SECTIONS.map(k => [k, typeof json[k] === 'string' ? json[k] : 'Unavailable.']));
  if (unverified.length) {
    return { status: 'REJECTED', reason: `The AI output contained numbers not present in the verified data (${unverified.slice(0, 6).join(', ')}); brief withheld.`, model, facts };
  }
  return { status: 'AVAILABLE', model, sections, facts, generatedAt: new Date().toISOString(), validation: 'All numbers in the brief were checked against the supplied facts.' };
}
