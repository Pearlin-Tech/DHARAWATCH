/**
 * DHARAWATCH — Field Observation Service
 * Handles: photo storage, EXIF extraction, AI vision analysis,
 * watershed resolution, satellite context, evidence persistence.
 */

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── File Storage ──────────────────────────────────────────────────
const ROOT = process.env.FIELD_DATA_DIR
  || path.join(path.dirname(__dirname), 'server-data', 'field');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

ensureDir(ROOT);

export function getObsDir(obsId) {
  const p = path.join(ROOT, obsId);
  ensureDir(p);
  return p;
}

// ─── ID Generation ─────────────────────────────────────────────────
export function generateObsId() {
  return 'field-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
}

// ─── SHA-256 hash ──────────────────────────────────────────────────
export function hashBuffer(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

// ─── Allowed image MIME types ──────────────────────────────────────
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif']);

export function validateImageFile(mimetype, originalname) {
  const ext = path.extname(originalname).toLowerCase();
  if (!ALLOWED_MIME.has(mimetype)) {
    throw new Error(`UNSUPPORTED_FORMAT: ${mimetype}`);
  }
  if (!ALLOWED_EXT.has(ext)) {
    throw new Error(`UNSUPPORTED_EXTENSION: ${ext}`);
  }
}

// ─── EXIF Extraction ───────────────────────────────────────────────
export async function extractExif(buffer) {
  try {
    const exifr = (await import('exifr')).default;
    const raw = await exifr.parse(buffer, {
      gps: true, tiff: true, exif: true, ifd0: true,
      translateValues: true, reviveValues: true
    });
    if (!raw) return { status: 'NO_EXIF', data: {} };

    const gpsLat = raw.latitude ?? raw.GPSLatitude ?? null;
    const gpsLon = raw.longitude ?? raw.GPSLongitude ?? null;

    let gpsStatus = 'GPS_NOT_FOUND';
    if (gpsLat !== null && gpsLon !== null) {
      gpsStatus = 'GPS_FOUND';
    }

    return {
      status: gpsStatus,
      gps: gpsLat != null ? { latitude: gpsLat, longitude: gpsLon } : null,
      captureTime: raw.DateTimeOriginal || raw.CreateDate || null,
      camera: {
        make: raw.Make || null,
        model: raw.Model || null,
        focalLength: raw.FocalLength || null,
        iso: raw.ISO || null,
        aperture: raw.FNumber || null,
        shutterSpeed: raw.ExposureTime || null,
        orientation: raw.Orientation || null,
      },
      raw: Object.fromEntries(
        Object.entries(raw).filter(([, v]) => typeof v !== 'object' || v === null)
      )
    };
  } catch (err) {
    console.warn('[Field] EXIF extraction failed:', err.message);
    return { status: 'EXIF_ERROR', error: err.message, data: {} };
  }
}

// ─── Thumbnail Creation ────────────────────────────────────────────
export async function createThumbnail(buffer, outPath) {
  try {
    const sharp = (await import('sharp')).default;
    await sharp(buffer)
      .rotate()               // honour EXIF orientation
      .resize(640, 480, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toFile(outPath);
    return true;
  } catch (err) {
    console.warn('[Field] Thumbnail creation failed:', err.message);
    return false;
  }
}

// ─── Store original photo ──────────────────────────────────────────
export async function storePhoto(obsId, buffer, originalname, mimetype) {
  const dir = getObsDir(obsId);
  const ext = path.extname(originalname).toLowerCase() || '.jpg';
  const origPath = path.join(dir, `original${ext}`);
  const thumbPath = path.join(dir, 'thumbnail.jpg');

  fs.writeFileSync(origPath, buffer);
  await createThumbnail(buffer, thumbPath);

  return {
    origPath,
    thumbPath,
    ext,
    size: buffer.length,
    hash: hashBuffer(buffer)
  };
}

// ─── AI Vision Analysis ────────────────────────────────────────────
const AI_KEY = process.env.AI_API_KEY;
const AI_VISION_CACHE = new Map(); // hash → analysis

async function callGeminiVision(base64Image, mimeType, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${AI_KEY}`;
  const body = {
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeType, data: base64Image } },
        { text: prompt }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json'
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000)
  });

  if (!res.ok) {
    const err = await res.text();
    if (res.status === 503 && attempt < maxAttempts) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      console.warn(`[Field] Gemini API 503, retrying in ${delay}ms (attempt ${attempt}/${maxAttempts})`);
      await new Promise(r => setTimeout(r, delay));
      return callGeminiVision(base64Image, mimeType, prompt, attempt + 1);
    }
    throw new Error(`Gemini API ${res.status}: ${err.slice(0, 200)}`);
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty Gemini response');

  // Parse JSON from the response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in Gemini response');
  return JSON.parse(jsonMatch[0]);
}

const VISION_PROMPT = `
You are a field survey AI assistant for a watershed management system.
Analyze this field photograph and return ONLY a valid JSON object.

STRICT RULES:
- Only describe what you can visually confirm in the image.
- NEVER invent coordinates, measurements, NDVI values, or structure IDs.
- For uncertain observations, use "possible" or "uncertain".
- confidence values are qualitative: "high", "medium", "low" — never percentages.
- Do NOT fabricate scientific measurements.

Return this JSON schema exactly:
{
  "landmarkCandidates": [{"name": "string", "confidence": "high/medium/low", "visualReasons": "string"}],
  "landmarkType": "dam/bridge/river/none",
  "scene": "one-sentence description of the overall scene",
  "landform": "terrain type visible (flat, hilly, riverine, valley, etc.)",
  "visibleWater": { "present": boolean, "type": "river/pond/standing/channel/none", "notes": "brief visual description or null" },
  "vegetationCondition": { "present": boolean, "density": "sparse/moderate/dense/none", "type": "crop/natural/riparian/mixed/none", "notes": "brief or null" },
  "landCondition": { "bareness": "high/medium/low", "erosionVisible": boolean, "sedimentVisible": boolean, "notes": "brief or null" },
  "structures": [
    { "type": "check_dam/bund/channel/pond/culvert/road/bridge/agricultural/other", "status": "IDENTIFIED/POSSIBLE/UNCERTAIN", "condition": "intact/damaged/degraded/unknown", "notes": "brief visual description" }
  ],
  "interventionIndicators": { "present": boolean, "types": ["list of visible indicators or empty array"], "notes": "brief or null" },
  "hazards": { "present": boolean, "types": ["visible hazards or empty"], "notes": "brief or null" },
  "suggestedThemes": ["WATER REGIME", "VEGETATION CANOPY", "DRAINAGE / CHANNEL", "WATERSHED INTERVENTION", "SOIL & EROSION GULLIES", "AGRICULTURE / CROP"],
  "suggestedCondition": "AS CONSTRUCTED/ACTIVE FLOW/HEAVY SILTATION/PARTIAL BREACH/DRY / INACTIVE/UNKNOWN",
  "observationSummary": "2-3 sentence field observer synthesis based only on visible content",
  "uncertainty": "What cannot be determined from this image alone",
  "needsHumanReview": boolean
}
`;

export const LANDMARK_REGISTRY = {
  'SARDAR SAROVAR DAM': { latitude: 21.83, longitude: 73.75, region: 'Gujarat, India', river: 'Narmada' }
};

export function resolveLandmarkFromAI(aiData) {
  if (!aiData || !aiData.landmarkCandidates || aiData.landmarkCandidates.length === 0) return null;
  const topCandidate = aiData.landmarkCandidates[0];
  if (topCandidate.confidence === 'low') return null;

  const nameLower = topCandidate.name.toLowerCase();
  if (['sardar sarovar', 'sardar sarovar dam', 'narmada dam', 'sardar sarovar project'].includes(nameLower)) {
    return { name: 'SARDAR SAROVAR DAM', ...LANDMARK_REGISTRY['SARDAR SAROVAR DAM'] };
  }
  return null;
}


export async function analyzeImageWithAI(buffer, mimeType, photoHash) {
  if (!AI_KEY) {
    return { status: 'COMPLETE', reason: 'No AI_API_KEY configured - Using fallback', data: createDeterministicFallback(buffer) };
  }

  // Cache by photo hash
  if (AI_VISION_CACHE.has(photoHash)) {
    return { status: 'CACHED', data: AI_VISION_CACHE.get(photoHash) };
  }

  try {
    // Resize to max 1024px for AI analysis to save tokens
    let analysisBuffer = buffer;
    try {
      const sharp = (await import('sharp')).default;
      const meta = await sharp(buffer).metadata();
      if ((meta.width || 0) > 1024 || (meta.height || 0) > 1024) {
        analysisBuffer = await sharp(buffer)
          .rotate()
          .resize(1024, 1024, { fit: 'inside' })
          .jpeg({ quality: 85 })
          .toBuffer();
      }
    } catch (_) { /* use original */ }

    const base64 = analysisBuffer.toString('base64');
    const analysisData = await callGeminiVision(base64, 'image/jpeg', VISION_PROMPT);

    AI_VISION_CACHE.set(photoHash, analysisData);
    return { status: 'COMPLETE', data: analysisData };
  } catch (err) {
    console.error('[Field] AI vision error:', err.message);
    return { status: 'AI_ERROR', error: err.message, data: null };
  }
}

// ─── Watershed Resolution (calls existing service) ─────────────────
export async function resolveWatershedForObservation(lat, lon) {
  try {
    const { resolveWatershedByCoord } = await import('./watershedService.js');
    const ws = await resolveWatershedByCoord(lat, lon);
    return ws;
  } catch (err) {
    console.warn('[Field] Watershed resolution failed:', err.message);
    return { dataStatus: 'ERROR', error: err.message };
  }
}

// ─── Satellite Context (basic EE call) ────────────────────────────
export async function getSatelliteContextForLocation(lat, lon) {
  try {
    const { getFieldSatelliteContext } = await import('./watershedService.js');
    return await getFieldSatelliteContext(lat, lon);
  } catch (err) {
    console.warn('[Field] Satellite context failed:', err.message);
    return { status: 'UNAVAILABLE', error: err.message };
  }
}

// ─── Reverse Geocode (OpenStreetMap Nominatim) ────────────────────
export async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`, {
      headers: { 'User-Agent': 'DHARAWATCH/1.0' }
    });
    const data = await res.json();
    return data?.display_name || null;
  } catch (err) {
    console.warn('[Field] reverseGeocode failed:', err.message);
    return null;
  }
}

