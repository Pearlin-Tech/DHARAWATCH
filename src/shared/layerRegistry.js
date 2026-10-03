/**
 * DHARAWATCH — canonical watershed layer registry.
 *
 * ONE source of truth for layer ids, map ids, datasets, visualisation palettes and legends.
 * The backend (server/geospatial.js) renders Earth Engine tiles with `vis` from here, and the
 * frontend draws legends from the same entries, so a legend can never disagree with the pixels.
 */

export const DW_CLASSES = [
  { id: 0, label: 'Water', color: '#419BDF' },
  { id: 1, label: 'Trees', color: '#397D49' },
  { id: 2, label: 'Grass', color: '#88B053' },
  { id: 3, label: 'Flooded vegetation', color: '#7A87C6' },
  { id: 4, label: 'Crops', color: '#E49635' },
  { id: 5, label: 'Shrub & scrub', color: '#DFC35A' },
  { id: 6, label: 'Built area', color: '#C4281B' },
  { id: 7, label: 'Bare ground', color: '#A59B8F' },
  { id: 8, label: 'Snow & ice', color: '#B39FE1' }
];

const S2 = 'COPERNICUS/S2_SR_HARMONIZED';

export const WATERSHED_LAYERS = {
  boundary: {
    id: 'boundary', mapId: 'ws-boundary', label: 'Watershed Boundary', group: 'WATERSHED', kind: 'vector',
    color: '#38bdf8', dataset: 'Active context geometry (HydroSHEDS HydroBASINS or user geometry)',
    description: 'Outline of the active watershed / analysis area.', resolution: 'vector',
    defaultVisible: true, defaultOpacity: 1, legend: null
  },
  drainage: {
    id: 'drainage', mapId: 'ws-drainage', label: 'Drainage Network', group: 'WATERSHED', kind: 'raster',
    color: '#22d3ee', dataset: 'WWF/HydroSHEDS/v1/FreeFlowingRivers', source: 'WWF HydroSHEDS (HydroRIVERS-based)',
    description: 'River reaches from the HydroSHEDS free-flowing rivers network, width scaled by river order.',
    resolution: 'vector, rasterised for display', defaultVisible: false, defaultOpacity: 1,
    vis: { min: 1, max: 3, palette: ['a5f3fc', '22d3ee', '0369a1'] },
    legend: { type: 'classes', items: [{ label: 'Tributary', color: '#67e8f9' }, { label: 'River (≥5× threshold)', color: '#22d3ee' }, { label: 'Main stem (≥50×)', color: '#0891b2' }] }
  },
  sentinel2: {
    id: 'sentinel2', mapId: 'ws-sentinel2', label: 'Sentinel-2 True Color', group: 'IMAGERY', kind: 'raster',
    color: '#d1d5db', dataset: S2, source: 'ESA Copernicus Sentinel-2 SR Harmonized',
    description: 'Cloud-masked median composite, bands B4/B3/B2.', resolution: '10 m',
    defaultVisible: true, defaultOpacity: 1,
    vis: { bands: ['B4', 'B3', 'B2'], min: 0, max: 3000, gamma: 1.2 },
    legend: { type: 'text', text: 'Natural colour (B4 red · B3 green · B2 blue), reflectance 0–0.3' }
  },
  ndvi: {
    id: 'ndvi', mapId: 'ws-ndvi', label: 'NDVI · Vegetation', group: 'INDICES', kind: 'raster',
    color: '#10b981', dataset: S2, source: 'Sentinel-2 SR Harmonized', formula: '(B8 − B4) / (B8 + B4)',
    description: 'Normalized Difference Vegetation Index — green vegetation vigour.', resolution: '10 m',
    defaultVisible: false, defaultOpacity: 0.8,
    vis: { min: -0.2, max: 0.8, palette: ['d73027', 'f46d43', 'fdae61', 'fee08b', 'd9ef8b', 'a6d96a', '66bd63', '1a9850'] },
    legend: { type: 'gradient', min: -0.2, max: 0.8, minLabel: 'bare / water', maxLabel: 'dense vegetation' }
  },
  ndwi: {
    id: 'ndwi', mapId: 'ws-ndwi', label: 'NDWI · Surface Water', group: 'INDICES', kind: 'raster',
    color: '#3b82f6', dataset: S2, source: 'Sentinel-2 SR Harmonized', formula: '(B3 − B8) / (B3 + B8)',
    description: 'McFeeters NDWI — open-water signal; values > 0 usually indicate water.', resolution: '10 m',
    defaultVisible: false, defaultOpacity: 0.8,
    vis: { min: -0.5, max: 0.5, palette: ['8c510a', 'd8b365', 'f6e8c3', 'c7eae5', '5ab4ac', '01665e', '08306b'] },
    legend: { type: 'gradient', min: -0.5, max: 0.5, minLabel: 'dry land', maxLabel: 'open water' }
  },
  ndmi: {
    id: 'ndmi', mapId: 'ws-ndmi', label: 'NDMI · Vegetation Moisture', group: 'INDICES', kind: 'raster',
    color: '#06b6d4', dataset: S2, source: 'Sentinel-2 SR Harmonized', formula: '(B8 − B11) / (B8 + B11)',
    description: 'Normalized Difference Moisture Index — canopy / vegetation water content (not soil moisture).',
    resolution: '20 m (B11)', defaultVisible: false, defaultOpacity: 0.8,
    vis: { min: -0.4, max: 0.6, palette: ['a50026', 'f46d43', 'fee090', 'e0f3f8', '74add1', '313695'] },
    legend: { type: 'gradient', min: -0.4, max: 0.6, minLabel: 'dry canopy', maxLabel: 'moist canopy' }
  },
  dynamicWorld: {
    id: 'dynamicWorld', mapId: 'ws-dynamic-world', label: 'Land Cover · Dynamic World', group: 'LAND', kind: 'raster',
    color: '#f59e0b', dataset: 'GOOGLE/DYNAMICWORLD/V1', source: 'Google / WRI Dynamic World v1',
    description: 'Most frequent (mode) Dynamic World class over the window.', resolution: '10 m',
    defaultVisible: false, defaultOpacity: 0.8,
    vis: { min: 0, max: 8, palette: DW_CLASSES.map(c => c.color.slice(1)) },
    legend: { type: 'classes', items: DW_CLASSES.map(c => ({ label: c.label, color: c.color })) }
  },
  terrain: {
    id: 'terrain', mapId: 'ws-terrain', label: 'Terrain · Elevation', group: 'LAND', kind: 'raster',
    color: '#a3a3a3', dataset: 'USGS/SRTMGL1_003', source: 'NASA SRTM GL1 (USGS)',
    description: 'SRTM elevation blended with hillshade; colour stretch = 2nd–98th percentile of this area.',
    resolution: '30 m', defaultVisible: false, defaultOpacity: 0.85,
    vis: { palette: ['006633', 'e5ffcc', '662a00', 'd8d8d8', 'f5f5f5'] },
    legend: { type: 'gradient', dynamic: true, unit: 'm', minLabel: 'low', maxLabel: 'high' }
  },
  soilMoisture: {
    id: 'soilMoisture', mapId: 'ws-smap', label: 'Soil Moisture · SMAP', group: 'LAND', kind: 'raster',
    color: '#d946ef', dataset: 'NASA/SMAP/SPL4SMGP/008', source: 'NASA SMAP Level-4 (surface, 0–5 cm)',
    description: 'Modelled surface soil moisture (m³/m³). Coarse ~11 km grid — not suitable for small areas.',
    resolution: '~11 km', coarseResolution: true, defaultVisible: false, defaultOpacity: 0.7,
    vis: { min: 0.05, max: 0.45, palette: ['8c510a', 'd8b365', 'f6e8c3', 'c7eae5', '5ab4ac', '01665e'] },
    legend: { type: 'gradient', min: 0.05, max: 0.45, unit: 'm³/m³', minLabel: 'dry soil', maxLabel: 'wet soil' }
  }
};

export const LAYER_IDS = Object.keys(WATERSHED_LAYERS);
export const RASTER_LAYER_IDS = LAYER_IDS.filter(id => WATERSHED_LAYERS[id].kind === 'raster');
export const LAYER_GROUPS = ['WATERSHED', 'IMAGERY', 'INDICES', 'LAND'];

/** CSS gradient for a registry palette (legend rendering). */
export function paletteGradient(layerId) {
  const p = WATERSHED_LAYERS[layerId]?.vis?.palette || [];
  return p.length ? `linear-gradient(90deg, ${p.map(c => (c.startsWith('#') ? c : '#' + c)).join(', ')})` : 'none';
}
