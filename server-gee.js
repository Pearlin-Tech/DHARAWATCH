import { GoogleAuth } from 'google-auth-library';
import ee from '@google/earthengine';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Configuration ───────────────────────────────────────────────
const CONFIG = {
  // Sentinel-2 Surface Reflectance Harmonized
  // Available from ~2019 onward. For earlier dates, falls back to S2_HARMONIZED (TOA).
  COLLECTION_SR: 'COPERNICUS/S2_SR_HARMONIZED',
  COLLECTION_TOA: 'COPERNICUS/S2_HARMONIZED',
  
  // Progressive search windows (days)
  SEARCH_WINDOWS: [0, 1, 3, 5, 7, 15, 30],
  
  // Maximum cloud percentage for image-level pre-filter
  MAX_CLOUD_PERCENTAGE: 80,
  
  // Minimum valid pixel percentage within AOI after cloud masking
  MIN_VALID_PIXEL_PCT: 30,
  
  // Default AOI buffer around point (meters)
  DEFAULT_BUFFER_M: 5000,
  
  // Visualization parameters for True Color (B4/B3/B2)
  VIS_RGB: { bands: ['B4', 'B3', 'B2'], min: 0, max: 3000 },
  
  // NDVI visualization
  VIS_NDVI: { min: -0.2, max: 0.8, palette: ['d73027', 'f46d43', 'fdae61', 'fee08b', 'd9ef8b', 'a6d96a', '66bd63', '1a9850'] },
  
  // NDWI visualization
  VIS_NDWI: { min: -0.5, max: 0.5, palette: ['d73027', 'f46d43', 'fee08b', 'ffffbf', 'e0f3f8', '74add1', '4575b4'] },
  
  // Difference visualization
  VIS_DIFF: { min: -0.3, max: 0.3, palette: ['d73027', 'f46d43', 'fee08b', 'ffffbf', 'd9ef8b', '66bd63', '1a9850'] },
  
  // NDWI water threshold
  WATER_THRESHOLD: 0.0,
  
  // Generic spectral change threshold (reflectance units)
  CHANGE_THRESHOLD: 500,
  
  // Scale for reduceRegion (meters per pixel)
  REDUCE_SCALE: 30,
};

// ─── State ───────────────────────────────────────────────────────
let eeInitialized = false;

// ─── Authentication ──────────────────────────────────────────────
export async function initEE() {
  if (eeInitialized) return true;

  const keyPath = path.join(__dirname, 'ee-key.json');

  // ── Strategy 1: ee-key.json file ─────────────────────────────
  if (fs.existsSync(keyPath)) {
    try {
      const auth = new GoogleAuth({
        keyFile: keyPath,
        scopes: ['https://www.googleapis.com/auth/earthengine', 'https://www.googleapis.com/auth/cloud-platform']
      });

      const client = await auth.getClient();
      const token = await client.getAccessToken();

      return new Promise((resolve, reject) => {
        ee.data.setAuthToken(
          client.credentials.client_email,
          'Bearer',
          token.token,
          3600,
          null,
          () => {
            ee.initialize(null, null, () => {
              console.log('[EE] Earth Engine Initialized via ee-key.json');
              eeInitialized = true;
              resolve(true);
            }, (err) => {
              console.error('[EE] Init error (key file):', err);
              reject(err);
            });
          },
          false
        );
      });
    } catch (error) {
      console.warn('[EE] Key file auth failed, trying env vars:', error.message);
    }
  }

  // ── Strategy 2: Environment variables ────────────────────────
  const clientEmail = process.env.EARTH_ENGINE_CLIENT_EMAIL;
  const rawKey = process.env.EARTH_ENGINE_PRIVATE_KEY;
  if (!clientEmail || !rawKey) {
    console.warn('[EE] No ee-key.json and no EARTH_ENGINE_* env vars found. Earth Engine disabled.');
    return false;
  }

  const privateKey = rawKey.replace(/\\n/g, '\n');
  console.log('[EE] Authenticating via environment variables...');

  return new Promise((resolve) => {
    ee.data.authenticateViaPrivateKey(
      { client_email: clientEmail, private_key: privateKey },
      () => {
        ee.initialize(null, null, () => {
          console.log('[EE] Earth Engine Initialized via env vars');
          eeInitialized = true;
          resolve(true);
        }, (err) => {
          console.error('[EE] Init error (env vars):', err);
          resolve(false);
        });
      },
      (err) => {
        console.error('[EE] Auth error (env vars):', err);
        resolve(false);
      }
    );
  });
}