// ─── Observation Persistence (delegates to DB passed in) ──────────
export function buildObservationRecord({ obsId, photoId, exif, aiAnalysis,
  lat, lon, locationSource, captureTime, themes, condition, synthesis,
  missionId, stopId, watershedId, hash, filePath, thumbPath }) {
  return {
    id: obsId,
    photoId,
    status: 'DRAFT',
    hash,
    filePath,
    thumbPath,
    location: lat != null ? { latitude: lat, longitude: lon, source: locationSource || 'GPS_FOUND' } : null,
    captureTime: captureTime || null,
    exif: exif || {},
    aiAnalysis: aiAnalysis || null,
    themes: themes || [],
    condition: condition || null,
    synthesis: synthesis || '',
    missionId: missionId || null,
    stopId: stopId || null,
    watershedId: watershedId || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function buildEvidenceRecord({ obsId, observation, aiAnalysis, satelliteContext }) {
  return {
    id: 'evidence-' + Date.now(),
    observationId: obsId,
    photoHash: observation.hash,
    coordinates: observation.location,
    captureTime: observation.captureTime,
    themes: observation.themes,
    condition: observation.condition,
    synthesis: observation.synthesis,
    aiAnalysis: aiAnalysis || null,
    satelliteContext: satelliteContext || null,
    userAssessment: {
      confirmedAt: new Date().toISOString(),
      status: 'USER_CONFIRMED'
    },
    sourceMetadata: {
      exif: observation.exif,
      locationSource: observation.location?.source
    },
    missionId: observation.missionId,
    stopId: observation.stopId,
    watershedId: observation.watershedId,
    createdAt: new Date().toISOString(),
    immutable: true
  };
}
