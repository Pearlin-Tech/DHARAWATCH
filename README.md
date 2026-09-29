# DRISHTIWATCH — SatQuery AI Platform

> Real-time satellite intelligence for geospatial analysis, temporal comparison, and AI-powered environmental monitoring using Google Earth Engine + Sentinel-2.

---

## 🚀 Quick Start (any laptop)

### Prerequisites
- **Node.js** v20+ ([download](https://nodejs.org/))
- **Google Earth Engine** service account key (`ee-key.json`) — place it in the project root (never commit this file)

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/Pearlin-Tech/DRISHTIWATCH.git
cd DRISHTIWATCH

# 2. Install ALL dependencies (frontend + backend) — single command
npm install

# 3. Add your Earth Engine key
# Place ee-key.json in the root directory (ask your team lead for this file)

# 4. Start everything (frontend + backend server run together)
npm start
```

The app will be available at **http://localhost:5173** (or next available port).

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
DRISHTIWATCH/
├── src/                    # React frontend
│   ├── pages/
│   │   ├── Compare/        # Temporal satellite comparison (split/diff/flicker)
│   │   ├── Ask/            # AI-powered query interface
│   │   ├── Detect/         # Object & change detection
│   │   └── Explore/        # Map exploration
│   └── components/         # Shared components (MapViewport, AppNavigation...)
├── server.js               # Main Express API server
├── server-gee.js           # Google Earth Engine integration (compare/analysis)
├── backend/                # Auth, detection, imagery services
└── server/services/        # AI explainer, geospatial analysis engine
```

---

## 🔑 Secrets & Environment

The following files are **gitignored** and must be obtained separately:

| File | Purpose | How to get |
|---|---|---|
| `ee-key.json` | Google Earth Engine service account | Google Cloud Console → IAM → Service Accounts |
| `.env.local` | API keys (Gemini, etc.) | Ask team lead |

> ⚠️ **Never commit `ee-key.json` or `.env.local`** — they are in `.gitignore`

---

## 🛰 Compare Feature

The **Compare** page enables real temporal satellite analysis:
- Powered by **Sentinel-2 MSI** imagery via Google Earth Engine
- Cloud-free **median composites** for clean visualization
- Real metrics: Spectral Change Detection, NDVI, NDWI
- Split / Difference / Flicker view modes
- Drag both timeline dots freely to pick any date range (2019–2026)

---

## 🌐 Tech Stack

- **Frontend**: React 19 + Vite + MapLibre GL + Framer Motion
- **Backend**: Express 5 + SQLite3
- **Satellite Data**: Google Earth Engine JavaScript API (Sentinel-2 SR)
- **AI**: Gemini (via `llmExplainer.js`)