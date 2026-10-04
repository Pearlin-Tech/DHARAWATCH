# DEPENDENCIES

Everything needed to run DHARAWATCH after a fresh `git clone`.

## 1. Runtime requirements
| Tool | Version | Notes |
| --- | --- | --- |
| **Node.js** | **≥ 20.19** (22 LTS recommended — see `.nvmrc`) | Vite 8 refuses to start on older Node. `package.json → engines` enforces this. |
| **npm** | ≥ 10 | Ships with Node 20/22. |
| Native build | — | `sqlite3` and `sharp` ship prebuilt binaries for macOS / Linux / Windows; no compiler is normally required. If `npm install` fails on them, install the platform build tools (Xcode CLT on macOS, `build-essential` + `python3` on Linux). |

Install everything (frontend + backend) with one command:

```bash
npm install
```

`npm install` also runs `postinstall → npm run seed:public-data`, which creates `server-data/satquery.sqlite`. The database is **not** committed (`server-data/` is git-ignored); each machine builds its own.

## 2. Frontend dependencies
| Package | Version | Purpose |
| --- | --- | --- |
| `react`, `react-dom` | ^19.3.0 | UI |
| `react-router-dom` | ^7.18.4 | Routing |
| `maplibre-gl` | ^6.11.2 | Map engine (watershed boundary, Earth Engine raster tiles, drawing) |
| `framer-motion` | ^13.4.4 | Draggable floating panels, animation |
| `lucide-react` | ^1.48.0 | Icons |
| `recharts` (+ `internmap`) | ^3.10.1 | Charts |
| `geotiff` | ^3.0.5 | Client-side GeoTIFF reading (Detect / Ask) |

## 3. Backend dependencies
| Package | Version | Purpose |
| --- | --- | --- |
| `express` | ^5.2.1 | API server (`server.js`, default port 3001) |
| `cors` | ^2.8.6 | CORS |
| `dotenv` | ^18.0.4 | Loads `.env.local` |
| `sqlite3` | ^6.0.1 | Local database (`server-data/satquery.sqlite`) |
| `@google/earthengine` | ^1.7.45 | Earth Engine client — all satellite analytics and map tiles |
| `google-auth-library` | ^11.1.0 | Service-account auth helpers |
| `multer` | ^2.4.0 | Photo / GeoTIFF uploads |
| `sharp` | ^0.35.5 | Field photo thumbnails |
| `exifr` | ^7.1.3 | Field photo EXIF / GPS |
| `serverless-http` | ^4.0.0 | Netlify function wrapper |

## 4. Dev dependencies
| Package | Version | Purpose |
| --- | --- | --- |
| `vite`, `@vitejs/plugin-react` | ^8.3.1, ^6.1.1 | Dev server (proxies `/api` → backend) and build |
| `concurrently` | ^10.0.5 | `npm start` runs backend + frontend together |
| `vitest` | ^4.1.11 | Unit tests (`npm test`) |
| `oxlint` | ^1.85.0 | Lint (`npm run lint`) |
| `netlify-cli`, `vercel` | ^27.10.0, ^60.1.3 | Optional deployment CLIs |

`check-console.cjs` is an optional, standalone debugging script that needs `puppeteer`; it is **not** part of the app and is intentionally not a dependency (`npm i -D puppeteer` if you want to use it).

## 5. Environment variables (`.env.local`, never committed)
Copy `.env.example` → `.env.local`.

| Variable | Required | Used by |
| --- | --- | --- |
| `EARTH_ENGINE_PROJECT_ID` | **yes** for satellite features | Earth Engine |
| `EARTH_ENGINE_CLIENT_EMAIL` | **yes** (or `ee-key.json`) | Earth Engine service account |
| `EARTH_ENGINE_PRIVATE_KEY` | **yes** (or `ee-key.json`) | Earth Engine service account (`\n` newlines) |
| `AI_API_KEY` | optional | Gemini — AI watershed brief, Ask. Without it: "AI BRIEF UNAVAILABLE", rest works |
| `AI_MODEL` | optional | Force a Gemini model; default = newest `gemini-*-flash` the key can use |
| `VITE_GOOGLE_MAPS_API_KEY` | optional | Field (Google Maps) |
| `PORT` | optional | Backend port (default 3001) |
| `API_TARGET` | optional, dev | Vite proxy target (default `http://localhost:3001`) |

Alternative to the three `EARTH_ENGINE_*` variables: put the service-account JSON at `./ee-key.json` (git-ignored). The service account must be registered for Earth Engine on the Cloud project.

## 6. External services / datasets (no local copies — fetched on demand, cached in memory 15 min)
Nothing is stored per river or per basin. Any searched / clicked / drawn location is resolved live:

| Source | Used for | Auth |
| --- | --- | --- |
| Google Earth Engine — `WWF/HydroSHEDS/v1/Basins/hybas_1..12` | Watershed boundaries + hierarchy | EE service account |
| Earth Engine — `WWF/HydroSHEDS/v1/FreeFlowingRivers` | Watershed **names** (`BAS_NAME`), drainage layer, hydrology | EE |
| Earth Engine — `COPERNICUS/S2_SR_HARMONIZED` | True colour, NDVI, NDWI, NDMI, timeline | EE |
| Earth Engine — `GOOGLE/DYNAMICWORLD/V1`, `USGS/SRTMGL1_003`, `NASA/SMAP/SPL4SMGP/008`, `USDOS/LSIB_SIMPLE/2017` | Land cover, terrain, soil moisture, countries | EE |
| OpenStreetMap Nominatim + Wikidata search API | Place / river search | none (rate-limited, ~1 req/s) |
| Wikipedia REST + Wikidata API | Watershed history and river facts | none |
| Wikimedia Commons API | Photos with author + licence | none |
| Google Gemini API | AI brief (server-side only) | `AI_API_KEY` |

The backend needs outbound internet access to these hosts. First-time requests for very large basins (Congo, Amazon) take 30–90 s while Earth Engine computes; results are then cached.

## 7. Curated demo watersheds
The 8 demos (Narmada, Mahanadi, Subarnarekha, Bhadar, Godavari, Congo, Amazon, Nile) are **not** shipped as data. On first start the server looks each one up in HydroBASINS through Earth Engine and stores it in the local SQLite DB (`ensureSeeds` in `server/geospatial.js`). Without Earth Engine credentials the DEMO list is empty, but nothing crashes.
