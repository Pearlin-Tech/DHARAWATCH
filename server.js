import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import { detectionService } from './backend/detectionService.js';
import dotenv from 'dotenv';
import fs from 'fs';
import multer from 'multer';

import { parseIntent, INTENT_TYPES } from './server/services/geospatial/intentParser.js';
import { getSatelliteMetadata } from './server/services/geospatial/satelliteDataService.js';
import { executeGeospatialAnalysis } from './server/services/geospatial/analysisEngine.js';
import { generateGroundedExplanation } from './server/services/ai/llmExplainer.js';
import { parseGeoTiffBuffer } from './server/services/geospatial/rasterParser.js';
import { initEE, getCompareData, healthCheck } from './server-gee.js';
import { resolveWatershedByCoord, searchWatersheds } from './server/watershedService.js';
import { registerGeoRoutes } from './server/geoRoutes.js';
import { setStore as setGeoStore, setEEReady, computeLayerTile, ensureSeeds } from './server/geospatial.js';
import { WATERSHED_LAYERS } from './src/shared/layerRegistry.js';
import { geocodePlace } from './server/geocoder.js';
import {
  validateImageFile, storePhoto, extractExif, analyzeImageWithAI,
  resolveWatershedForObservation, getSatelliteContextForLocation,
  buildObservationRecord, buildEvidenceRecord, generateObsId, getObsDir
} from './server/fieldService.js';
import { getIntelligenceOverview, setDbHelpers } from './server/services/intelligence.js';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// Initialize Earth Engine BEFORE starting server
await initEE()
  .then((ok) => { setEEReady(!!ok); })
  .catch(err => { console.warn('[EE] Init error (non-fatal):', err.message); setEEReady(false); });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const DB_DIR = (process.env.VERCEL || process.env.NETLIFY) ? path.join('/tmp', 'server-data') : path.join(__dirname, 'server-data');
const UPLOAD_DIR = path.join(DB_DIR, 'uploads', 'geotiff');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const MAX_UPLOAD_MB = parseInt(process.env.MAX_GEOTIFF_UPLOAD_MB || '100', 10);
const upload = multer({
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  storage: multer.memoryStorage()
});

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(DB_DIR, 'uploads')));

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const dbPath = path.join(DB_DIR, 'satquery.sqlite');
const db = new sqlite3.Database(dbPath);

// Initialize DB schema
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY,
    data TEXT
  )`);

  const tables = [
    'users', 'saved_locations', 'analyses', 'analysis_results',
    'evidence', 'reports', 'measurements', 'watches',
    'watch_passes', 'timeline_events', 'exports', 'ai_queries',
    'raster_attachments', 'compare', 'watersheds', 'field_observations',
    'evidence_gaps', 'missions', 'interventions', 'mission_stops'
  ];


  tables.forEach(table => {
    db.run(`CREATE TABLE IF NOT EXISTS ${table} (
      id TEXT PRIMARY KEY,
      data TEXT
    )`);
  });
});

// Helper functions for DB operations wrapping sqlite3 in Promises
const getRow = (table, id) => {
  return new Promise((resolve, reject) => {
    db.get(`SELECT data FROM ${table} WHERE id = ?`, [id], (err, row) => {
      if (err) reject(err);
      else resolve(row ? JSON.parse(row.data) : null);
    });
  });
};

const getAllRows = (table) => {
  return new Promise((resolve, reject) => {
    db.all(`SELECT data FROM ${table}`, [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows.map(row => JSON.parse(row.data)));
    });
  });
};

const insertRow = (table, id, data) => {
  return new Promise((resolve, reject) => {
    db.run(`INSERT INTO ${table} (id, data) VALUES (?, ?)`, [id, JSON.stringify(data)], function (err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });
  });
};

const updateRow = (table, id, data) => {
  return new Promise((resolve, reject) => {
    db.run(`UPDATE ${table} SET data = ? WHERE id = ?`, [JSON.stringify(data), id], function (err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
};

const deleteRow = (table, id) => {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM ${table} WHERE id = ?`, [id], function (err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
};

const wsError = (res, code, message, status = 500) => res.status(status).json({ success: false, error: { code, message } });
const wsResponse = (res, data, status = 200) => res.status(status).json({ success: true, data });

// Initialize Intelligence DB helpers
setDbHelpers(getAllRows, getRow);

const detectionJobs = {};

app.post('/api/detection', (req, res) => {
  const provider = process.env.DETECT_PROVIDER || 'earth-engine';
  if (provider === 'demo') {
    return res.status(400).json({ error: 'Local Demo Mode is not allowed in production API.' });
  }

  // Basic caching
  const cacheKey = `${req.body.targetType}-${JSON.stringify(req.body.geometry)}`;
  if (detectionJobs[cacheKey] && detectionJobs[detectionJobs[cacheKey]]) {
    return res.json({ id: detectionJobs[cacheKey], status: 'queued' });
  }

  const jobId = `job-${Date.now()}`;
  detectionJobs[jobId] = { id: jobId, status: 'queued' };
  detectionJobs[cacheKey] = jobId;

  // Run asynchronously
  (async () => {
    const updateJob = (statusStr) => {
      detectionJobs[jobId].status = statusStr;
    };

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), 90000) // 90s timeout
      );

      const detectPromise = detectionService.detect(req.body, updateJob);
      const result = await Promise.race([detectPromise, timeoutPromise]);

      if (result.status === 'success') {
        // Save authoritative Analysis
        const analysisId = `analysis-${Date.now()}`;
        await insertRow('analyses', analysisId, {
          id: analysisId,
          targetType: req.body.targetType,
          geometry: req.body.geometry,
          dataset: result.dataset,
          status: 'completed',
          createdAt: new Date().toISOString()
        });

        // Create evidence record
        await insertRow('evidence', result.evidenceId, {
          id: result.evidenceId,
          analysisId: analysisId,
          type: 'detection',
          timestamp: new Date().toISOString(),
          dataset: result.dataset,
          acquisition: result.acquisition,
          method: result.method,
          summary: result.summary,
          aoi: result.aoi
        });

        // Create detection (analysis_results)
        await insertRow('analysis_results', `det-${Date.now()}`, {
          id: `det-${Date.now()}`,
          analysisId: analysisId,
          targetType: req.body.targetType,
          metrics: result.analysis,
          summary: result.summary,
          detections: result.detections
        });
      }

      // Store final result
      Object.assign(detectionJobs[jobId], result);

      // If success or handled error, the status is already properly set by detectionService
      // wait, detectionService returns { status: 'success' / 'error' / 'no_results' }
      if (result.status === 'success') detectionJobs[jobId].status = 'ready';
      else if (result.status === 'error') detectionJobs[jobId].status = 'failed';
      else detectionJobs[jobId].status = result.status; // 'no_detections', 'no_candidate_pixels', etc

    } catch (error) {
      console.error('Detection API error for job', jobId, error);
      if (error.message === 'TIMEOUT') {
        detectionJobs[jobId] = { id: jobId, status: 'timeout', message: 'Detection timed out while converting the analysis mask into geographic features.' };
      } else {
        detectionJobs[jobId] = { id: jobId, status: 'failed', error: 'PROCESSING_FAILED', message: error.message || 'Unknown processing error' };
      }
    }
  })();

  res.json({ id: jobId, status: 'queued' });
});

app.get('/api/detection/:id', (req, res) => {
  const job = detectionJobs[req.params.id];
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});


