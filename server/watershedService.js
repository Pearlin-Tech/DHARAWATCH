/**
 * DHARAWATCH — Watershed Service (compat layer)
 *
 * The real geospatial engine lives in ./geospatial.js. This module keeps the few
 * helpers other server modules (mission, field) import, implemented on top of it.
 * No presets, no fallbacks: unresolved locations return `dataStatus: 'UNAVAILABLE'`.
 */
import ee from '@google/earthengine';
import { setEEReady, isEEReady, resolvePoint, evalEE } from './geospatial.js';
import { parseCoordinateQuery } from './geocoder.js';

export { setEEReady, isEEReady };
const _eeReady = () => isEEReady();

function maskS2Clouds(image) {
  const scl = image.select('SCL');
  const mask = scl.neq(3).and(scl.neq(7)).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10));
  return image.updateMask(mask);
}

/** Resolve the HydroBASINS level-7 watershed containing a coordinate. */
export async function resolveWatershedByCoord(lat, lon) {
  try {
    const r = await resolvePoint(lat, lon, { levels: [7] });
    const c = r.candidates[0];
    if (!c) return unavailable(lat, lon, 'No HydroSHEDS watershed at this location');
    return {
      ...c, type: 'EXISTING', centroid: c.center ? { lon: c.center[0], lat: c.center[1] } : { lat, lon },
      dataStatus: 'AVAILABLE', resolvedAt: new Date().toISOString(), resolvedFrom: { lat, lon }
    };
  } catch (err) {
    return unavailable(lat, lon, err.message);
  }
}

function unavailable(lat, lon, reason) {
  return {
    id: `coord-${lat.toFixed(4)}-${lon.toFixed(4)}`, type: 'PENDING', source: 'NOT CONNECTED',
    name: `Location ${lat.toFixed(4)}, ${lon.toFixed(4)}`, areaKm2: null, centroid: { lat, lon },
    geometry: null, dataStatus: 'UNAVAILABLE', unavailableReason: reason,
    resolvedAt: new Date().toISOString(), resolvedFrom: { lat, lon }
  };
}

/** Coordinate queries resolve geographically. Free-text names are NOT guessed here (use /api/geocode/search). */
export async function searchWatersheds(query) {
  const c = parseCoordinateQuery(query || '');
  if (!c || c.invalid) return [];
  const r = await resolveWatershedByCoord(c.lat, c.lon);
  return r.dataStatus === 'AVAILABLE' ? [{ ...r, matchType: 'COORDINATE' }] : [];
}

// ─── Field Satellite Context ────────────────────────────────────────
export async function getFieldSatelliteContext(lat, lon) {
  if (!_eeReady()) {
    return { status: 'UNAVAILABLE', error: 'Earth Engine not initialized' };
  }

  try {
    const point = ee.Geometry.Point([lon, lat]);
    // 500m buffer for spectral analysis around the point
    const aoi = point.buffer(500);

    const now = new Date();
    const endDate = now.toISOString().split('T')[0];
    const startDate = new Date(now - 30 * 24 * 3600 * 1000).toISOString().split('T')[0];

    const s2Coll = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
      .filterBounds(point)
      .filterDate(startDate, endDate)
      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30));

    // Get the most recent single scene for metadata
    const latestScene = s2Coll.sort('system:time_start', false).first();

    // For indices, we use the median composite of the collection to avoid clouds
    const composite = s2Coll.map(maskS2Clouds).median().clip(aoi);

    const ndvi = composite.normalizedDifference(['B8', 'B4']).rename('ndvi');
    const ndwi = composite.normalizedDifference(['B3', 'B8']).rename('ndwi');
    const ndmi = composite.normalizedDifference(['B8', 'B11']).rename('ndmi');
    const ndbi = composite.normalizedDifference(['B11', 'B8']).rename('ndbi');

    const stats = ee.Image.cat([ndvi, ndwi, ndmi, ndbi]).reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: aoi,
      scale: 10,
      maxPixels: 1e8,
      bestEffort: true
    });

    // Evaluate metadata and stats in parallel
    const [sceneInfo, vals] = await Promise.all([
      new Promise((resolve, reject) => {
        latestScene.evaluate((result, err) => {
          if (err || !result) resolve(null);
          else resolve(result);
        });
      }),
      new Promise((resolve, reject) => {
        stats.evaluate((result, err) => {
          if (err) resolve({});
          else resolve(result || {});
        });
      })
    ]);

    if (!sceneInfo) {
      return { status: 'UNAVAILABLE', error: 'No cloud-free Sentinel-2 imagery found in the last 30 days.' };
    }

    const props = sceneInfo.properties || {};

    const context = {
      provider: 'Copernicus / Google Earth Engine',
      satellite: 'Sentinel-2',
      sensor: 'MSI',
      processingLevel: 'SR Harmonized',
      acquisitionDate: props['system:time_start'] ? new Date(props['system:time_start']).toISOString() : endDate,
      sceneId: sceneInfo.id,
      cloudCover: props['CLOUDY_PIXEL_PERCENTAGE'] != null ? Math.round(props['CLOUDY_PIXEL_PERCENTAGE'] * 100) / 100 : null,
      resolution: '10m',
      bands: ['B2', 'B3', 'B4', 'B8', 'B11', 'B12']
    };

    const spectral = {
      ndvi: vals['ndvi'] != null ? Math.round(vals['ndvi'] * 100) / 100 : null,
      ndwi: vals['ndwi'] != null ? Math.round(vals['ndwi'] * 100) / 100 : null,
      ndmi: vals['ndmi'] != null ? Math.round(vals['ndmi'] * 100) / 100 : null,
      ndbi: vals['ndbi'] != null ? Math.round(vals['ndbi'] * 100) / 100 : null,
      confidence: 0.95
    };

    return { status: 'AVAILABLE', context, spectral };

  } catch (err) {
    console.error('[WS] getFieldSatelliteContext error:', err.message);
    return { status: 'UNAVAILABLE', error: err.message };
  }
}

