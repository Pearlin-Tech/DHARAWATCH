/**
 * Canonical LOCATION CONTEXT.
 *
 * Every entry point (search, demo, saved, map double-click, draw, coordinates, URL) produces
 * a context through toContext() — React components never invent their own shape.
 */
import { geometryMetrics, validateGeometry } from '../../shared/geo.js';

export const CONTEXT_MODES = ['NONE', 'PLACE', 'WATERSHED', 'CUSTOM', 'DRAWING', 'SEARCHING', 'SELECTING_WATERSHED'];
export const MAP_MODES = ['NORMAL', 'SEARCH', 'DRAW', 'CONTEXT_MENU', 'SELECT_WATERSHED', 'NEW'];

/**
 * @typedef {Object} LocationContext
 * @property {string} id
 * @property {'hydrosheds'|'user'|'demo'|string} source
 * @property {string} name
 * @property {string} displayName
 * @property {'watershed'|'custom-area'} type
 * @property {object} geometry              GeoJSON Polygon|MultiPolygon, [lon,lat]
 * @property {number[]} bbox                [w,s,e,n]
 * @property {number[]} center              [lon,lat]
 * @property {number} areaKm2
 * @property {number|null} level
 * @property {string|null} parentId
 * @property {string|null} country
 * @property {string|null} region
 * @property {string|null} sourceDataset
 * @property {string|number|null} sourceFeatureId
 * @property {boolean} isCustom
 * @property {boolean} isSaved
 * @property {boolean} isDemo
 * @property {object} metadata
 */

export function toContext(raw, overrides = {}) {
  const r = { ...raw, ...overrides };
  const v = validateGeometry(r.geometry);
  if (!v.ok) throw new Error(`Context "${r.id || r.name}" has no valid geometry: ${v.message}`);
  const m = geometryMetrics(v.geometry);
  const center = r.center?.length === 2 ? r.center : m.centroid ? [m.centroid.lon, m.centroid.lat] : null;
  const isCustom = r.isCustom ?? r.type === 'custom-area';
  const ctx = {
    id: r.id,
    source: r.source || (isCustom ? 'user' : 'hydrosheds'),
    name: r.name || r.displayName || r.id,
    displayName: r.displayName || r.name || r.id,
    type: isCustom ? 'custom-area' : 'watershed',
    geometry: v.geometry,
    bbox: r.bbox?.length === 4 ? r.bbox : m.bbox,
    center,
    areaKm2: Number.isFinite(r.areaKm2) ? r.areaKm2 : m.areaKm2,
    perimeterKm: r.perimeterKm ?? m.perimeterKm,
    level: r.level ?? null,
    parentId: r.parentId ?? null,
    country: r.country ?? null,
    region: r.region ?? null,
    sourceDataset: r.sourceDataset ?? null,
    sourceFeatureId: r.sourceFeatureId ?? null,
    isCustom: !!isCustom,
    isSaved: r.isSaved === true,
    isDemo: !!r.isDemo,
    metadata: r.metadata || {}
  };
  // compat for legacy consumers (mission / compare expect centroid{lat,lon,lng})
  ctx.centroid = center ? { lat: center[1], lon: center[0], lng: center[0] } : null;
  ctx.lat = center?.[1];
  ctx.lon = center?.[0];
  return ctx;
}

export function typeLabel(ctx) {
  if (!ctx) return '';
  return ctx.isCustom ? 'CUSTOM REGION' : `WATERSHED${ctx.level ? ` · L${ctx.level}` : ''}`;
}

export function sourceBadge(ctx) {
  if (!ctx) return '';
  if (ctx.isCustom) return 'CUSTOM';
  return ctx.source === 'hydrosheds' || ctx.sourceDataset?.includes('HydroSHEDS') ? 'HYDROSHEDS' : String(ctx.source || '').toUpperCase();
}

export function contextToUrl(ctx) {
  const u = new URL(window.location.href);
  u.search = '';
  u.searchParams.set('id', ctx.id);
  return u;
}

/** Compact, serialisable summary for Ask / Compare / Mission hand-off. */
export function contextSummary(ctx, extra = {}) {
  if (!ctx) return null;
  return {
    id: ctx.id, name: ctx.name, type: ctx.type, source: ctx.source, level: ctx.level, areaKm2: ctx.areaKm2,
    center: ctx.center, bbox: ctx.bbox, country: ctx.country, isCustom: ctx.isCustom, ...extra
  };
}
