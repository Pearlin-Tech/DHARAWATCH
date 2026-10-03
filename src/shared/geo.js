/**
 * DHARAWATCH — shared geometry utilities (used by browser AND server).
 * Coordinate order is always GeoJSON: [longitude, latitude].
 */

const R = 6378137; // WGS84 equatorial radius (m)
const rad = (d) => (d * Math.PI) / 180;

function validPos(p) {
  return Array.isArray(p) && p.length >= 2 &&
    Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
    p[0] >= -180 && p[0] <= 180 && p[1] >= -90 && p[1] <= 90;
}

function validRing(r) {
  if (!Array.isArray(r) || r.length < 4) return 'ring needs at least 4 positions (3 vertices + closure)';
  if (!r.every(validPos)) return 'coordinates must be [lon,lat] within [-180,180]/[-90,90]';
  const a = r[0], b = r[r.length - 1];
  if (a[0] !== b[0] || a[1] !== b[1]) return 'ring is not closed';
  return null;
}

/** @returns {{ok:true, geometry:object}|{ok:false, message:string}} */
export function validateGeometry(g) {
  if (!g || typeof g !== 'object') return { ok: false, message: 'geometry missing' };
  if (g.type === 'Feature') return validateGeometry(g.geometry);
  if (g.type === 'Point') {
    return validPos(g.coordinates) ? { ok: true, geometry: g } : { ok: false, message: 'invalid Point coordinates' };
  }
  if (g.type === 'Polygon') {
    if (!Array.isArray(g.coordinates) || !g.coordinates.length) return { ok: false, message: 'Polygon has no rings' };
    for (const r of g.coordinates) { const e = validRing(r); if (e) return { ok: false, message: e }; }
    return { ok: true, geometry: g };
  }
  if (g.type === 'MultiPolygon') {
    if (!Array.isArray(g.coordinates) || !g.coordinates.length) return { ok: false, message: 'MultiPolygon is empty' };
    for (const poly of g.coordinates) for (const r of poly) { const e = validRing(r); if (e) return { ok: false, message: e }; }
    return { ok: true, geometry: g };
  }
  return { ok: false, message: `unsupported geometry type ${g.type}` };
}

function ringAreaM2(ring) {
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [l1, p1] = ring[i];
    const [l2, p2] = ring[i + 1];
    s += rad(l2 - l1) * (2 + Math.sin(rad(p1)) + Math.sin(rad(p2)));
  }
  return Math.abs((s * R * R) / 2);
}

function polygonAreaM2(rings) {
  let a = ringAreaM2(rings[0]);
  for (let i = 1; i < rings.length; i++) a -= ringAreaM2(rings[i]);
  return Math.max(0, a);
}

function haversine(a, b) {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function allPositions(g) {
  if (g.type === 'Point') return [g.coordinates];
  if (g.type === 'Polygon') return g.coordinates.flat();
  if (g.type === 'MultiPolygon') return g.coordinates.flat(2);
  return [];
}

export function geometryBbox(g) {
  const pts = allPositions(g);
  if (!pts.length) return null;
  let w = 180, s = 90, e = -180, n = -90;
  for (const [x, y] of pts) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
  return [w, s, e, n];
}

/** Metrics from actual geometry (geodesic-ish area on the sphere). */
export function geometryMetrics(g) {
  const bbox = geometryBbox(g);
  let areaM2 = 0, perimM = 0;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  let cx = 0, cy = 0, wsum = 0;
  for (const rings of polys) {
    areaM2 += polygonAreaM2(rings);
    const outer = rings[0];
    for (let i = 0; i < outer.length - 1; i++) perimM += haversine(outer[i], outer[i + 1]);
    const a = ringAreaM2(outer);
    // planar centroid of outer ring (adequate for centre-of-view / labelling)
    let sa = 0, sx = 0, sy = 0;
    for (let i = 0; i < outer.length - 1; i++) {
      const f = outer[i][0] * outer[i + 1][1] - outer[i + 1][0] * outer[i][1];
      sa += f; sx += (outer[i][0] + outer[i + 1][0]) * f; sy += (outer[i][1] + outer[i + 1][1]) * f;
    }
    if (sa !== 0) { cx += (sx / (3 * sa)) * a; cy += (sy / (3 * sa)) * a; wsum += a; }
  }
  let centroid = null;
  if (g.type === 'Point') centroid = { lon: g.coordinates[0], lat: g.coordinates[1] };
  else if (wsum > 0) centroid = { lon: cx / wsum, lat: cy / wsum };
  else if (bbox) centroid = { lon: (bbox[0] + bbox[2]) / 2, lat: (bbox[1] + bbox[3]) / 2 };
  return {
    areaKm2: areaM2 / 1e6,
    perimeterKm: perimM / 1000,
    centroid,
    bbox
  };
}

/** Stable short hash of a geometry (for cache keys / custom ids). */
export function geometryKey(g) {
  const s = JSON.stringify(g);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function formatArea(km2) {
  if (km2 == null || !Number.isFinite(km2)) return '—';
  if (km2 >= 1e6) return `${(km2 / 1e6).toFixed(2)}M km²`;
  if (km2 >= 1000) return `${Math.round(km2).toLocaleString('en-US')} km²`;
  if (km2 >= 10) return `${km2.toFixed(1)} km²`;
  return `${km2.toFixed(2)} km²`;
}

function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

/** Point-in-polygon for Polygon / MultiPolygon (holes honoured). pt = [lon, lat]. */
export function pointInGeometry(pt, g) {
  if (!g) return false;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  return polys.some(rings => pointInRing(pt, rings[0]) && !rings.slice(1).some(h => pointInRing(pt, h)));
}

/** Geodesic-ish circle polygon (radius in metres) around a point. */
export function circlePolygon(lon, lat, radiusM = 500, steps = 48) {
  const ring = [];
  const dLat = (radiusM / 6378137) * (180 / Math.PI);
  const dLon = dLat / Math.max(0.01, Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    ring.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  ring.push(ring[0]);
  return { type: 'Polygon', coordinates: [ring] };
}
