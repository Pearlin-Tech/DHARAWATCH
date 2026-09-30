# DHARAWATCH — Field Intelligence & Satellite Monitoring Platform

> Complete geospatial intelligence platform combining field observations, AI vision analysis, satellite spectral analysis, watershed context, mission planning, and evidence-based decision making.

---

## 🚀 Quick Start (any laptop)

### Prerequisites
- **Node.js** v20+ ([download](https://nodejs.org/))
- **Google Earth Engine** service account key (`ee-key.json`) — place it in the project root (never commit this file)
- **Google Maps API Key** with Places API (New) enabled
- **Gemini API Key** (optional, for AI vision analysis)

### Setup

```bash
# 1. Clone the repo
git clone <repository-url>
cd DHARAWATCH

# 2. Install ALL dependencies (frontend + backend) — single command
npm install

# 3. Configure environment
cp .env.example .env.local
# Edit .env.local with your API keys

# 4. Add your Earth Engine key
# Place ee-key.json in the root directory

# 5. Start everything (frontend + backend server run together)
npm start
```

The app will be available at **http://localhost:5173** (or next available port).
Backend API runs on **http://localhost:3001**.

---

## 📦 Scripts

| Command | Description |
|---|---|
| `npm start` | Run frontend (Vite) + backend (Express) simultaneously |
| `npm run dev` | Frontend only (Vite dev server with HMR) |
| `npm run server` | Backend API server only (port 3001) |
| `npm run build` | Production build |
| `npm test` | Run unit tests (Vitest) |

---

## 🗂 Project Structure

```
DHARAWATCH/
├── src/                          # React frontend
│   ├── pages/
│   │   ├── Ask/                  # AI-powered geospatial query interface
│   │   ├── Compare/              # Temporal satellite comparison (split/diff/flicker)
│   │   ├── Detect/               # Object & change detection (water, vegetation)
│   │   ├── Explore/              # Map exploration with AI copilot
│   │   ├── Field/                # Field observation capture & evidence
│   │   ├── Mission/              # Mission planning & route optimization
│   │   ├── Watershed/            # Watershed intelligence command
│   │   ├── Watch/                # Continuous monitoring watchlist
│   │   ├── Timeline/             # Temporal satellite ribbon
│   │   ├── Area/                 # Spatial envelope creation
│   │   ├── Measure/              # Distance & area measurement
│   │   ├── Reports/              # Evidence dossiers
│   │   ├── Evidence/             # Verified evidence viewer
│   │   └── Settings/             # User preferences
│   ├── components/               # Shared components (MapViewport, AppNavigation...)
│   └── services/                 # Frontend API clients
├── server.js                     # Main Express API server
├── server-gee.js                 # Google Earth Engine integration
├── server/
│   ├── services/                 # AI explainer, geospatial analysis, watershed, mission
│   └── ...                       # Internal services
└── .planning/                    # Project planning artifacts
```

---

## 🔑 Environment Variables

Copy `.env.example` to `.env.local` and fill in your keys:

```bash
cp .env.example .env.local
```

| Variable | Required | Description |
|---|---|---|
| `EARTH_ENGINE_PROJECT_ID` | Yes | Google Cloud project ID for Earth Engine |
| `EARTH_ENGINE_CLIENT_EMAIL` | Yes | Service account email for Earth Engine |
| `EARTH_ENGINE_PRIVATE_KEY` | Yes | Service account private key (with `\n` for newlines) |
| `VITE_GOOGLE_MAPS_API_KEY` | Yes | Google Maps API key (Places API New + Directions API enabled) |
| `AI_API_KEY` | Optional | Gemini API key for AI vision analysis |
| `DETECT_PROVIDER` | No | Set to `earth-engine` (default) or `demo` |
| `MAX_GEOTIFF_UPLOAD_MB` | No | Max GeoTIFF upload size (default: 100) |

> ⚠️ **Never commit `ee-key.json` or `.env.local`** — they are in `.gitignore`

### Google Cloud APIs to Enable
- **Earth Engine API**
- **Maps JavaScript API**
- **Places API (New)** - for origin search in Mission Planner
- **Directions API** - for route optimization in Mission Planner

---

## 🎯 Core Features

### 1. Field Evidence / Observation
**Upload → EXIF → GPS → AI Vision → Satellite Context → Watershed → Evidence Passport**
- Photo upload with SHA-256 hashing
- EXIF metadata extraction (GPS, camera, timestamp)
- AI vision analysis (landmarks, water, vegetation, structures)
- Satellite spectral context (NDVI, NDWI, NDMI, NDBI)
- Watershed resolution via HydroSHEDS
- Field ↔ Satellite agreement scoring
- Immutable evidence passport with provenance

### 2. Mission Planner
**Target Watershed → Origin Base → Evidence Gaps → Candidates → Scoring → Routing → Time Validation**
- Search watersheds by name/coordinates
- Search field bases/origins via Google Places API (New)
- Evidence gap analysis from satellite anomalies
- Candidate stop generation & transparent scoring
- Google Maps routing (DRIVING, WALKING, DRIVING_WALKING, BICYCLING)
- Mission time budget validation with safety buffer
- GPX export for field GPS devices

### 3. Watershed Intelligence Command
**Unified view combining: observations, missions, satellite changes, evidence gaps, anomalies**
- Real-time watershed fingerprint (NDVI, NDWI, land cover, drainage)
- Attention items from satellite anomalies
- Temporal ribbon of satellite observations
- Geospatial layers (NDVI, NDWI, LULC, terrain, soil moisture)
- Custom watershed creation (draw, import GeoJSON, pour point)
- Action dock: Compare, Mission, Field, Evidence, Ask

### 4. Compare (Temporal Satellite Analysis)
- Sentinel-2 MSI via Earth Engine
- Cloud-free median composites
- Split / Difference / Flicker view modes
- Real metrics: Spectral Change, NDVI, NDWI
- Free timeline scrubbing (2019-2026)

### 5. Ask (AI Geospatial Intelligence)
- Natural language queries about map area
- Explorer/Expert dual-mode responses
- GeoTIFF upload & analysis
- Grounded explanations with Observed vs Interpreted separation

---

## 🗄 Database Schema (SQLite)

| Table | Purpose |
|---|---|
| `field_observations` | Uploaded photos, EXIF, AI analysis, location, evidence |
| `evidence` | Immutable evidence passports |
| `watersheds` | Custom & resolved watershed geometries |
| `missions` | Generated mission plans with routes & stops |
| `analyses` | Satellite analysis jobs |
| `analysis_results` | Detection results (geometries, metrics) |
| `ai_queries` | Ask query history |
| `raster_attachments` | Uploaded GeoTIFF files |
| `settings` | User preferences singleton |

---

## 🛰 Earth Engine Integration

The platform uses **COPERNICUS/S2_SR_HARMONIZED** (Sentinel-2 Surface Reflectance) with:
- SCL-based cloud masking
- Progressive image search (±30 days)
- Minimum valid pixel threshold (30%)
- Real spectral indices: NDVI, NDWI, NDMI, NDBI
- Median composites for clean visualization
- Earth Engine tile URLs for MapLibre/Mapbox layers

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test file
npm test -- src/pages/Compare/compareUtils.test.js
```

---

## 📦 Deployment

### Local Production Build
```bash
npm run build
# Output in ./dist
```

### Serverless (Vercel/Netlify)
The `server.js` exports the Express app for serverless deployment.
Configure environment variables in your platform dashboard.

---

## ⚠️ Known Limitations

1. **AI Vision**: Uses deterministic fallback when Gemini API unavailable (404/503)
2. **Watershed Fingerprint**: Requires simplified geometry for large basins (EE compute limits)
3. **Mission Routing**: Requires Google Maps Directions API for real routes
4. **Large Watersheds**: Fingerprint uses simplified geometry; layers work with full geometry
5. **Places API**: Requires "Places API (New)" enabled in Google Cloud Console

---

## 🤝 Contributing

1. Follow the existing code style (ESM, async/await, structured error handling)
2. No mock data in production paths — return `UNAVAILABLE` with reason
3. All geographic data uses real `LatLng` — never screen coordinates
4. Database helpers are in `server.js` — import and use them
5. Earth Engine calls must be server-side only

---

## 📄 License

Proprietary — DRISHTIWATCH Team