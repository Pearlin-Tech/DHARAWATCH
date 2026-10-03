/**
 * DHARAWATCH — Geocoder Service
 * 
 * Provides global place name geocoding using OpenStreetMap Nominatim.
 * Supports watershed/basin names, cities, landmarks, coordinates.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'DHARAWATCH/1.0 (https://github.com/dharawatch)';

async function fetchWithTimeout(url, options = {}, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

export async function geocodePlace(query) {
  if (!query || query.trim().length < 2) return [];
  
  const q = query.trim();
  
  // 1. Try coordinate parse first
  const coordMatch = q.match(/^(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)$/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lon = parseFloat(coordMatch[2]);
    if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return [{
        id: `coord-${lat}-${lon}`,
        type: 'COORDINATE',
        name: `Location ${lat.toFixed(4)}, ${lon.toFixed(4)}`,
        displayName: `${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E`,
        lat,
        lon,
        confidence: 1.0,
        source: 'direct-coordinate'
      }];
    }
  }
  
  // 2. Use Nominatim for place search
  try {
    const params = new URLSearchParams({
      q,
      format: 'json',
      limit: '10',
      addressdetails: '1',
      extratags: '1',
      namedetails: '1',
      'accept-language': 'en'
    });
    
    const res = await fetchWithTimeout(`${NOMINATIM_URL}?${params}`, {
      headers: { 'User-Agent': USER_AGENT }
    });
    
    if (!res.ok) {
      console.warn('[Geocoder] Nominatim request failed:', res.status);
      return [];
    }
    
    const data = await res.json();
    
    return data.map((place, idx) => {
      const lat = parseFloat(place.lat);
      const lon = parseFloat(place.lon);
      const type = place.type || 'place';
      const classType = place.class || 'unknown';
      
      // Build display name
      const name = place.display_name || place.name || q;
      const shortName = place.namedetails?.name || place.name || name.split(',')[0];
      
      // Determine confidence based on OSM importance and match
      const importance = parseFloat(place.importance) || 0.5;
      const confidence = Math.min(0.95, 0.3 + importance * 0.65);
      
      // Categorize result
      let resultType = 'PLACE';
      if (type === 'waterway' || classType === 'waterway') resultType = 'RIVER';
      else if (type === 'natural' && (place.extratags?.water === 'reservoir' || place.extratags?.water === 'lake')) resultType = 'WATER_BODY';
      else if (type === 'man_made' && place.extratags?.man_made === 'dam') resultType = 'DAM';
      else if (type === 'boundary' || classType === 'boundary') resultType = 'ADMINISTRATIVE';
      else if (classType === 'place') resultType = 'SETTLEMENT';
      
      return {
        id: `nominatim-${place.place_id}-${idx}`,
        type: resultType,
        name: shortName,
        displayName: name,
        lat,
        lon,
        confidence,
        source: 'nominatim',
        osmType: place.osm_type,
        osmId: place.osm_id,
        placeType: type,
        placeClass: classType,
        address: place.address,
        importance
      };
    });
  } catch (err) {
    console.error('[Geocoder] Nominatim error:', err.message);
    return [];
  }
}

export async function reverseGeocode(lat, lon) {
  try {
    const params = new URLSearchParams({
      lat: lat.toString(),
      lon: lon.toString(),
      format: 'json',
      addressdetails: '1',
      'accept-language': 'en'
    });
    
    const res = await fetchWithTimeout(`https://nominatim.openstreetmap.org/reverse?${params}`, {
      headers: { 'User-Agent': USER_AGENT }
    });
    
    if (!res.ok) return null;
    
    const data = await res.json();
    return data.display_name || null;
  } catch (err) {
    console.warn('[Geocoder] Reverse geocode failed:', err.message);
    return null;
  }
}
// ─── Rich place search (used by /api/geocode/search) ───────────────
const searchCache = new Map();
let lastNominatim = 0;

function classify(place) {
  const cls = place.class || '';
  const type = place.type || '';
  const x = place.extratags || {};
  if (cls === 'waterway' || type === 'river' || type === 'stream' || type === 'canal') return 'RIVER';
  if (x.water === 'reservoir' || x.water === 'lake' || type === 'water' || type === 'reservoir' || type === 'bay') return 'WATER_BODY';
  if (x.man_made === 'dam' || type === 'dam' || cls === 'waterway' && type === 'dam') return 'DAM';
  if (cls === 'boundary' && (type === 'administrative')) {
    const lvl = parseInt(place.place_rank, 10);
    return lvl <= 4 ? 'COUNTRY' : 'REGION';
  }
  if (cls === 'place') {
    if (type === 'country') return 'COUNTRY';
    if (['state', 'region', 'province', 'county', 'district'].includes(type)) return 'REGION';
    if (['city', 'town'].includes(type)) return 'CITY';
    if (['village', 'hamlet', 'suburb', 'locality', 'neighbourhood'].includes(type)) return 'VILLAGE';
    return 'PLACE';
  }
  if (cls === 'natural' && ['peak', 'volcano', 'glacier', 'wetland'].includes(type)) return 'LANDMARK';
  if (cls === 'natural' || cls === 'geological') return 'LANDMARK';
  if (cls === 'man_made' || cls === 'power' || cls === 'building' || cls === 'amenity') return 'INFRASTRUCTURE';
  return 'PLACE';
}

function normalize(place, idx, via) {
  const lat = parseFloat(place.lat);
  const lon = parseFloat(place.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  let bbox = null;
  if (Array.isArray(place.boundingbox) && place.boundingbox.length === 4) {
    const [s, n, w, e] = place.boundingbox.map(Number);
    if ([s, n, w, e].every(Number.isFinite) && w <= e && s <= n) {
      // sanity: centre must lie inside the (slightly padded) bbox, otherwise discard the bbox
      const pad = 0.5;
      if (lon >= w - pad && lon <= e + pad && lat >= s - pad && lat <= n + pad) bbox = [w, s, e, n];
    }
  }
  const name = place.namedetails?.name || place.name || (place.display_name || '').split(',')[0];
  const importance = parseFloat(place.importance) || 0.3;
  return {
    id: `osm-${place.osm_type || 'x'}-${place.osm_id || place.place_id}-${idx}`,
    name,
    displayName: place.display_name || name,
    type: classify(place),
    lat, lon, center: [lon, lat], bbox,
    country: place.address?.country || null,
    region: place.address?.state || place.address?.region || null,
    source: 'nominatim',
    sourceFeatureId: `${place.osm_type || ''}/${place.osm_id || ''}`,
    confidence: Math.min(0.99, 0.3 + importance * 0.7),
    via: via || 'query'
  };
}

async function nominatim(q) {
  const wait = Math.max(0, 1100 - (Date.now() - lastNominatim));
  if (wait) await new Promise(r => setTimeout(r, wait));
  lastNominatim = Date.now();
  const params = new URLSearchParams({ q, format: 'jsonv2', limit: '10', addressdetails: '1', extratags: '1', namedetails: '1', 'accept-language': 'en' });
  const res = await fetchWithTimeout(`${NOMINATIM_URL}?${params}`, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  return res.json();
}

export function parseCoordinateQuery(q) {
  const m = q.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lon = parseFloat(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return { invalid: true, lat, lon };
  return { lat, lon };
}

// Wikidata gives well-ranked, globally consistent hits for rivers / basins / lakes / dams / countries.
function classifyDescription(desc = '') {
  const d = desc.toLowerCase();
  if (/drainage basin|river basin|watershed|catchment/.test(d)) return 'WATERSHED_FEATURE';
  if (/\briver\b|\bstream\b|\bcreek\b|\bcanal\b|\btributary\b/.test(d)) return 'RIVER';
  if (/reservoir|\blake\b|\bsea\b|\bbay\b|\bwetland\b/.test(d)) return 'WATER_BODY';
  if (/\bdam\b|barrage|weir/.test(d)) return 'DAM';
  if (/sovereign state|\bcountry\b/.test(d)) return 'COUNTRY';
  if (/state of|province|region|district|county|department|territory/.test(d)) return 'REGION';
  if (/\bcity\b|\btown\b|metropolis|capital/.test(d)) return 'CITY';
  if (/village|hamlet|locality|settlement/.test(d)) return 'VILLAGE';
  if (/mountain|volcano|peak|desert|plateau|island|glacier|valley|forest|park/.test(d)) return 'LANDMARK';
  if (/power station|hydroelectric|bridge|airport|port\b|plant/.test(d)) return 'INFRASTRUCTURE';
  return null; // not clearly geographic → ignore (films, ships, people...)
}

async function wikidataSearch(q) {
  const base = 'https://www.wikidata.org/w/api.php';
  const sp = new URLSearchParams({ action: 'wbsearchentities', search: q, language: 'en', uselang: 'en', limit: '10', format: 'json', type: 'item', origin: '*' });
  const r1 = await fetchWithTimeout(`${base}?${sp}`, { headers: { 'User-Agent': USER_AGENT } }, 8000);
  if (!r1.ok) throw new Error(`Wikidata HTTP ${r1.status}`);
  const hits = ((await r1.json()).search || []).map(h => ({ ...h, kind: classifyDescription(h.description) })).filter(h => h.kind);
  if (!hits.length) return [];
  const ids = hits.map(h => h.id).join('|');
  const gp = new URLSearchParams({ action: 'wbgetentities', ids, props: 'claims', format: 'json', origin: '*' });
  const r2 = await fetchWithTimeout(`${base}?${gp}`, { headers: { 'User-Agent': USER_AGENT } }, 8000);
  if (!r2.ok) throw new Error(`Wikidata HTTP ${r2.status}`);
  const ents = (await r2.json()).entities || {};
  const out = [];
  hits.forEach((h, i) => {
    const v = ents[h.id]?.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
    const lat = Number(v?.latitude), lon = Number(v?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
    out.push({
      id: `wd-${h.id}`, name: h.label, displayName: `${h.label} — ${h.description}`,
      type: h.kind === 'WATERSHED_FEATURE' ? 'WATERSHED_FEATURE' : h.kind,
      lat, lon, center: [lon, lat], bbox: null, country: null, region: h.description,
      source: 'wikidata', sourceFeatureId: h.id, confidence: Math.max(0.5, 0.98 - i * 0.05), via: 'wikidata'
    });
  });
  return out;
}

/**
 * Returns { results: [...], error?: string }.
 * NEVER substitutes a different place when nothing matches — returns an empty list instead.
 */