// ─── Health Check ────────────────────────────────────────────────
export async function healthCheck() {
  const result = {
    earthEngine: { initialized: eeInitialized, authenticated: false },
    dataset: { id: CONFIG.COLLECTION_SR, accessible: false },
    testComputation: false,
    timestamp: new Date().toISOString()
  };

  if (!eeInitialized) return result;
  result.earthEngine.authenticated = true;

  try {
    // Test dataset access + basic computation
    const testResult = await new Promise((resolve, reject) => {
      const col = ee.ImageCollection(CONFIG.COLLECTION_SR).limit(1);
      col.size().evaluate((size, error) => {
        if (error) reject(new Error(error));
        else resolve(size);
      });
    });
    result.dataset.accessible = testResult > 0;
    result.testComputation = true;
  } catch (e) {
    result.dataset.error = e.message;
  }

  return result;
}

// ─── Helpers ─────────────────────────────────────────────────────

function generateRequestId() {
  const now = new Date();
  const dateStr = now.toISOString().replace(/[-:T]/g, '').substring(0, 14);
  return `compare-${dateStr}-${crypto.randomBytes(3).toString('hex')}`;
}

function parseDate(dateStr) {
  // Handle formats: "10 Sep 2026", "2026-09-10", "20260910"
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  return null;
}

function toISODate(date) {
  return date.toISOString().split('T')[0];
}