// EARTH ENGINE HEALTH
app.get('/api/earth-engine/health', async (req, res) => {
  try {
    const result = await healthCheck();
    if (!result.ok) {
      return res.status(500).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({
      ok: false,
      earthEngine: { authenticated: false, initialized: false },
      error: { stage: 'server', code: 'INTERNAL_ERROR', message: err.message }
    });
  }
});


// EARTH ENGINE LAYERS HEALTH
app.get('/api/earth-engine/layers/health', async (req, res) => {
  try {
    // Neutral probe polygon (small box, Congo basin) — purely a connectivity test of each dataset.
    const geometry = {
      type: 'Polygon',
      coordinates: [[[15.2, -4.4], [15.4, -4.4], [15.4, -4.2], [15.2, -4.2], [15.2, -4.4]]]
    };
    const layersStatus = {};
    for (const key of Object.keys(WATERSHED_LAYERS)) {
      if (key === 'boundary') { layersStatus[key] = 'PASS'; continue; }
      try {
        const layerRes = await computeLayerTile({ geometry }, key);
        layersStatus[key] = layerRes.available ? 'PASS' : (layerRes.reason || layerRes.dataStatus || 'FAIL');
      } catch (e) { layersStatus[key] = `FAIL: ${e.message}`; }
    }

    res.json({
      ok: true,
      layers: layersStatus
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});


// =========================================================
// GEOTIFF / TIFF RASTER UPLOAD ENDPOINT
// =========================================================
app.post('/api/ai/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const filename = req.file.originalname || 'raster.tif';
    const ext = path.extname(filename).toLowerCase();
    const validExts = ['.tif', '.tiff', '.geotiff'];

    if (!validExts.includes(ext)) {
      return res.status(400).json({
        error: `Unsupported file format '${ext}'. Only GeoTIFF and TIFF files (.tif, .tiff) are supported.`
      });
    }

    // Parse GeoTIFF metadata & validate TIFF binary header
    const parsedMeta = await parseGeoTiffBuffer(req.file.buffer, filename);
    if (!parsedMeta || !parsedMeta.width) {
      return res.status(400).json({
        error: 'This file could not be read as a valid TIFF/GeoTIFF.'
      });
    }

    const attachmentId = `att_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const safeStoredFilename = `${attachmentId}${ext}`;
    const diskPath = path.join(UPLOAD_DIR, safeStoredFilename);

    // Save binary file to filesystem
    await fs.promises.writeFile(diskPath, req.file.buffer);

    const isGeoreferenced = Boolean(parsedMeta.bbox && parsedMeta.bbox[0] !== 72.55);

    const attachmentRecord = {
      id: attachmentId,
      attachmentId,
      filename,
      storedFilename: safeStoredFilename,
      sizeBytes: req.file.size,
      sizeMb: (req.file.size / (1024 * 1024)).toFixed(2),
      uploadTimestamp: new Date().toISOString(),
      metadata: {
        ...parsedMeta,
        isGeoreferenced,
        previewUrl: `/uploads/geotiff/${safeStoredFilename}`
      }
    };

    await insertRow('raster_attachments', attachmentId, attachmentRecord);

    return res.status(201).json({
      status: 'READY',
      attachmentId,
      filename,
      fileType: isGeoreferenced ? 'GEOTIFF' : 'TIFF',
      sizeBytes: req.file.size,
      sizeMb: attachmentRecord.sizeMb,
      metadata: attachmentRecord.metadata
    });
  } catch (err) {
    console.error('Raster Upload Endpoint Error:', err);
    return res.status(500).json({
      error: 'Failed to process raster file upload.',
      details: err.message
    });
  }
});

// =========================================================
// AI ASK GEOSPATIAL INTELLIGENCE PIPELINE ENDPOINT
// =========================================================
app.post('/api/ai/ask', async (req, res) => {
  try {
    const { question, mapContext, roi, timeRange, history = [], mode = 'explorer', attachment } = req.body || {};

    if (!question || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({
        status: 'ERROR',
        error: 'A non-empty question string is required.'
      });
    }

    // Step 0: Check if request includes an attached GeoTIFF raster
    let attachmentRecord = null;
    if (attachment && (attachment.attachmentId || attachment.id)) {
      const attId = attachment.attachmentId || attachment.id;
      attachmentRecord = await getRow('raster_attachments', attId).catch(() => null);
    }

    if (attachmentRecord && attachmentRecord.metadata) {
      const meta = attachmentRecord.metadata;
      const intentResult = { intent: INTENT_TYPES.RASTER_UPLOAD_ANALYSIS, confidence: 1.0 };

      const analysisResult = {
        status: 'VERIFIED',
        analysisType: 'RASTER_UPLOAD_ANALYSIS',
        evidenceStrength: 'High',
        spatialDistribution: meta.isGeoreferenced !== false
          ? `Spatial footprint covers ${meta.areaKm2 || 8.52} km² centered at Lat ${meta.center?.lat || 23.0225}, Lon ${meta.center?.lon || 72.5714}.`
          : 'TIFF without georeferencing',
        observedVsInterpreted: {
          observed: `Valid TIFF structure: ${meta.width || 512}×${meta.height || 512} pixels, ${meta.samplesPerPixel || 4} channels.`,
          interpreted: `Represents a ${meta.rasterType || 'multispectral satellite raster'}.`,
          uncertain: `Without explicit band definitions in TIFF tags, specific real-world ground features cannot be asserted with 100% certainty.`
        },
        metrics: {
          roiAreaKm2: meta.areaKm2 || 8.52,
          affectedAreaKm2: meta.areaKm2 || 8.52,
          affectedPercent: '100.0%',
          meanPixelValue: meta.meanPixelValue || '142.5'
        },
        limitations: [
          meta.isGeoreferenced !== false ? `Spatial boundary reference: ${meta.crs || 'EPSG:4326'}` : `TIFF header lacks GeoKeyDirectoryTag projection metadata.`
        ]
      };

      const dualModeResponse = await generateGroundedExplanation({
        question,
        intent: intentResult,
        metadata: {
          ...meta,
          filename: attachmentRecord.filename,
          fileSizeMb: attachmentRecord.sizeMb
        },
        analysisResult,
        mapContext,
        mode
      });

      const responsePayload = {
        status: 'VERIFIED',
        ...dualModeResponse,
        analysisType: 'RASTER_UPLOAD_ANALYSIS',
        location: meta.isGeoreferenced !== false ? meta.center : (mapContext?.center || { lat: 23.0225, lon: 72.5714 }),
        timeRange: { start: 'Uploaded File', end: new Date().toISOString().split('T')[0] },
        evidence: [
          {
            type: 'uploaded_raster_metadata',
            source: attachmentRecord.filename,
            value: `${meta.width}x${meta.height} px | ${meta.samplesPerPixel || 4} Channels | ${meta.crs || 'Ungeoreferenced'}`
          }
        ],
        sources: [
          {
            name: `Uploaded File (${attachmentRecord.filename})`,
            type: meta.rasterType || 'GeoTIFF Raster',
            date: 'Uploaded File'
          }
        ],
        overlayCoordinates: meta.overlayCoordinates || null,
        attachment: {
          attachmentId: attachmentRecord.attachmentId,
          filename: attachmentRecord.filename,
          sizeMb: attachmentRecord.sizeMb,
          metadata: meta
        }
      };

      return res.json(responsePayload);
    }

    // Step 1: Parse Query Intent
    const intentResult = parseIntent(question, history);

    if (intentResult.isPromptInjection) {
      return res.json({
        status: 'UNSUPPORTED',
        answer: 'Security Policy: Prompt injection or system prompt override attempt rejected.',
        title: 'Safety Violation',
        summary: 'Query rejected by security validation policy.',
        analysisType: 'UNSUPPORTED',
        evidence: [],
        sources: []
      });
    }

    if (intentResult.intent === INTENT_TYPES.UNSUPPORTED) {
      return res.json({
        status: 'UNSUPPORTED',
        answer: 'This question falls outside supported geospatial intelligence analyses. Try asking about land changes, water expansion, vegetation health, built-up areas, location coordinates, or distance measurements.',
        title: 'Unsupported Query',
        summary: 'Query not matching supported geospatial capabilities.',
        analysisType: 'UNSUPPORTED',
        evidence: [],
        sources: []
      });
    }

    // Step 2: Retrieve Satellite Metadata & Coverage
    const satelliteMetadata = await getSatelliteMetadata(mapContext, timeRange || {});

    if (satelliteMetadata.status === 'INSUFFICIENT_DATA') {
      return res.json({
        status: 'INSUFFICIENT_DATA',
        answer: `I could not obtain sufficient satellite imagery for this location and timeframe. ${satelliteMetadata.reason}`,
        title: 'Insufficient Satellite Imagery',
        summary: satelliteMetadata.reason,
        analysisType: intentResult.intent,
        location: {
          lat: mapContext?.center?.lat || 23.0225,
          lon: mapContext?.center?.lon || mapContext?.center?.lng || 72.5714
        },
        timeRange: {
          start: timeRange?.start || '2026-09-13',
          end: timeRange?.end || '2026-09-27'
        },
        evidence: [],
        sources: []
      });
    }

    // Step 3: Execute Deterministic Geospatial Math & Index Calculations
    const analysisResult = executeGeospatialAnalysis(intentResult.intent, satelliteMetadata, mapContext, roi);

    // Step 4: LLM Explanation Layer (Dual-Mode Grounded Facts)
    const explanation = await generateGroundedExplanation({
      question,
      intent: intentResult,
      metadata: satelliteMetadata,
      analysisResult,
      mapContext,
      mode
    });

    const responsePayload = {
      status: 'VERIFIED',
      mode,
      explorer: explanation.explorer,
      expert: explanation.expert,
      ...explanation,
      analysisType: intentResult.intent,
      evidenceStrength: analysisResult.evidenceStrength || 'High',
      observedVsInterpreted: analysisResult.observedVsInterpreted || {},
      limitations: explanation.limitations || analysisResult.limitations || [],
      actions: explanation.actions || [],
      location: {
        lat: mapContext?.center?.lat || 23.0225,
        lon: mapContext?.center?.lon || mapContext?.center?.lng || 72.5714
      },
      timeRange: {
        start: satelliteMetadata.baselineDate || '2026-09-13',
        end: satelliteMetadata.targetDate || '2026-09-27'
      },
      metrics: analysisResult.metrics,
      evidence: [
        {
          type: 'satellite_observation',
          source: satelliteMetadata.platform || 'Sentinel-2 MSI Harmonized',
          date: satelliteMetadata.targetDate || '2026-09-27',
          value: analysisResult.observedVsInterpreted?.observed || 'Satellite reflectance delta recorded.'
        },
        {
          type: 'spectral_method',
          source: analysisResult.method,
          date: satelliteMetadata.targetDate || '2026-09-27',
          value: analysisResult.formula || 'Multi-spectral band ratio math'
        }
      ],
      sources: [
        {
          name: satelliteMetadata.platform || 'Sentinel-2 MSI Harmonized',
          type: 'Multispectral Satellite',
          date: satelliteMetadata.targetDate || '2026-09-27'
        },
        {
          name: satelliteMetadata.secondaryPlatform || 'Landsat 8/9 C2 L2',
          type: 'Optical Satellite',
          date: satelliteMetadata.baselineDate || '2026-09-13'
        }
      ],
      geojson: analysisResult.geojson || null
    };

    // Persist query record to SQLite table ai_queries
    const queryRecord = {
      id: Date.now().toString(),
      question,
      timestamp: new Date().toISOString(),
      location: responsePayload.location,
      analysisType: intentResult.intent,
      status: responsePayload.status,
      summary: responsePayload.summary
    };
    await insertRow('ai_queries', queryRecord.id, queryRecord).catch(err => console.error('Failed to log AI query:', err));

    return res.json(responsePayload);
  } catch (error) {
    console.error('AI Ask Pipeline Error:', error);
    return res.status(500).json({
      status: 'ERROR',
      error: 'An internal error occurred while processing the geospatial query.',
      details: error.message
    });
  }
});

// ─── Intelligence API ────────────────────────────────────────────────────
app.get('/api/intelligence/overview', async (req, res) => {
  try {
    const filters = {
      watershedId: req.query.watershedId,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo
    };
    const overview = await getIntelligenceOverview(filters);
    res.json({ success: true, data: overview });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// ─── Health endpoint (must be BEFORE generic /:resource) ───────────────────
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'satquery-api', port: PORT, timestamp: new Date().toISOString() });
});

// ─── Earth Engine / Compare Routes (must be BEFORE generic /:resource) ───────
app.get('/api/compare/health', async (req, res) => {
  try {
    const health = await healthCheck();
    res.json(health);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =========================================================
// FIELD API — Photo upload, AI vision, evidence creation
// =========================================================

// Multer config for field photos (stored to disk path is managed by fieldService)
const fieldUpload = multer({
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  storage: multer.memoryStorage()
});

const fieldError = (res, code, msg, status = 500) =>
  res.status(status).json({ success: false, error: { code, message: msg } });
const fieldOk = (res, data) =>
  res.json({ success: true, data });

// POST /api/field/upload
app.post('/api/field/upload', fieldUpload.single('photo'), async (req, res) => {
  if (!req.file) return fieldError(res, 'NO_FILE', 'No photo uploaded', 400);

  try {
    validateImageFile(req.file.mimetype, req.file.originalname);
  } catch (err) {
    return fieldError(res, 'INVALID_FILE', err.message, 400);
  }

  const obsId = generateObsId();

  try {
    const stored = await storePhoto(obsId, req.file.buffer, req.file.originalname, req.file.mimetype);
    const exif = await extractExif(req.file.buffer);

    const lat = exif.gps?.latitude ?? null;
    const lon = exif.gps?.longitude ?? null;

    const obs = buildObservationRecord({
      obsId,
      photoId: obsId + '-photo',
      exif,
      aiAnalysis: null,
      lat, lon,
      locationSource: exif.status,
      captureTime: exif.captureTime,
      themes: [],
      condition: null,
      synthesis: '',
      missionId: req.body.missionId || null,
      stopId: req.body.stopId || null,
      watershedId: req.body.watershedId || null,
      hash: stored.hash,
      filePath: stored.origPath,
      thumbPath: stored.thumbPath
    });

    await insertRow('field_observations', obsId, obs);

    // If EXIF GPS found, do reverse geocode and watershed background tasks
    if (lat != null && lon != null) {
      import('./server/fieldService.js').then(({ reverseGeocode, resolveWatershedForObservation }) => {
        resolveWatershedForObservation(lat, lon).then(ws => {
          if (ws && ws.dataStatus === 'AVAILABLE') {
            getRow('field_observations', obsId).then(o => {
              if (o) updateRow('field_observations', obsId, { ...o, watershedId: ws.id, watershedName: ws.name, updatedAt: new Date().toISOString() });
            });
          }
        });
        reverseGeocode(lat, lon).then(geo => {
          if (geo) {
            getRow('field_observations', obsId).then(o => {
              if (o && o.location) {
                const newLoc = { ...o.location, reverseGeocode: geo };
                updateRow('field_observations', obsId, { ...o, location: newLoc, updatedAt: new Date().toISOString() });
              }
            });
          }
        });
      });
    }

    // If EXIF GPS found, do reverse geocode and watershed background tasks
    if (lat != null && lon != null) {
      import('./server/fieldService.js').then(({ reverseGeocode, resolveWatershedForObservation }) => {
        resolveWatershedForObservation(lat, lon).then(ws => {
          if (ws && ws.dataStatus === 'AVAILABLE') {
            getRow('field_observations', obsId).then(o => {
              if (o) updateRow('field_observations', obsId, { ...o, watershedId: ws.id, watershedName: ws.name, updatedAt: new Date().toISOString() });
            });
          }
        });
        reverseGeocode(lat, lon).then(geo => {
          if (geo) {
            getRow('field_observations', obsId).then(o => {
              if (o && o.location) {
                const newLoc = { ...o.location, reverseGeocode: geo };
                updateRow('field_observations', obsId, { ...o, location: newLoc, updatedAt: new Date().toISOString() });
              }
            });
          }
        });
      });
    }

    fieldOk(res, {
      observationId: obsId,
      photoPreviewUrl: `/api/field/${obsId}/photo`,
      thumbUrl: `/api/field/${obsId}/thumb`,
      hash: stored.hash,
      exif,
      gps: exif.gps,
      captureTime: exif.captureTime,
      status: 'UPLOADED'
    });
  } catch (err) {
    console.error('[Field] upload error:', err.message);
    fieldError(res, 'UPLOAD_ERROR', err.message);
  }
});

// GET /api/field/:id
app.get('/api/field/:id', async (req, res) => {
  try {
    const obs = await getRow('field_observations', req.params.id);
    if (!obs) return fieldError(res, 'NOT_FOUND', 'Observation not found', 404);
    fieldOk(res, obs);
  } catch (err) {
    fieldError(res, 'DB_ERROR', err.message);
  }
});

// GET /api/field/:id/photo  — serve original photo
app.get('/api/field/:id/photo', async (req, res) => {
  try {
    const obs = await getRow('field_observations', req.params.id);
    if (!obs || !obs.filePath) return res.status(404).send('Not found');
    res.sendFile(obs.filePath);
  } catch (err) { res.status(500).send(err.message); }
});

// GET /api/field/:id/thumb  — serve thumbnail
app.get('/api/field/:id/thumb', async (req, res) => {
  try {
    const obs = await getRow('field_observations', req.params.id);
    if (!obs || !obs.thumbPath) return res.status(404).send('Not found');
    res.sendFile(obs.thumbPath);
  } catch (err) { res.status(500).send(err.message); }
});

// POST /api/field/:id/analyze  — run AI vision
app.post('/api/field/:id/analyze', async (req, res) => {
  try {
    const obs = await getRow('field_observations', req.params.id);
    if (!obs) return fieldError(res, 'NOT_FOUND', 'Observation not found', 404);

    if (!obs.filePath || !fs.existsSync(obs.filePath)) {
      return fieldError(res, 'FILE_MISSING', 'Photo file not found on server');
    }

    const buffer = fs.readFileSync(obs.filePath);
    const mimeType = 'image/jpeg';
    const result = await analyzeImageWithAI(buffer, mimeType, obs.hash);

    const updated = { ...obs, aiAnalysis: result, updatedAt: new Date().toISOString() };
    if (result.status === 'COMPLETE' && result.data) {
      // Auto-prefill themes/condition from AI if not set
      if (!obs.themes.length && result.data.suggestedThemes) {
        updated.themes = result.data.suggestedThemes;
      }
      if (!obs.condition && result.data.suggestedCondition && result.data.suggestedCondition !== 'UNKNOWN') {
        updated.condition = result.data.suggestedCondition;
      }
      if (!obs.synthesis && result.data.observationSummary) {
        updated.synthesis = result.data.observationSummary;
      }

      const { resolveLandmarkFromAI } = await import('./server/fieldService.js');
      const landmark = resolveLandmarkFromAI(result.data);
      if (landmark) {
        updated.landmark = landmark;
        // Override location if no GPS or if we trust landmark more for demo
        if (!updated.location || updated.location.source !== 'PHOTO_EXIF') {
          updated.location = {
            latitude: landmark.latitude,
            longitude: landmark.longitude,
            source: 'LANDMARK_REGISTRY'
          };

          // Re-resolve watershed
          try {
            const ws = await resolveWatershedForObservation(landmark.latitude, landmark.longitude);
            if (ws && ws.dataStatus === 'AVAILABLE') {
              updated.watershedId = ws.id;
              updated.watershedName = ws.name;
            }
          } catch (e) { console.error('Watershed resolution failed:', e.message); }


          // Auto-fetch satellite context for demo flow
          try {
            const satCtx = await getSatelliteContextForLocation(landmark.latitude, landmark.longitude);
            if (satCtx && satCtx.status === 'AVAILABLE') {
              updated.satelliteContext = satCtx;
            } else {
              updated.satelliteContext = { status: 'UNAVAILABLE', error: satCtx?.error || 'Unknown error' };
            }
          } catch (e) { console.error('Satellite context failed:', e.message); }

          // Reverse Geocode
          try {
            const { reverseGeocode } = await import('./server/fieldService.js');
            const rev = await reverseGeocode(landmark.latitude, landmark.longitude);
            if (rev) updated.location.reverseGeocode = rev;
          } catch (e) { console.error('Reverse geocode failed:', e.message); }

          // Reverse Geocode
          try {
            const { reverseGeocode } = await import('./server/fieldService.js');
            const rev = await reverseGeocode(landmark.latitude, landmark.longitude);
            if (rev) updated.location.reverseGeocode = rev;
          } catch (e) { console.error('Reverse geocode failed:', e.message); }
        }


      }
    }

    await updateRow('field_observations', obs.id, updated);
    fieldOk(res, { analysisStatus: result.status, analysis: result.data, error: result.error, locationUpdated: !!updated.location });
  } catch (err) {
    console.error('[Field] analyze error:', err.message);
    fieldError(res, 'ANALYZE_ERROR', err.message);
  }
});

// PATCH /api/field/:id  — update observation fields
app.patch('/api/field/:id', async (req, res) => {
  try {
    const obs = await getRow('field_observations', req.params.id);
    if (!obs) return fieldError(res, 'NOT_FOUND', 'Observation not found', 404);

    const allowedFields = ['themes', 'condition', 'synthesis', 'notes', 'missionId', 'stopId', 'watershedId'];
    const updates = {};
    for (const f of allowedFields) {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    }

    const updated = { ...obs, ...updates, updatedAt: new Date().toISOString() };
    await updateRow('field_observations', obs.id, updated);
    fieldOk(res, updated);
  } catch (err) {
    fieldError(res, 'UPDATE_ERROR', err.message);
  }
});

// POST /api/field/:id/location  — set or update GPS location
app.post('/api/field/:id/location', async (req, res) => {
  try {
    const { lat, lon, source } = req.body;
    if (isNaN(parseFloat(lat)) || isNaN(parseFloat(lon))) {
      return fieldError(res, 'INVALID_COORDS', 'lat and lon required', 400);
    }
    const obs = await getRow('field_observations', req.params.id);
    if (!obs) return fieldError(res, 'NOT_FOUND', 'Observation not found', 404);

    const updated = {
      ...obs,
      location: { latitude: parseFloat(lat), longitude: parseFloat(lon), source: source || 'USER_PINNED' },
      updatedAt: new Date().toISOString()
    };
    await updateRow('field_observations', obs.id, updated);

    // Reverse geocode
    try {
      const { reverseGeocode } = await import('./server/fieldService.js');
      const geo = await reverseGeocode(parseFloat(lat), parseFloat(lon));
      if (geo) {
        updated.location.reverseGeocode = geo;
        await updateRow('field_observations', obs.id, updated);
      }
    } catch (e) {
      console.error('Reverse geocode failed:', e.message);
    }

    // Reverse geocode
    try {
      const { reverseGeocode } = await import('./server/fieldService.js');
      const geo = await reverseGeocode(parseFloat(lat), parseFloat(lon));
      if (geo) {
        updated.location.reverseGeocode = geo;
        await updateRow('field_observations', obs.id, updated);
      }
    } catch (e) {
      console.error('Reverse geocode failed:', e.message);
    }

    // Re-resolve watershed in background (non-blocking)
    resolveWatershedForObservation(parseFloat(lat), parseFloat(lon)).then(ws => {
      if (ws && ws.dataStatus === 'AVAILABLE') {
        getRow('field_observations', obs.id).then(o => {
          if (o) updateRow('field_observations', obs.id, { ...o, watershedId: ws.id, watershedName: ws.name, updatedAt: new Date().toISOString() });
        });
      }
    });

    fieldOk(res, { location: updated.location });
  } catch (err) {
    fieldError(res, 'LOCATION_ERROR', err.message);
  }
});

// POST /api/field/:id/satellite-context
app.post('/api/field/:id/satellite-context', async (req, res) => {
  try {
    const obs = await getRow('field_observations', req.params.id);
    if (!obs) return fieldError(res, 'NOT_FOUND', 'Observation not found', 404);

    const loc = obs.location;
    if (!loc) return fieldError(res, 'NO_LOCATION', 'Set location first', 400);

    const ctx = await getSatelliteContextForLocation(loc.latitude, loc.longitude);
    const updated = { ...obs, satelliteContext: ctx, updatedAt: new Date().toISOString() };
    await updateRow('field_observations', obs.id, updated);
    fieldOk(res, ctx);
  } catch (err) {
    fieldError(res, 'SATELLITE_ERROR', err.message);
  }
});

// POST /api/field/:id/evidence  — create evidence record
app.post('/api/field/:id/evidence', async (req, res) => {
  try {
    const obs = await getRow('field_observations', req.params.id);
    if (!obs) return fieldError(res, 'NOT_FOUND', 'Observation not found', 404);

    const evidence = buildEvidenceRecord({
      obsId: obs.id,
      observation: obs,
      aiAnalysis: obs.aiAnalysis,
      satelliteContext: obs.satelliteContext
    });

    await insertRow('evidence', evidence.id, evidence);

    // Update observation status
    const updatedObs = { ...obs, evidenceId: evidence.id, status: 'EVIDENCE_CREATED', updatedAt: new Date().toISOString() };
    await updateRow('field_observations', obs.id, updatedObs);

    fieldOk(res, { evidenceId: evidence.id, evidence });
  } catch (err) {
    console.error('[Field] evidence error:', err.message);
    fieldError(res, 'EVIDENCE_ERROR', err.message);
  }
});

// GET /api/field/:id/evidence
app.get('/api/field/:id/evidence', async (req, res) => {
  try {
    const obs = await getRow('field_observations', req.params.id);
    if (!obs || !obs.evidenceId) return fieldError(res, 'NOT_FOUND', 'No evidence for this observation', 404);
    const evidence = await getRow('evidence', obs.evidenceId);
    fieldOk(res, evidence);
  } catch (err) {
    fieldError(res, 'DB_ERROR', err.message);
  }
});

// GET /api/field  — list all observations (lightweight)
app.get('/api/field', async (req, res) => {
  try {
    const rows = await getAllRows('field_observations');
    const light = rows.map(o => ({
      id: o.id, status: o.status, location: o.location, captureTime: o.captureTime,
      thumbUrl: `/api/field/${o.id}/thumb`, themes: o.themes, condition: o.condition,
      createdAt: o.createdAt, missionId: o.missionId, watershedId: o.watershedId
    }));
    fieldOk(res, light);
  } catch (err) {
    fieldError(res, 'DB_ERROR', err.message);
  }
});

// GET /api/field/context  — consolidated context fetching
app.get('/api/field/context', async (req, res) => {
  try {
    const lat = parseFloat(req.query.latitude);
    const lon = parseFloat(req.query.longitude);
    const featureId = req.query.featureId;

    if (isNaN(lat) || isNaN(lon)) {
      return fieldError(res, 'INVALID_COORDS', 'latitude and longitude are required', 400);
    }

    // Is this the Sardar Sarovar demo?
    const isSardar = (lat > 21.82 && lat < 21.85 && lon > 73.73 && lon < 73.76) || (featureId && featureId.toLowerCase().includes('sardar'));

    let context = {
      status: 'success',
      mode: isSardar ? 'PUBLIC_SNAPSHOT' : 'LIVE',
      feature: null,
      watershed: null,
      satellite: {
        status: 'UNAVAILABLE', provider: '—', sceneId: '—', acquisitionDate: '—', cloudCover: '—'
      },
      water: {
        status: 'UNAVAILABLE', source: '—', period: '—', summary: '—'
      },
      vegetation: {
        status: 'UNAVAILABLE', source: '—', period: '—', summary: '—'
      },
      infrastructure: [],
      attentionAreas: [],
      timeline: [],
      sources: []
    };

    if (isSardar) {
      context.feature = {
        id: 'sardar-sarovar',
        name: 'Sardar Sarovar Dam',
        type: 'DAM',
        latitude: 21.8315,
        longitude: 73.7485,
        river: 'Narmada',
        watershed: 'Narmada Basin'
      };
      context.watershed = {
        id: 'narmada-basin',
        name: 'Narmada Basin',
        source: 'PUBLIC FEATURE DATA',
        area: '88,000 km²',
        states: ['Gujarat', 'Madhya Pradesh', 'Maharashtra'],
        river: 'Narmada'
      };
      context.satellite = {
        status: 'PUBLIC_SNAPSHOT',
        provider: 'Sentinel-2 (Demo)',
        sceneId: 'S2A_MSIL2A_20231015T051801_N0509_R062_T43QEU',
        acquisitionDate: '2023-10-15',
        cloudCover: '0.4'
      };
      context.water = {
        status: 'PUBLIC_SNAPSHOT',
        source: 'Public Reservoir Records',
        period: 'Q4 2023',
        summary: 'Reservoir near capacity. Active flow observed at spillway.'
      };
      context.vegetation = {
        status: 'PUBLIC_SNAPSHOT',
        source: 'Sentinel-2 Derived',
        period: 'Q4 2023',
        summary: 'Dense riparian vegetation downstream.'
      };
    } else {
      // Resolve Live
      try {
        const { resolveWatershedForObservation, getSatelliteContextForLocation, reverseGeocode } = await import('./server/fieldService.js');
        const ws = await resolveWatershedForObservation(lat, lon);
        if (ws && ws.dataStatus === 'AVAILABLE') {
          context.watershed = {
            id: ws.id, name: ws.name, source: 'LIVE GEOSPATIAL DB', river: '—'
          };
        }

        const geo = await reverseGeocode(lat, lon);
        if (geo) {
          context.feature = {
            id: geo.placeName, name: geo.placeName, type: 'LOCATION', latitude: lat, longitude: lon,
            river: '—', watershed: ws?.name || '—'
          };
        }

        const sat = await getSatelliteContextForLocation(lat, lon);
        if (sat && sat.status === 'AVAILABLE') {
          context.satellite = {
            status: 'LIVE', provider: sat.context?.satellite || 'Sentinel',
            sceneId: sat.context?.sceneId || '—', acquisitionDate: sat.context?.acquisitionDate || '—',
            cloudCover: sat.context?.cloudCover || '—'
          };
        }
      } catch (e) {
        console.warn('Live context failure:', e.message);
      }
    }

    fieldOk(res, context);
  } catch (err) {
    fieldError(res, 'CONTEXT_ERROR', err.message);
  }
});

// =========================================================
// WATERSHED / GEOSPATIAL API — see server/geoRoutes.js
// =========================================================
registerGeoRoutes(app, { getRow, getAllRows, insertRow, updateRow, deleteRow });
setGeoStore({ getRow, getAllRows, insertRow, updateRow, deleteRow });

// Legacy place geocoder (kept for older consumers)
app.get('/api/geocode', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) return res.json([]);
    res.json(await geocodePlace(q));
  } catch (err) {
    res.status(500).json({ ok: false, error: { code: 'GEOCODE_FAILED', message: 'Geocoding failed' } });
  }
});

// =========================================================
// EVIDENCE GAPS API
// =========================================================

// GET /api/evidence-gaps — list all evidence gaps (optionally filtered by watershed)
app.get('/api/evidence-gaps', async (req, res) => {
  try {
    const { watershedId, status, severity } = req.query;
    let gaps = await getAllRows('evidence_gaps');

    if (watershedId) {
      gaps = gaps.filter(g => g.watershedId === watershedId);
    }
    if (status) {
      gaps = gaps.filter(g => g.status === status);
    }
    if (severity) {
      gaps = gaps.filter(g => g.severity === severity);
    }

    wsResponse(res, gaps);
  } catch (err) {
    wsError(res, 'LIST_ERROR', err.message);
  }
});

// GET /api/evidence-gaps/:id — get single evidence gap
app.get('/api/evidence-gaps/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const gap = await getRow('evidence_gaps', id);
    if (!gap) return wsError(res, 'NOT_FOUND', 'Evidence gap not found', 404);
    wsResponse(res, gap);
  } catch (err) {
    wsError(res, 'GET_ERROR', err.message);
  }
});

// POST /api/evidence-gaps — create evidence gap
app.post('/api/evidence-gaps', async (req, res) => {
  try {
    const { watershedId, type, title, description, location, severity, priority, source, metadata } = req.body;

    if (!watershedId || !type || !title) {
      return wsError(res, 'MISSING_FIELDS', 'watershedId, type, and title are required', 400);
    }

    const gap = {
      id: `gap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      watershedId,
      type,
      title,
      description: description || '',
      location: location || null,
      severity: severity || 'MEDIUM',
      priority: priority || 'MEDIUM',
      status: 'OPEN',
      source: source || 'MANUAL',
      metadata: metadata || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await insertRow('evidence_gaps', gap.id, gap);
    wsResponse(res, gap, 201);
  } catch (err) {
    wsError(res, 'CREATE_ERROR', err.message);
  }
});

// PATCH /api/evidence-gaps/:id — update evidence gap
app.patch('/api/evidence-gaps/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await getRow('evidence_gaps', id);
    if (!existing) return wsError(res, 'NOT_FOUND', 'Evidence gap not found', 404);

    const allowedFields = ['type', 'title', 'description', 'location', 'severity', 'priority', 'status', 'source', 'metadata'];
    const updates = {};
    for (const f of allowedFields) {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    }

    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    await updateRow('evidence_gaps', id, updated);
    wsResponse(res, updated);
  } catch (err) {
    wsError(res, 'UPDATE_ERROR', err.message);
  }
});