export async function searchPlaces(query) {
  const q = (query || '').trim();
  if (q.length < 2) return { results: [] };
  const coord = parseCoordinateQuery(q);
  if (coord) {
    if (coord.invalid) return { results: [], error: 'Coordinates out of range (expected "lat, lon").' };
    return { results: [{
      id: `coord-${coord.lat}-${coord.lon}`, name: `${coord.lat.toFixed(5)}, ${coord.lon.toFixed(5)}`,
      displayName: `Coordinates ${coord.lat.toFixed(5)}°, ${coord.lon.toFixed(5)}°`, type: 'COORDINATE',
      lat: coord.lat, lon: coord.lon, center: [coord.lon, coord.lat], bbox: null, source: 'coordinate', confidence: 1
    }] };
  }
  const ck = q.toLowerCase();
  const hit = searchCache.get(ck);
  if (hit && Date.now() - hit.t < 10 * 60 * 1000) return hit.v;
  try {
    const [wdRes, nomRes] = await Promise.allSettled([wikidataSearch(q), nominatim(q)]);
    const wd = wdRes.status === 'fulfilled' ? wdRes.value : [];
    let results = nomRes.status === 'fulfilled' ? nomRes.value.map((p, i) => normalize(p, i, 'query')).filter(Boolean) : [];
    if (!results.length && !wd.length) {
      // "Congo Basin" / "Nile watershed": retry without the generic hydrological suffix (reported via `via`)
      const stripped = q.replace(/\b(river|basin|watershed|catchment|drainage|sub-?basin)\b/ig, '').replace(/\s+/g, ' ').trim();
      if (stripped && stripped.toLowerCase() !== ck) {
        const [wd2, nom2] = await Promise.allSettled([wikidataSearch(stripped), nominatim(stripped)]);
        if (wd2.status === 'fulfilled') wd.push(...wd2.value.map(r => ({ ...r, via: 'stripped-query' })));
        if (nom2.status === 'fulfilled') results = nom2.value.map((p, i) => normalize(p, i, 'stripped-query')).filter(Boolean);
      }
    }
    // dedupe: drop an OSM hit that is the same-named feature within ~1° of a Wikidata hit
    const merged = [...wd];
    for (const r of results) {
      const dup = wd.some(w => w.name.toLowerCase() === r.name.toLowerCase() && Math.abs(w.lat - r.lat) < 1 && Math.abs(w.lon - r.lon) < 1);
      if (!dup) merged.push(r);
    }
    results = merged;
    if (nomRes.status === 'rejected' && wdRes.status === 'rejected') throw nomRes.reason;
    const v = { results };
    if (results.length) searchCache.set(ck, { t: Date.now(), v });
    return v;
  } catch (err) {
    console.error('[Geocoder] search failed:', err.message);
    return { results: [], error: 'GEOCODE_FAILED: ' + err.message };
  }
}
