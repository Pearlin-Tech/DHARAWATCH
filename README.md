# DHARAWATCH — Field Intelligence & Satellite Monitoring Platform

> Complete geospatial intelligence platform combining field observations, AI vision analysis, satellite spectral analysis, watershed context, intervention evidence review, and evidence-based decision making.

---

## 🚀 Quick Start (any laptop)

### Prerequisites
- **Node.js ≥ 20.19** (22 LTS recommended; `nvm use` reads `.nvmrc`) — Vite 8 will not start on older Node
- **Google Earth Engine** service account registered for Earth Engine — either the `EARTH_ENGINE_*` variables in `.env.local` or `ee-key.json` in the project root (never commit either)
- **Google Maps API Key** (Field map)
- **Gemini API Key** (optional — AI vision analysis and the AI watershed brief)
- Outbound internet access from the backend (Earth Engine, OpenStreetMap Nominatim, Wikipedia/Wikidata, Wikimedia Commons, Gemini)

Full list of packages, datasets and variables: [DEPENDENCIES.md](DEPENDENCIES.md).

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

# 4. Earth Engine credentials: EARTH_ENGINE_* in .env.local  — or —  ee-key.json in the root

# 5. Start everything (frontend + backend server run together)
npm start
```

The app will be available at **http://localhost:5173** (or next available port).
Backend API runs on **http://localhost:3001** — Vite proxies `/api` to it.

### Verify the setup
```bash
curl http://localhost:3001/api/earth-engine/health          # authenticated + dataset checks
curl http://localhost:3001/api/watersheds/demos              # 8 curated demos (seeded from Earth Engine on first start)
curl http://localhost:3001/api/earth-engine/layers/health    # per-layer + NDVI/NDWI/NDMI + timeline status (slow, ~1 min)
```
Then open **http://localhost:5173/watershed**. On a fresh database the first start takes ~1–2 minutes to seed the demo watersheds from HydroBASINS; the DEMO menu fills in when that finishes.

### Troubleshooting
| Symptom | Cause / fix |
|---|---|
| Watershed page shows 404 for `/api/watersheds/demos`, or panels crash after `git pull` | An **old backend process** is still running. Stop it (`kill $(lsof -t -i:3001)`) and run `npm start` again — the frontend hot-reloads but the backend does not. |
| `Port 3001 is already in use` | Same as above — another backend is running. |
| DEMO (0), fingerprint `EE_UNAVAILABLE` | Earth Engine credentials missing/invalid — check `/api/earth-engine/health`. |
| `AI BRIEF UNAVAILABLE` / `HTTP 503` | No `AI_API_KEY`, or Gemini is temporarily overloaded — everything else keeps working; press RETRY later. |
| Vite exits with an engine / syntax error | Node is older than 20.19 — `nvm use`. |
| Large basins (Congo, Amazon) show LOADING for a while | Expected: Earth Engine composites thousands of scenes on the first request (30–90 s); results are cached for 15 min. |

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
│   │   ├── EvidenceReview/       # Intervention Evidence Review (field + satellite + terrain)
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
└── server/
    ├── services/                 # AI explainer, geospatial analysis, watershed
    └── ...                       # Internal services
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

### 2. Intervention Evidence Review (`/evidence-review`)
**Watershed → Intervention → Field evidence + Satellite change + Terrain → Evidence status → Mark reviewed**
- Interventions come from the `interventions` table (Watershed → Intervention Passport → REVIEW EVIDENCE)
- Field evidence: photos linked to the intervention or located within 1 km, plus inspection records; photo viewer with EXIF and AI observation
- Satellite change: Sentinel-2 SR scenes closest to the chosen baseline/current dates over an explicit analysis radius — NDVI, NDWI, NDMI, open-water area, Dynamic World land cover
- Terrain: SRTM elevation/slope, MERIT Hydro upstream area, distance to HydroSHEDS rivers
- Categorical evidence status (STRONG / NEEDS UPDATE / LIMITED / INCONSISTENT / NO DATA) with reasons — no numeric score
- Optional AI brief (Gemini, server-side, numbers checked against the facts)
- MARK REVIEWED saves the outcome on the intervention and as a record in the Evidence page (`/evidence`)
- Old `/mission` links redirect here (Mission planner was retired)

### 3. Watershed Intelligence Command (`/watershed`)
**Search / click / draw anywhere on Earth → HydroBASINS watershed → live Earth Engine analytics.** Nothing is pre-stored per river; every basin is resolved and named live.
- **Search** rivers, basins, places or `lat, lon` (OpenStreetMap + Wikidata) → HydroBASINS hierarchy (levels 3–8); a river point at an estuary is anchored to the same-named HydroSHEDS reach
- **Names** come from the HydroSHEDS river network (`BAS_NAME`), e.g. "Krishna Basin", with the HydroBASIN id kept as secondary metadata
- **Fingerprint**: NDVI, NDWI, NDMI (Sentinel-2), Dynamic World land cover, drainage — each metric with its own status and provenance
- **Layers** (`src/shared/layerRegistry.js` is the single registry): boundary, drainage, Sentinel-2 true colour, NDVI, NDWI, NDMI, Dynamic World, SRTM terrain, SMAP soil moisture — real EE tiles, opacity, legends, truthful OFF/LOADING/ACTIVE/NO DATA/ERROR
- **Timeline**: real Sentinel-2 acquisition dates + monthly NDVI/NDWI/NDMI (loaded independently)
- **Attention**: same-window-last-year comparison (NDVI, NDWI, NDMI, SMAP)
- **Watershed Intelligence panel**: overview, geography, parent/child basins, hydrology (discharge, regulation), Earth observation, land cover, temporal change, interventions, field evidence, Wikipedia history, Wikimedia Commons photos (with licence), sources, AI brief (Gemini, numbers validated against verified data)
- **Draw** a polygon → every intersecting watershed, grouped by level, scrollable; select any
- **Demo vs Saved** are separate: 8 curated demos; your saved watersheds persist in SQLite with exact geometry
- Panels: drag (header), scroll, collapse, expand, close
- Hands the active watershed to Field, Evidence Review, Compare and Ask

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
| `evidence` | Evidence records — field observations and intervention reviews (shown at `/evidence`) |
| `watersheds` | Curated demos (`isDemo`), saved watersheds (`saved-…`), custom areas (`custom-…`) with geometry |
| `interventions` | Watershed interventions + inspections |
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

### Vercel
`vercel.json` builds the Vite frontend into `dist/` and serves the whole Express API from one function (`api/index.js`); `/api/*` goes to the function, every other path to the React app.

1. Import the GitHub repo in Vercel (framework is detected from `vercel.json`).
2. **Settings → Environment Variables** — add `EARTH_ENGINE_PROJECT_ID`, `EARTH_ENGINE_CLIENT_EMAIL`, `EARTH_ENGINE_PRIVATE_KEY` (paste with `\n` line breaks), `AI_API_KEY`, and `VITE_GOOGLE_MAPS_API_KEY` (used at build time, so redeploy after changing it).
3. Deploy. Node 20+ is used (from `package.json` `engines`).

Serverless limits to know:
- **Data is not permanent on Vercel.** SQLite lives in `/tmp`: each cold start begins from the demo database built during deploy (watersheds, evidence gaps, the 5 Narmada interventions). Records created on the deployed site (field photos, evidence, reviews) disappear when the function restarts and are not shared between instances. Use the local server for data you need to keep, or move storage to a hosted database.
- Uploads are limited to ~4.5 MB per request (Vercel body limit).
- Earth Engine requests can take a while; the function allows up to 300 s (`maxDuration`), which needs Fluid compute (default on new projects) — lower it to 60 if your plan rejects 300.

### Netlify
`netlify.toml` + `netlify/functions/api.js` wrap the same Express app; the same environment variables and data limits apply.

---

## ⚠️ Known Limitations

1. **AI Vision**: Uses deterministic fallback when Gemini API unavailable (404/503)
2. **Large basins**: first-time analytics for continental basins (Congo, Amazon) take 30–90 s; timelines for basins > 200,000 km² use the basin bounding box for the acquisition footprint (stated in the UI)
3. **Search**: Nominatim/Wikidata are public services with rate limits (~1 request/second)
4. **Restart the API after `git pull`**: new routes only exist once `npm start` is restarted (a stale server returns HTTP 500/404 for them)

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