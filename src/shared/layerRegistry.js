export const WATERSHED_LAYERS = {
  boundary: {
    id: 'boundary',
    group: 'WATERSHED',
    color: '#38bdf8',
    displayName: 'Watershed Boundary',
    type: 'vector'
  },
  drainage: {
    id: 'drainage',
    group: 'WATERSHED',
    color: '#6366f1',
    displayName: 'Drainage Network',
    type: 'raster',
    hasOpacity: true
  },
  ndvi: {
    id: 'ndvi',
    group: 'ENVIRONMENT',
    color: '#10b981',
    displayName: 'Vegetation (NDVI)',
    type: 'raster',
    hasOpacity: true
  },
  ndwi: {
    id: 'ndwi',
    group: 'ENVIRONMENT',
    color: '#3b82f6',
    displayName: 'Surface Water (NDWI)',
    type: 'raster',
    hasOpacity: true
  },
  dynamicWorld: {
    id: 'dynamicWorld',
    group: 'ENVIRONMENT',
    color: '#f59e0b',
    displayName: 'Land Cover (Dynamic World)',
    type: 'raster',
    hasOpacity: true,
    hasLegend: true,
    legendType: 'lulc'
  },
  terrain: {
    id: 'terrain',
    group: 'ENVIRONMENT',
    color: '#a3a3a3',
    displayName: 'Terrain / Elevation (SRTM)',
    type: 'raster',
    hasOpacity: true,
    hasLegend: true,
    legendType: 'elevation'
  },
  soilMoisture: {
    id: 'soilMoisture',
    group: 'ENVIRONMENT',
    color: '#d946ef',
    displayName: 'Soil Moisture (SMAP)',
    type: 'raster',
    coarseResolution: true,
    hasOpacity: true,
    hasLegend: true,
    legendType: 'soil'
  },
  sentinel2: {
    id: 'sentinel2',
    group: 'BASE',
    color: '#d1d5db',
    displayName: 'Sentinel-2 True Color',
    type: 'raster',
    hasOpacity: true
  }
};