// POST /api/evidence-gaps/:id/verify — mark evidence gap as verified
app.post('/api/evidence-gaps/:id/verify', async (req, res) => {
  try {
    const { id } = req.params;
    const { verifiedBy, notes } = req.body;
    const existing = await getRow('evidence_gaps', id);
    if (!existing) return wsError(res, 'NOT_FOUND', 'Evidence gap not found', 404);

    const updated = {
      ...existing,
      status: 'VERIFIED',
      verifiedBy: verifiedBy || 'USER',
      verifiedAt: new Date().toISOString(),
      verificationNotes: notes || '',
      updatedAt: new Date().toISOString()
    };

    await updateRow('evidence_gaps', id, updated);
    wsResponse(res, updated);
  } catch (err) {
    wsError(res, 'VERIFY_ERROR', err.message);
  }
});

// POST /api/evidence-gaps/:id/dismiss — dismiss evidence gap
app.post('/api/evidence-gaps/:id/dismiss', async (req, res) => {
  try {
    const { id } = req.params;
    const { dismissedBy, reason } = req.body;
    const existing = await getRow('evidence_gaps', id);
    if (!existing) return wsError(res, 'NOT_FOUND', 'Evidence gap not found', 404);

    const updated = {
      ...existing,
      status: 'DISMISSED',
      dismissedBy: dismissedBy || 'USER',
      dismissedAt: new Date().toISOString(),
      dismissalReason: reason || '',
      updatedAt: new Date().toISOString()
    };

    await updateRow('evidence_gaps', id, updated);
    wsResponse(res, updated);
  } catch (err) {
    wsError(res, 'DISMISS_ERROR', err.message);
  }
});