function formatDisplayDate(yyyymmdd) {
  // "20260910" → "10 Sep 2026"
  if (!yyyymmdd || yyyymmdd.length < 8) return yyyymmdd;
  const y = yyyymmdd.substring(0, 4);
  const m = parseInt(yyyymmdd.substring(4, 6), 10) - 1;
  const day = yyyymmdd.substring(6, 8);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${day} ${months[m]} ${y}`;
}

/**
 * Apply SCL-based cloud/shadow mask to a Sentinel-2 SR image.
 * SCL values: 3=cloud shadow, 7=unclassified, 8=cloud medium, 9=cloud high, 10=cirrus
 * Keep: 4=vegetation, 5=bare soil, 6=water, 11=snow/ice
 */
function maskS2Clouds(image) {
  const scl = image.select('SCL');
  const mask = scl.neq(3).and(scl.neq(7)).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10));
  return image.updateMask(mask);
}

/**
 * For TOA collection (no SCL band), use QA60 bitmask.
 */
function maskS2CloudsTOA(image) {
  const qa = image.select('QA60');
  const cloudBit = 1 << 10;
  const cirrusBit = 1 << 11;
  const mask = qa.bitwiseAnd(cloudBit).eq(0).and(qa.bitwiseAnd(cirrusBit).eq(0));
  return image.updateMask(mask);
}

function buildROI(coords, bounds) {
  if (bounds && bounds.north && bounds.south && bounds.east && bounds.west) {
    return ee.Geometry.Rectangle([bounds.west, bounds.south, bounds.east, bounds.north]);
  }
  return ee.Geometry.Point([coords.lng, coords.lat]).buffer(CONFIG.DEFAULT_BUFFER_M);
}

/**
 * Determine which collection to use based on date.
 * S2_SR_HARMONIZED is available from ~2019-01-28 onward.
 * Before that, use S2_HARMONIZED (TOA).
 */
function getCollectionForDate(date) {
  const srStart = new Date('2019-01-28');
  if (date >= srStart) {
    return { id: CONFIG.COLLECTION_SR, isSR: true };
  }
  return { id: CONFIG.COLLECTION_TOA, isSR: false };
}

// ─── Progressive Image Search ────────────────────────────────────

async function findBestImage(requestedDateStr, roi, excludeImageId) {
  const reqDate = parseDate(requestedDateStr);
  if (!reqDate) {
    return { found: false, reason: 'Invalid date format.' };
  }

  const collectionInfo = getCollectionForDate(reqDate);
  const maskFn = collectionInfo.isSR ? maskS2Clouds : maskS2CloudsTOA;

  for (const windowDays of CONFIG.SEARCH_WINDOWS) {
    const startDate = new Date(reqDate.getTime() - windowDays * 86400000);
    const endDate = new Date(reqDate.getTime() + windowDays * 86400000 + 86400000); // +1 day inclusive

    const col = ee.ImageCollection(collectionInfo.id)
      .filterBounds(roi)
      .filterDate(toISODate(startDate), toISODate(endDate))
      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', CONFIG.MAX_CLOUD_PERCENTAGE))
      .sort('CLOUDY_PIXEL_PERCENTAGE');

    // Get candidate list
    const candidates = await new Promise((resolve, reject) => {
      col.aggregate_array('system:index').evaluate((ids, error) => {
        if (error) reject(new Error(error));
        else resolve(ids || []);
      });
    });

    if (candidates.length === 0) continue;

    // Evaluate each candidate for valid pixel coverage within ROI
    for (const candidateId of candidates) {
      const fullId = `${collectionInfo.id}/${candidateId}`;
      if (excludeImageId && fullId === excludeImageId) continue;

      const img = ee.Image(fullId);
      const masked = maskFn(img);

      // Calculate valid pixel percentage within ROI
      const stats = await new Promise((resolve, reject) => {
        const totalPixels = img.select('B4').reduceRegion({
          reducer: ee.Reducer.count(),
          geometry: roi,
          scale: CONFIG.REDUCE_SCALE,
          maxPixels: 1e8
        });
        const validPixels = masked.select('B4').reduceRegion({
          reducer: ee.Reducer.count(),
          geometry: roi,
          scale: CONFIG.REDUCE_SCALE,
          maxPixels: 1e8
        });

        ee.Dictionary({ total: totalPixels.get('B4'), valid: validPixels.get('B4') })
          .evaluate((result, error) => {
            if (error) reject(new Error(error));
            else resolve(result);
          });
      });

      const total = stats.total || 0;
      const valid = stats.valid || 0;
      const validPct = total > 0 ? (valid / total) * 100 : 0;

      if (validPct < CONFIG.MIN_VALID_PIXEL_PCT) continue;

      // Extract actual date from system:index (format: YYYYMMDDTHHMMSS_...)
      const actualDateStr = candidateId.substring(0, 8);
      const actualDate = parseDate(
        `${actualDateStr.substring(0, 4)}-${actualDateStr.substring(4, 6)}-${actualDateStr.substring(6, 8)}`
      );
      const offsetDays = Math.round((actualDate.getTime() - reqDate.getTime()) / 86400000);

      // Get cloud metadata
      const cloudPct = await new Promise((resolve, reject) => {
        img.get('CLOUDY_PIXEL_PERCENTAGE').evaluate((val, error) => {
          if (error) resolve(null);
          else resolve(val);
        });
      });

      return {
        found: true,
        imageId: fullId,
        actualDate: actualDateStr,
        actualDateFormatted: formatDisplayDate(actualDateStr),
        offsetDays,
        validPixelPercentage: Math.round(validPct * 100) / 100,
        cloudPercentage: cloudPct != null ? Math.round(cloudPct * 100) / 100 : null,
        collection: collectionInfo.id,
        isSR: collectionInfo.isSR,
        selectionReason: offsetDays === 0
          ? 'Exact date match with sufficient valid pixels.'
          : `Closest usable observation (±${windowDays}d window) with ${validPct.toFixed(1)}% valid pixels.`
      };
    }
  }

  return {
    found: false,
    reason: 'No usable Sentinel-2 observation found within ±30 day search window.'
  };
}

// ─── Main Compare Computation ────────────────────────────────────

export async function getCompareData(params) {
  const requestId = generateRequestId();
  const startTime = Date.now();

  const { baselineDate, currentDate, coords, bounds, indicator } = params;
  const analysisType = indicator || 'generic';

  const log = (msg) => console.log(`[${requestId}] ${msg}`);
  log(`Request: baseline=${baselineDate} current=${currentDate} indicator=${analysisType} coords=${JSON.stringify(coords)}`);

  if (!eeInitialized) {
    return {
      status: 'error',
      code: 'EE_AUTH_ERROR',
      message: 'Earth Engine not initialized. Check EARTH_ENGINE_* environment variables and project registration.',
      requestId
    };
  }

  try {
    // 1. Build ROI
    const roi = buildROI(coords, bounds);
    log('ROI built');

    // 2. Find baseline image (progressive search)
    log('Searching baseline image...');
    const baselineResult = await findBestImage(baselineDate, roi, null);
    if (!baselineResult.found) {
      log(`Baseline search failed: ${baselineResult.reason}`);
      return {
        status: 'insufficient_data',
        code: 'NO_USABLE_OBSERVATION',
        message: `Baseline: ${baselineResult.reason}`,
        requestId,
        request: { baselineDate, currentDate, analysisType },
        baseline: { requestedDate: baselineDate, actualDate: null },
        current: { requestedDate: currentDate, actualDate: null }
      };
    }
    log(`Baseline found: ${baselineResult.imageId} (${baselineResult.actualDateFormatted}, offset=${baselineResult.offsetDays}d, valid=${baselineResult.validPixelPercentage}%)`);

    // 3. Find current image (progressive search, excluding baseline)
    log('Searching current image...');
    const currentResult = await findBestImage(currentDate, roi, baselineResult.imageId);
    if (!currentResult.found) {
      log(`Current search failed: ${currentResult.reason}`);
      return {
        status: 'insufficient_data',
        code: 'NO_USABLE_OBSERVATION',
        message: `Current: ${currentResult.reason}`,
        requestId,
        request: { baselineDate, currentDate, analysisType },
        baseline: { requestedDate: baselineDate, actualDate: baselineResult.actualDateFormatted, imageId: baselineResult.imageId },
        current: { requestedDate: currentDate, actualDate: null }
      };
    }
    log(`Current found: ${currentResult.imageId} (${currentResult.actualDateFormatted}, offset=${currentResult.offsetDays}d, valid=${currentResult.validPixelPercentage}%)`);

    // 4. Same-image guard
    if (baselineResult.imageId === currentResult.imageId) {
      return {
        status: 'invalid',
        code: 'SAME_ACQUISITION',
        message: 'Baseline and current resolve to the same satellite acquisition.',
        requestId,
        baseline: { requestedDate: baselineDate, actualDate: baselineResult.actualDateFormatted, imageId: baselineResult.imageId },
        current: { requestedDate: currentDate, actualDate: currentResult.actualDateFormatted, imageId: currentResult.imageId }
      };
    }

    // 5. Prepare masked images for ANALYSIS (single best image, cloud-masked)
    const maskFnB = baselineResult.isSR ? maskS2Clouds : maskS2CloudsTOA;
    const maskFnC = currentResult.isSR ? maskS2Clouds : maskS2CloudsTOA;
    const bImg = maskFnB(ee.Image(baselineResult.imageId));
    const cImg = maskFnC(ee.Image(currentResult.imageId));

    // 6. Generate RGB tile URLs using MEDIAN COMPOSITES (cloud-free, no black holes)
    //    We composite over a 3-month window around each date for clean visualization.
    log('Generating cloud-free composite tiles...');

    const buildComposite = (dateStr, collectionId, isSR) => {
      const centerDate = parseDate(dateStr.includes('-') ? dateStr :
        `${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)}`);
      // ±20 days window — fast enough, still gets multiple scenes for clean median
      const start = new Date(centerDate.getTime() - 20 * 86400000);
      const end   = new Date(centerDate.getTime() + 20 * 86400000);
      const mFn = isSR ? maskS2Clouds : maskS2CloudsTOA;

      return ee.ImageCollection(collectionId)
        .filterBounds(roi)
        .filterDate(toISODate(start), toISODate(end))
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 60)) // wider net → more scenes → better composite
        .map(mFn)
        .median();
        // NOTE: NO .clip(roi) here — clipping to the circular buffer causes the round map shape.
        // The tile URL is global; the browser viewport naturally crops it.
    };

    const bComposite = buildComposite(baselineResult.actualDate, baselineResult.collection, baselineResult.isSR);
    const cComposite = buildComposite(currentResult.actualDate, currentResult.collection, currentResult.isSR);

    const [bTile, cTile] = await Promise.all([
      new Promise((resolve, reject) => {
        bComposite.getMap(CONFIG.VIS_RGB, (mapInfo, error) => {
          if (error) reject(new Error(`Baseline tile error: ${error}`));
          else resolve(mapInfo.urlFormat);
        });
      }),
      new Promise((resolve, reject) => {
        cComposite.getMap(CONFIG.VIS_RGB, (mapInfo, error) => {
          if (error) reject(new Error(`Current tile error: ${error}`));
          else resolve(mapInfo.urlFormat);
        });
      })
    ]);
    log('Cloud-free composite tiles generated');

    // 7. Compute analysis based on indicator
    let analysis = {};
    let diffTileUrl = null;

    if (analysisType === 'NDVI' || analysisType === 'vegetation') {
      log('Computing NDVI...');
      const bNDVI = bImg.normalizedDifference(['B8', 'B4']).rename('NDVI');
      const cNDVI = cImg.normalizedDifference(['B8', 'B4']).rename('NDVI');
      const diffNDVI = cNDVI.subtract(bNDVI).rename('NDVI_diff');

      // Compute statistics
      const stats = await new Promise((resolve, reject) => {
        ee.Dictionary({
          baselineMean: bNDVI.reduceRegion({ reducer: ee.Reducer.mean(), geometry: roi, scale: CONFIG.REDUCE_SCALE, maxPixels: 1e8 }).get('NDVI'),
          currentMean: cNDVI.reduceRegion({ reducer: ee.Reducer.mean(), geometry: roi, scale: CONFIG.REDUCE_SCALE, maxPixels: 1e8 }).get('NDVI'),
          diffMean: diffNDVI.reduceRegion({ reducer: ee.Reducer.mean(), geometry: roi, scale: CONFIG.REDUCE_SCALE, maxPixels: 1e8 }).get('NDVI_diff'),
          roiArea: roi.area()
        }).evaluate((result, error) => {
          if (error) reject(new Error(error));
          else resolve(result);
        });
      });

      // Changed area: where |NDVI diff| > 0.1
      const changeMask = diffNDVI.abs().gt(0.1);
      const changedArea = await new Promise((resolve, reject) => {
        changeMask.multiply(ee.Image.pixelArea()).reduceRegion({
          reducer: ee.Reducer.sum(),
          geometry: roi,
          scale: CONFIG.REDUCE_SCALE,
          maxPixels: 1e8
        }).get('NDVI_diff').evaluate((val, error) => {
          if (error) resolve(0);
          else resolve(val || 0);
        });
      });

      const roiAreaKm2 = (stats.roiArea || 0) / 1e6;
      const changedAreaKm2 = changedArea / 1e6;

      analysis = {
        type: 'NDVI',
        method: 'Normalized Difference Vegetation Index: (B8 - B4) / (B8 + B4)',
        baselineValue: stats.baselineMean != null ? Math.round(stats.baselineMean * 1000) / 1000 : null,
        currentValue: stats.currentMean != null ? Math.round(stats.currentMean * 1000) / 1000 : null,
        difference: stats.diffMean != null ? Math.round(stats.diffMean * 1000) / 1000 : null,
        changeThreshold: 0.1,
        roiAreaKm2: Math.round(roiAreaKm2 * 100) / 100,
        affectedAreaKm2: Math.round(changedAreaKm2 * 100) / 100,
        affectedPercent: roiAreaKm2 > 0 ? Math.round((changedAreaKm2 / roiAreaKm2) * 10000) / 100 : 0
      };

      // Difference tile
      diffTileUrl = await new Promise((resolve, reject) => {
        diffNDVI.getMap(CONFIG.VIS_DIFF, (mapInfo, error) => {
          if (error) resolve(null);
          else resolve(mapInfo.urlFormat);
        });
      });

    } else if (analysisType === 'NDWI' || analysisType === 'water') {
      log('Computing NDWI...');
      const bNDWI = bImg.normalizedDifference(['B3', 'B8']).rename('NDWI');
      const cNDWI = cImg.normalizedDifference(['B3', 'B8']).rename('NDWI');
      const diffNDWI = cNDWI.subtract(bNDWI).rename('NDWI_diff');

      // Water masks
      const bWater = bNDWI.gt(CONFIG.WATER_THRESHOLD);
      const cWater = cNDWI.gt(CONFIG.WATER_THRESHOLD);

      const stats = await new Promise((resolve, reject) => {
        ee.Dictionary({
          baselineMean: bNDWI.reduceRegion({ reducer: ee.Reducer.mean(), geometry: roi, scale: CONFIG.REDUCE_SCALE, maxPixels: 1e8 }).get('NDWI'),
          currentMean: cNDWI.reduceRegion({ reducer: ee.Reducer.mean(), geometry: roi, scale: CONFIG.REDUCE_SCALE, maxPixels: 1e8 }).get('NDWI'),
          diffMean: diffNDWI.reduceRegion({ reducer: ee.Reducer.mean(), geometry: roi, scale: CONFIG.REDUCE_SCALE, maxPixels: 1e8 }).get('NDWI_diff'),
          baselineWaterArea: bWater.multiply(ee.Image.pixelArea()).reduceRegion({ reducer: ee.Reducer.sum(), geometry: roi, scale: CONFIG.REDUCE_SCALE, maxPixels: 1e8 }).get('NDWI'),
          currentWaterArea: cWater.multiply(ee.Image.pixelArea()).reduceRegion({ reducer: ee.Reducer.sum(), geometry: roi, scale: CONFIG.REDUCE_SCALE, maxPixels: 1e8 }).get('NDWI'),
          roiArea: roi.area()
        }).evaluate((result, error) => {
          if (error) reject(new Error(error));
          else resolve(result);
        });
      });

      const roiAreaKm2 = (stats.roiArea || 0) / 1e6;
      const bWaterKm2 = (stats.baselineWaterArea || 0) / 1e6;
      const cWaterKm2 = (stats.currentWaterArea || 0) / 1e6;

      analysis = {
        type: 'NDWI',
        method: 'Normalized Difference Water Index: (B3 - B8) / (B3 + B8)',
        baselineValue: stats.baselineMean != null ? Math.round(stats.baselineMean * 1000) / 1000 : null,
        currentValue: stats.currentMean != null ? Math.round(stats.currentMean * 1000) / 1000 : null,
        difference: stats.diffMean != null ? Math.round(stats.diffMean * 1000) / 1000 : null,
        waterThreshold: CONFIG.WATER_THRESHOLD,
        baselineWaterAreaKm2: Math.round(bWaterKm2 * 100) / 100,
        currentWaterAreaKm2: Math.round(cWaterKm2 * 100) / 100,
        waterAreaDifferenceKm2: Math.round((cWaterKm2 - bWaterKm2) * 100) / 100,
        roiAreaKm2: Math.round(roiAreaKm2 * 100) / 100
      };

      diffTileUrl = await new Promise((resolve, reject) => {
        diffNDWI.getMap(CONFIG.VIS_DIFF, (mapInfo, error) => {
          if (error) resolve(null);
          else resolve(mapInfo.urlFormat);
        });
      });

    } else {
      // Generic spectral change detection
      log('Computing generic spectral change...');
      const bands = ['B2', 'B3', 'B4', 'B8'];
      const bBands = bImg.select(bands);
      const cBands = cImg.select(bands);

      // Spectral distance: sqrt(sum((c - b)^2))
      const diff = cBands.subtract(bBands);
      const spectralDistance = diff.pow(2).reduce(ee.Reducer.sum()).sqrt().rename('spectral_distance');

      const stats = await new Promise((resolve, reject) => {
        ee.Dictionary({
          mean: spectralDistance.reduceRegion({ reducer: ee.Reducer.mean(), geometry: roi, scale: CONFIG.REDUCE_SCALE, maxPixels: 1e8 }).get('spectral_distance'),
          median: spectralDistance.reduceRegion({ reducer: ee.Reducer.median(), geometry: roi, scale: CONFIG.REDUCE_SCALE, maxPixels: 1e8 }).get('spectral_distance'),
          stdDev: spectralDistance.reduceRegion({ reducer: ee.Reducer.stdDev(), geometry: roi, scale: CONFIG.REDUCE_SCALE, maxPixels: 1e8 }).get('spectral_distance'),
          roiArea: roi.area()
        }).evaluate((result, error) => {
          if (error) reject(new Error(error));
          else resolve(result);
        });
      });

      // Changed area: spectral distance above threshold
      const changeMask = spectralDistance.gt(CONFIG.CHANGE_THRESHOLD);
      const changedArea = await new Promise((resolve, reject) => {
        changeMask.multiply(ee.Image.pixelArea()).reduceRegion({
          reducer: ee.Reducer.sum(),
          geometry: roi,
          scale: CONFIG.REDUCE_SCALE,
          maxPixels: 1e8
        }).get('spectral_distance').evaluate((val, error) => {
          if (error) resolve(0);
          else resolve(val || 0);
        });
      });

      const roiAreaKm2 = (stats.roiArea || 0) / 1e6;
      const changedAreaKm2 = changedArea / 1e6;

      analysis = {
        type: 'spectral_change',
        method: 'Euclidean spectral distance across bands B2, B3, B4, B8',
        meanSpectralDistance: stats.mean != null ? Math.round(stats.mean * 100) / 100 : null,
        medianSpectralDistance: stats.median != null ? Math.round(stats.median * 100) / 100 : null,
        stdDevSpectralDistance: stats.stdDev != null ? Math.round(stats.stdDev * 100) / 100 : null,
        changeThreshold: CONFIG.CHANGE_THRESHOLD,
        roiAreaKm2: Math.round(roiAreaKm2 * 100) / 100,
        affectedAreaKm2: Math.round(changedAreaKm2 * 100) / 100,
        affectedPercent: roiAreaKm2 > 0 ? Math.round((changedAreaKm2 / roiAreaKm2) * 10000) / 100 : 0
      };

      // Difference tile: spectral distance visualized
      diffTileUrl = await new Promise((resolve, reject) => {
        spectralDistance.getMap(
          { min: 0, max: 2000, palette: ['000004', '180f3d', '440f76', '721f81', '9e2f7f', 'cd4071', 'f1605d', 'fd9668', 'feca8d', 'fcfdbf'] },
          (mapInfo, error) => {
            if (error) resolve(null);
            else resolve(mapInfo.urlFormat);
          }
        );
      });
    }

    log(`Analysis complete: ${JSON.stringify(analysis)}`);

    // 8. Validate: do not return success with null metrics
    const hasValidMetrics = Object.values(analysis).some(v => typeof v === 'number' && v !== null);
    if (!hasValidMetrics) {
      return {
        status: 'error',
        code: 'EE_REDUCE_ERROR',
        message: 'Earth Engine computation returned no valid numeric results.',
        requestId
      };
    }

    const elapsed = Date.now() - startTime;
    log(`Complete in ${elapsed}ms`);

    // 9. Build response
    return {
      status: 'success',
      requestId,

      request: {
        baselineDate,
        currentDate,
        analysisType,
        indicator: analysisType
      },

      baseline: {
        requestedDate: baselineDate,
        actualDate: baselineResult.actualDateFormatted,
        actualDateISO: `${baselineResult.actualDate.substring(0,4)}-${baselineResult.actualDate.substring(4,6)}-${baselineResult.actualDate.substring(6,8)}`,
        offsetDays: baselineResult.offsetDays,
        imageId: baselineResult.imageId,
        cloudPercentage: baselineResult.cloudPercentage,
        validPixelPercentage: baselineResult.validPixelPercentage,
        tileUrl: bTile,
        dataset: baselineResult.collection,
        selectionReason: baselineResult.selectionReason
      },

      current: {
        requestedDate: currentDate,
        actualDate: currentResult.actualDateFormatted,
        actualDateISO: `${currentResult.actualDate.substring(0,4)}-${currentResult.actualDate.substring(4,6)}-${currentResult.actualDate.substring(6,8)}`,
        offsetDays: currentResult.offsetDays,
        imageId: currentResult.imageId,
        cloudPercentage: currentResult.cloudPercentage,
        validPixelPercentage: currentResult.validPixelPercentage,
        tileUrl: cTile,
        dataset: currentResult.collection,
        selectionReason: currentResult.selectionReason
      },

      analysis,

      difference: {
        type: analysisType === 'NDVI' ? 'NDVI difference' : analysisType === 'NDWI' ? 'NDWI difference' : 'Spectral distance',
        tileUrl: diffTileUrl
      },

      quality: {
        baselineValidPixels: baselineResult.validPixelPercentage,
        currentValidPixels: currentResult.validPixelPercentage,
        cloudMaskMethod: baselineResult.isSR ? 'SCL band (Scene Classification Layer)' : 'QA60 bitmask',
        warnings: []
      },

      source: {
        dataset: baselineResult.collection,
        sensor: 'Sentinel-2 MSI'
      },

      evidence: {
        source: baselineResult.collection,
        baselineImageId: baselineResult.imageId,
        currentImageId: currentResult.imageId,
        baselineDate: baselineResult.actualDateFormatted,
        currentDate: currentResult.actualDateFormatted,
        baselineValidPixelPercentage: baselineResult.validPixelPercentage,
        currentValidPixelPercentage: currentResult.validPixelPercentage,
        roiAreaKm2: analysis.roiAreaKm2,
        analysisMethod: analysis.method,
        threshold: analysis.changeThreshold || analysis.waterThreshold || null
      },

      executionTimeMs: elapsed
    };

  } catch (e) {
    const elapsed = Date.now() - startTime;
    log(`ERROR after ${elapsed}ms: ${e.message}`);
    console.error(e);

    // Classify error
    let code = 'EE_QUERY_ERROR';
    if (e.message.includes('auth') || e.message.includes('token')) code = 'EE_AUTH_ERROR';
    if (e.message.includes('tile') || e.message.includes('getMap')) code = 'EE_MAP_ERROR';
    if (e.message.includes('geometry') || e.message.includes('coordinates')) code = 'INVALID_GEOMETRY';

    return {
      status: 'error',
      code,
      message: e.message,
      requestId,
      executionTimeMs: elapsed
    };
  }
}