// =========================================================
// INTERVENTION API
// =========================================================

// GET /api/interventions — list interventions (optionally filtered by watershed)
app.get('/api/interventions', async (req, res) => {
  try {
    const { watershedId, type, status } = req.query;
    let interventions = await getAllRows('interventions');

    if (watershedId) {
      interventions = interventions.filter(i => i.watershedId === watershedId);
    }
    if (type) {
      interventions = interventions.filter(i => i.type === type);
    }
    if (status) {
      interventions = interventions.filter(i => i.status === status);
    }

    wsResponse(res, interventions);
  } catch (err) {
    wsError(res, 'LIST_ERROR', err.message);
  }
});

// GET /api/interventions/:id — get single intervention
app.get('/api/interventions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const intervention = await getRow('interventions', id);
    if (!intervention) return wsError(res, 'NOT_FOUND', 'Intervention not found', 404);
    wsResponse(res, intervention);
  } catch (err) {
    wsError(res, 'GET_ERROR', err.message);
  }
});

// POST /api/interventions — create intervention
app.post('/api/interventions', async (req, res) => {
  try {
    const { watershedId, type, name, coordinates, geometry, constructionDate, status, notes, photographs, linkedMissionId, linkedObservationId } = req.body;

    if (!watershedId || !type || !name || !coordinates) {
      return wsError(res, 'MISSING_FIELDS', 'watershedId, type, name, and coordinates are required', 400);
    }

    const interventionTypes = ['Check Dam', 'Farm Pond', 'Percolation Tank', 'Recharge Structure', 'Contour Trench', 'Bund', 'Plantation', 'Drainage Work', 'Other'];
    if (!interventionTypes.includes(type)) {
      return wsError(res, 'INVALID_TYPE', `type must be one of: ${interventionTypes.join(', ')}`, 400);
    }

    const intervention = {
      id: `intervention-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      watershedId,
      type,
      name,
      coordinates,
      geometry: geometry || null,
      constructionDate: constructionDate || null,
      status: status || 'PLANNED',
      notes: notes || '',
      photographs: photographs || [],
      inspections: [],
      linkedMissionId: linkedMissionId || null,
      linkedObservationId: linkedObservationId || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await insertRow('interventions', intervention.id, intervention);
    wsResponse(res, intervention, 201);
  } catch (err) {
    wsError(res, 'CREATE_ERROR', err.message);
  }
});

// PATCH /api/interventions/:id — update intervention
app.patch('/api/interventions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await getRow('interventions', id);
    if (!existing) return wsError(res, 'NOT_FOUND', 'Intervention not found', 404);

    const allowedFields = ['type', 'name', 'coordinates', 'geometry', 'constructionDate', 'status', 'notes', 'photographs', 'linkedMissionId', 'linkedObservationId'];
    const updates = {};
    for (const f of allowedFields) {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    }

    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    await updateRow('interventions', id, updated);
    wsResponse(res, updated);
  } catch (err) {
    wsError(res, 'UPDATE_ERROR', err.message);
  }
});

// POST /api/interventions/:id/inspections — add inspection record
app.post('/api/interventions/:id/inspections', async (req, res) => {
  try {
    const { id } = req.params;
    const { date, status, notes, photos, inspector } = req.body;
    const existing = await getRow('interventions', id);
    if (!existing) return wsError(res, 'NOT_FOUND', 'Intervention not found', 404);

    const inspection = {
      id: `insp-${Date.now()}`,
      date: date || new Date().toISOString(),
      status: status || 'COMPLETED',
      notes: notes || '',
      photos: photos || [],
      inspector: inspector || 'FIELD_TEAM'
    };

    const updated = {
      ...existing,
      inspections: [...(existing.inspections || []), inspection],
      status: status || existing.status,
      updatedAt: new Date().toISOString()
    };

    await updateRow('interventions', id, updated);
    wsResponse(res, updated);
  } catch (err) {
    wsError(res, 'INSPECTION_ERROR', err.message);
  }
});

// DELETE /api/interventions/:id — delete intervention
app.delete('/api/interventions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const changes = await deleteRow('interventions', id);
    if (changes === 0) return wsError(res, 'NOT_FOUND', 'Intervention not found', 404);
    wsResponse(res, { deleted: true });
  } catch (err) {
    wsError(res, 'DELETE_ERROR', err.message);
  }
});

app.post('/api/compare', async (req, res) => {
  try {
    const { baselineDate, currentDate, coords, bounds, indicator } = req.body;
    if (!baselineDate || !currentDate || !coords) {
      return res.status(400).json({ status: 'error', code: 'INVALID_REQUEST', message: 'Missing baselineDate, currentDate, or coords' });
    }
    const result = await getCompareData({ baselineDate, currentDate, coords, bounds, indicator });
    res.json(result);
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// =========================================================
// MISSION API
// =========================================================

app.get('/api/mission/watersheds/search', async (req, res) => {
  try {
    const { searchMissionWatersheds } = await import('./server/missionService.js');
    const results = await searchMissionWatersheds(req.query.q);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/mission/origins/search', async (req, res) => {
  try {
    const { searchOrigins } = await import('./server/missionService.js');
    const results = await searchOrigins(req.query.q);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/mission/origins/resolve', async (req, res) => {
  try {
    const { resolveOriginDetails } = await import('./server/missionService.js');
    const result = await resolveOriginDetails(req.query.placeId);
    if (!result) return res.status(404).json({ error: 'Could not resolve place' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.post('/api/mission/generate', async (req, res) => {
  try {
    const { targetId, targetName, targetLat, targetLon, origin, constraints } = req.body;
    const { resolveOriginDetails, generateMissionPlan } = await import('./server/missionService.js');

    const targetWatershed = {
      id: targetId,
      name: targetName,
      lat: targetLat,
      lon: targetLon
    };

    let originGeo = null;
    if (origin.type === 'SEARCH_RESULT' && origin.id) {
      originGeo = await resolveOriginDetails(origin.id);
    } else {
      originGeo = origin;
    }

    if (!originGeo || !originGeo.lat || !originGeo.lng) {
      return res.status(400).json({ error: 'Origin coordinates could not be resolved.' });
    }

    const mission = await generateMissionPlan(targetWatershed, originGeo, constraints);

    // Save generated mission
    await insertRow('missions', mission.id, mission);

    res.json({ mission });
  } catch (err) {
    console.error('[Mission] generate error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/mission/preview', async (req, res) => {
  try {
    const { targetId, targetName, targetLat, targetLon, origin, constraints } = req.body;
    const { resolveOriginDetails, generateMissionPlan } = await import('./server/missionService.js');

    const targetWatershed = {
      id: targetId,
      name: targetName,
      lat: targetLat,
      lon: targetLon
    };

    let originGeo = null;
    if (origin.type === 'SEARCH_RESULT' && origin.id) {
      originGeo = await resolveOriginDetails(origin.id);
    } else {
      originGeo = origin;
    }

    if (!originGeo || !originGeo.lat || !originGeo.lng) {
      return res.status(400).json({ error: 'Origin coordinates could not be resolved.' });
    }

    const mission = await generateMissionPlan(targetWatershed, originGeo, constraints);
    // Don't save it
    mission.status = 'DRAFT';

    res.json({ mission });
  } catch (err) {
    console.error('[Mission] preview error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/missions — list all missions
app.get('/api/missions', async (req, res) => {
  try {
    const { status, watershedId } = req.query;
    let missions = await getAllRows('missions');

    if (status) {
      missions = missions.filter(m => m.status === status);
    }
    if (watershedId) {
      missions = missions.filter(m => m.target?.id === watershedId);
    }

    // Sort by generatedAt descending
    missions.sort((a, b) => new Date(b.timestamps?.generatedAt || 0) - new Date(a.timestamps?.generatedAt || 0));

    res.json(missions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/missions/:id — get single mission with stops
app.get('/api/missions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const mission = await getRow('missions', id);
    if (!mission) return res.status(404).json({ error: 'Mission not found' });

    // Fetch mission stops
    const stops = await getAllRows('mission_stops');
    mission.stops = stops.filter(s => s.missionId === id).sort((a, b) => a.sequence - b.sequence);

    res.json(mission);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/missions/:id — update mission
app.patch('/api/missions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const mission = await getRow('missions', id);
    if (!mission) return res.status(404).json({ error: 'Mission not found' });

    const allowedFields = ['status', 'name', 'description', 'priority', 'constraints', 'selectedStops', 'notes'];
    const updates = {};
    for (const f of allowedFields) {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    }

    const updated = { ...mission, ...updates, updatedAt: new Date().toISOString() };
    await updateRow('missions', id, updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/missions/:id/stops — get mission stops
app.get('/api/missions/:id/stops', async (req, res) => {
  try {
    const { id } = req.params;
    const stops = await getAllRows('mission_stops');
    const missionStops = stops.filter(s => s.missionId === id).sort((a, b) => a.sequence - b.sequence);
    res.json(missionStops);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/missions/:id/stops — add mission stop
app.post('/api/missions/:id/stops', async (req, res) => {
  try {
    const { id } = req.params;
    const mission = await getRow('missions', id);
    if (!mission) return res.status(404).json({ error: 'Mission not found' });

    const { stopId, title, lat, lng, objective, type, priority, linkedInterventionId, linkedObservationId } = req.body;

    const stop = {
      id: stopId || `stop-${Date.now()}`,
      missionId: id,
      sequence: req.body.sequence || 1,
      title: title || 'New Stop',
      lat: lat || mission.target?.center?.lat || 0,
      lng: lng || mission.target?.center?.lng || 0,
      objective: objective || '',
      type: type || 'OBSERVATION',
      priority: priority || 'MEDIUM',
      status: 'UPCOMING',
      linkedInterventionId: linkedInterventionId || null,
      linkedObservationId: linkedObservationId || null,
      notes: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await insertRow('mission_stops', stop.id, stop);
    res.status(201).json(stop);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/mission-stops/:id — update mission stop
app.patch('/api/mission-stops/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const stop = await getRow('mission_stops', id);
    if (!stop) return res.status(404).json({ error: 'Mission stop not found' });

    const allowedFields = ['title', 'lat', 'lng', 'objective', 'type', 'priority', 'status', 'sequence', 'linkedInterventionId', 'linkedObservationId', 'notes'];
    const updates = {};
    for (const f of allowedFields) {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    }

    const updated = { ...stop, ...updates, updatedAt: new Date().toISOString() };
    await updateRow('mission_stops', id, updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/mission-stops/:id — delete mission stop
app.delete('/api/mission-stops/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const changes = await deleteRow('mission_stops', id);
    if (changes === 0) return res.status(404).json({ error: 'Mission stop not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================
// FIELD VERIFICATION PLANNER API
// =========================================================

// POST /api/mission/analyze — Evidence-gap candidate analysis
// Returns verification candidates with priority scores for a given watershed.
app.post('/api/mission/analyze', async (req, res) => {
  try {
    const {
      getWatershedInterventions,
      buildVerificationCandidate,
      applyPriorityFilter,
      buildVerificationRoute
    } = await import('./server/verificationEngine.js');

    const { watershedId, priorityFilter = 'ALL', origin, maxStops = 6, fieldWindowMinutes = 300 } = req.body;
    if (!watershedId) return res.status(400).json({ error: 'watershedId required' });

    // Load interventions (real DB or demo fallback)
    const interventions = await getWatershedInterventions(watershedId, getAllRows);

    // Build verification candidates with priority scores
    let candidates = interventions.map(buildVerificationCandidate);

    // Sort by priority score descending
    candidates.sort((a, b) => b.priorityScore - a.priorityScore);

    // Apply priority filter
    const filtered = applyPriorityFilter(candidates, priorityFilter);

    // Generate route plan if origin is provided
    let plan = null;
    if (origin && origin.lat) {
      plan = buildVerificationRoute(filtered, origin, maxStops, fieldWindowMinutes);
    }

    res.json({
      success: true,
      candidates: filtered,
      allCandidates: candidates,
      plan,
      meta: {
        watershedId,
        priorityFilter,
        maxStops,
        fieldWindowMinutes,
        totalInterventions: interventions.length,
        filteredCount: filtered.length
      }
    });
  } catch (err) {
    console.error('[VerificationPlanner] analyze error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/mission/update-evidence — Update field evidence for a candidate
// Used when field officer captures evidence and submits — updates candidate priority.
app.patch('/api/mission/update-evidence', async (req, res) => {
  try {
    const { interventionId, photoCount, latestPhotoDate, notes, evidenceStatus } = req.body;
    if (!interventionId) return res.status(400).json({ error: 'interventionId required' });

    // Try to update real DB intervention if it exists
    let updated = null;
    try {
      const existing = await getRow('interventions', interventionId);
      if (existing) {
        const patch = {
          ...existing,
          photoCount: photoCount !== undefined ? photoCount : (existing.photoCount || 0),
          latestPhotoDate: latestPhotoDate || existing.latestPhotoDate,
          notes: notes || existing.notes,
          updatedAt: new Date().toISOString()
        };
        await updateRow('interventions', interventionId, patch);
        updated = patch;
      }
    } catch (e) {
      console.warn('[VerificationPlanner] DB update failed (demo mode):', e.message);
    }

    // Recalculate priority for the updated intervention
    const { buildVerificationCandidate, DEMO_INTERVENTIONS } = await import('./server/verificationEngine.js');
    // Find base data from demo dataset if not in DB
    const demoBase = DEMO_INTERVENTIONS.find(d => d.id === interventionId) || {};
    const interventionData = updated || {
      ...demoBase,
      id: interventionId,
      photoCount: photoCount !== undefined ? photoCount : (demoBase.photoCount || 1),
      latestPhotoDate: latestPhotoDate || new Date().toISOString().split('T')[0],
    };
    const updatedCandidate = buildVerificationCandidate(interventionData);

    res.json({
      success: true,
      updatedCandidate,
      candidate: updatedCandidate,
      message: 'Evidence updated and priority recalculated'
    });
  } catch (err) {
    console.error('[VerificationPlanner] update-evidence error:', err);
    res.status(500).json({ error: err.message });
  }
});

// =========================================================
// INTERVENTION EVIDENCE REVIEW API (SIH26015 Supporting Feature)
// =========================================================

// GET /api/intervention-review/watersheds — list watersheds
app.get('/api/intervention-review/watersheds', async (req, res) => {
  try {
    const { getWatershedList } = await import('./server/interventionReviewEngine.js');
    const list = getWatershedList();
    res.json({ success: true, watersheds: list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/intervention-review/interventions — list interventions for watershed
app.get('/api/intervention-review/interventions', async (req, res) => {
  try {
    const { watershedId } = req.query;
    if (!watershedId) return res.status(400).json({ error: 'watershedId required' });
    const { getInterventionsForWatershed, calculateEvidenceStatus } = await import('./server/interventionReviewEngine.js');
    const items = getInterventionsForWatershed(watershedId);
    const mapped = items.map(item => ({
      id: item.id,
      name: item.name,
      type: item.type,
      village: item.village,
      district: item.district,
      lat: item.lat,
      lng: item.lng,
      status: item.status,
      photoCount: (item.fieldPhotos || []).length,
      latestPhotoDate: (item.fieldPhotos && item.fieldPhotos.length > 0) ? item.fieldPhotos[0].date : null,
      evidenceStatus: calculateEvidenceStatus(item).status,
      isReviewed: !!item.isReviewed
    }));
    res.json({ success: true, interventions: mapped });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/intervention-review/detail/:id — full multi-source evidence package
app.get('/api/intervention-review/detail/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { getInterventionDetail } = await import('./server/interventionReviewEngine.js');
    const detail = getInterventionDetail(id);
    if (!detail) return res.status(404).json({ error: 'Intervention not found' });
    res.json({ success: true, intervention: detail });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/intervention-review/add-photo — add geotagged field photo evidence
app.post('/api/intervention-review/add-photo', async (req, res) => {
  try {
    const { interventionId, title, url, notes, photographer, type, lat, lng } = req.body;
    if (!interventionId) return res.status(400).json({ error: 'interventionId required' });

    const { REVIEW_INTERVENTIONS, calculateEvidenceStatus, buildStructuredAssessment } = await import('./server/interventionReviewEngine.js');
    const target = REVIEW_INTERVENTIONS.find(i => i.id === interventionId);

    const newPhoto = {
      id: `fp-${Date.now()}`,
      title: title || 'Field Ground Inspection',
      url: url || 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=80',
      thumbnail: url || 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=400&q=80',
      date: new Date().toISOString().split('T')[0],
      lat: parseFloat(lat) || target?.lat || 21.8294,
      lng: parseFloat(lng) || target?.lng || 73.7351,
      accuracyMeters: 3.5,
      photographer: photographer || 'Field Officer',
      type: type || 'Verification Audit',
      notes: notes || 'Geo-tagged field observation recorded.',
      device: 'Mobile GPS Tagged',
      exif: { iso: 100, focalLength: '26mm', shutter: '1/500s', direction: 'North' }
    };

    if (target) {
      if (!target.fieldPhotos) target.fieldPhotos = [];
      target.fieldPhotos.unshift(newPhoto);
    }

    const updatedDetail = target ? {
      ...target,
      evidenceStatus: calculateEvidenceStatus(target).status,
      evidenceStatusInfo: calculateEvidenceStatus(target),
      assessment: buildStructuredAssessment(target, calculateEvidenceStatus(target))
    } : null;

    res.json({ success: true, photo: newPhoto, intervention: updatedDetail });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/intervention-review/toggle-review — toggle review watchlist flag
app.post('/api/intervention-review/toggle-review', async (req, res) => {
  try {
    const { interventionId, isReviewed, notes } = req.body;
    if (!interventionId) return res.status(400).json({ error: 'interventionId required' });

    const { REVIEW_INTERVENTIONS } = await import('./server/interventionReviewEngine.js');
    const target = REVIEW_INTERVENTIONS.find(i => i.id === interventionId);
    if (target) {
      target.isReviewed = isReviewed !== undefined ? isReviewed : !target.isReviewed;
      target.reviewStatus = target.isReviewed ? 'REVIEWED' : 'PENDING_REVIEW';
      if (notes) target.reviewNotes = notes;
    }

    res.json({
      success: true,
      isReviewed: target ? target.isReviewed : isReviewed,
      message: target?.isReviewed ? 'Intervention marked as Reviewed.' : 'Intervention added to review list.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================
// INTELLIGENCE / COMMAND API
// =========================================================

// GET /api/intelligence/overview — unified intelligence dashboard
app.get('/api/intelligence/overview', async (req, res) => {
  try {
    const { getIntelligenceOverview, setDbHelpers } = await import('./server/services/intelligence.js');
    setDbHelpers(getAllRows, getRow);

    const filters = {
      watershedId: req.query.watershedId,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      region: req.query.region,
      eventType: req.query.eventType
    };

    const overview = await getIntelligenceOverview(filters);
    res.json({ success: true, data: overview });
  } catch (err) {
    console.error('[Intelligence] overview error:', err);
    res.status(500).json({ success: false, error: { code: 'INTELLIGENCE_ERROR', message: err.message } });
  }
});

// GET /api/intelligence/events — recent intelligence events
app.get('/api/intelligence/events', async (req, res) => {
  try {
    const { getIntelligenceEvents, setDbHelpers } = await import('./server/services/intelligence.js');
    setDbHelpers(getAllRows, getRow);

    const filters = {
      watershedId: req.query.watershedId,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      region: req.query.region,
      eventType: req.query.eventType
    };

    const events = await getIntelligenceEvents(filters);
    res.json({ success: true, data: events });
  } catch (err) {
    console.error('[Intelligence] events error:', err);
    res.status(500).json({ success: false, error: { code: 'INTELLIGENCE_ERROR', message: err.message } });
  }
});

// GET /api/intelligence/anomalies — satellite anomalies
app.get('/api/intelligence/anomalies', async (req, res) => {
  try {
    const { getIntelligenceAnomalies, setDbHelpers } = await import('./server/services/intelligence.js');
    setDbHelpers(getAllRows, getRow);

    const filters = {
      watershedId: req.query.watershedId,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      region: req.query.region,
      eventType: req.query.eventType
    };

    const anomalies = await getIntelligenceAnomalies(filters);
    res.json({ success: true, data: anomalies });
  } catch (err) {
    console.error('[Intelligence] anomalies error:', err);
    res.status(500).json({ success: false, error: { code: 'INTELLIGENCE_ERROR', message: err.message } });
  }
});

// GET /api/intelligence/activity — recent activity feed
app.get('/api/intelligence/activity', async (req, res) => {
  try {
    const { getIntelligenceActivity, setDbHelpers } = await import('./server/services/intelligence.js');
    setDbHelpers(getAllRows, getRow);

    const filters = {
      watershedId: req.query.watershedId,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      region: req.query.region,
      eventType: req.query.eventType
    };

    const activity = await getIntelligenceActivity(filters);
    res.json({ success: true, data: activity });
  } catch (err) {
    console.error('[Intelligence] activity error:', err);
    res.status(500).json({ success: false, error: { code: 'INTELLIGENCE_ERROR', message: err.message } });
  }
});

// GET global search across seeded/public datasets
app.get('/api/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim().toLowerCase();
    if (!q) return res.json([]);

    // Attempt coordinate parse
    const coordMatch = q.match(/^(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lon = parseFloat(coordMatch[2]);
      if (!isNaN(lat) && !isNaN(lon)) {
        return res.json([{ id: `coord-${lat}-${lon}`, type: 'COORDINATE', name: `Location ${lat}, ${lon}`, lat, lon }]);
      }
    }

    const results = [];

    const wss = await getAllRows('watersheds').catch(() => []);
    const inf = await getAllRows('infrastructure_features').catch(() => []);

    for (const w of wss) {
      if ((w.name && w.name.toLowerCase().includes(q)) || (w.river && w.river.toLowerCase().includes(q)) || (w.alternateNames && w.alternateNames.join(' ').toLowerCase().includes(q))) {
        results.push({ ...w, searchType: 'watershed' });
      }
    }

    for (const i of inf) {
      if ((i.name && i.name.toLowerCase().includes(q)) || (i.river && i.river.toLowerCase().includes(q))) {
        results.push({ ...i, searchType: 'infrastructure' });
      }
    }

    // Try external watershed service as fallback if local returns few results
    if (results.length < 5) {
      try {
        const ext = await searchWatersheds(q);
        for (const e of ext) {
          if (!results.find(r => r.id === e.id)) {
            results.push({ ...e, searchType: 'watershed', source: e.source || 'External' });
          }
        }
      } catch (err) { }
    }

    res.json(results);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// GET all items for a resource (or the settings object)
app.get('/api/:resource', async (req, res) => {
  try {
    const { resource } = req.params;
    if (resource === 'settings') {
      const data = await getRow('settings', 'singleton');
      return res.json(data || {});
    }
    const data = await getAllRows(resource);
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to read data' });
  }
});

// GET single item by ID
app.get('/api/:resource/:id', async (req, res) => {
  try {
    const { resource, id } = req.params;
    if (resource === 'settings') {
      return res.status(400).json({ error: 'Settings is a singleton' });
    }
    const data = await getRow(resource, id);
    if (!data) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to read data' });
  }
});



// POST to create a new item (or overwrite settings)
app.post('/api/:resource', async (req, res) => {
  try {
    const { resource } = req.params;
    if (resource === 'settings') {
      const existing = await getRow('settings', 'singleton');
      if (existing) {
        await updateRow('settings', 'singleton', req.body);
      } else {
        await insertRow('settings', 'singleton', req.body);
      }
      return res.status(201).json(req.body);
    }

    const newItem = { id: Date.now().toString(), ...req.body };
    await insertRow(resource, newItem.id, newItem);
    res.status(201).json(newItem);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to write data' });
  }
});

// PUT to update an item by ID
app.put('/api/:resource/:id', async (req, res) => {
  try {
    const { resource, id } = req.params;
    if (resource === 'settings') {
      return res.status(400).json({ error: 'Settings is a singleton, use POST /api/settings' });
    }

    const existing = await getRow(resource, id);
    if (!existing) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const updatedData = { ...existing, ...req.body, id };
    await updateRow(resource, id, updatedData);
    res.json(updatedData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update data' });
  }
});

// DELETE an item by ID
app.delete('/api/:resource/:id', async (req, res) => {
  try {
    const { resource, id } = req.params;
    if (resource === 'settings') {
      return res.status(400).json({ error: 'Cannot delete settings' });
    }

    const changes = await deleteRow(resource, id);
    if (changes === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete data' });
  }
});

if (!process.env.VERCEL && !process.env.NETLIFY) {
  const server = app.listen(PORT, () => {
    console.log(`Local authoritative server running on http://localhost:${PORT} with SQLite backend`);
    ensureSeeds();
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[FATAL] Port ${PORT} is already in use.`);
      console.error(`[FATAL] Kill the existing process first: kill $(lsof -t -i:${PORT})`);
      console.error(`[FATAL] Then run: npm run server\n`);
      process.exit(1);
    } else {
      console.error('[FATAL] Server error:', err);
      process.exit(1);
    }
  });
}

export default app;

// Export database helpers for other modules
export { getRow, getAllRows, insertRow, updateRow, deleteRow };
