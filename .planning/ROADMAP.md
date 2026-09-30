# DHARAWATCH Backend Fix Roadmap

## Milestone: Complete Backend Integration & Functionality

### Phase 1: Fix AI Vision Analysis (Gemini 503 Errors)
- **Status**: pending
- **Objective**: Fix the AI image analysis endpoint that returns 503 errors
- **Files**: server/fieldService.js, server/services/ai/
- **Acceptance**: POST /api/field/:id/analyze returns valid AI analysis with structured JSON

### Phase 2: Fix Watershed Fingerprint & Context (Earth Engine Initialization)
- **Status**: pending
- **Objective**: Fix watershed fingerprint returning PENDING - ensure Earth Engine is properly initialized in watershedService
- **Files**: server/watershedService.js, server-gee.js
- **Acceptance**: GET /api/watersheds/:id/fingerprint returns real NDVI/NDWI data

### Phase 3: Fix Mission Origin Search (Google Places API)
- **Status**: pending
- **Objective**: Fix /api/mission/origins/search returning empty results
- **Files**: server/missionService.js
- **Acceptance**: Search returns real places for "Bharuch", "Vadodara", etc.

### Phase 4: Connect Frontend Services to Real APIs (Remove Hardcoded URLs)
- **Status**: pending
- **Objective**: Fix all frontend services using hardcoded `http://localhost:3001` instead of relative `/api` paths
- **Files**: src/services/watershedClient.js, src/pages/Field/Field.jsx
- **Acceptance**: All API calls work through Vite proxy in dev and relative paths in prod

### Phase 5: Fix Field Evidence Creation Flow
- **Status**: pending
- **Objective**: Ensure complete field observation → analysis → evidence flow works end-to-end
- **Files**: server/fieldService.js, server/routes/field.js
- **Acceptance**: Upload → Analyze → Location → Satellite Context → Evidence all functional

### Phase 6: Verify Detection Service
- **Status**: pending
- **Objective**: Ensure detection service works with real Earth Engine data
- **Files**: src/services/detectionService.js, server.js detection routes
- **Acceptance**: POST /api/detection returns real water/vegetation detections

### Phase 7: Create Intelligence/Command API
- **Status**: pending
- **Objective**: Build GET /api/intelligence/overview aggregating observations, missions, gaps, anomalies
- **Files**: server/services/intelligence.js, server.js new routes
- **Acceptance**: Returns real aggregated data from same DB as other features

### Phase 8: Integration Testing & Validation
- **Status**: pending
- **Objective**: Test complete flow: Upload → Observation → Evidence Gap → Mission → Verification
- **Acceptance**: All 3 features connected, no mock data, no fake values

### Phase 9: Documentation & Environment Setup
- **Status**: pending
- **Objective**: Update README, .env.example, document all required variables
- **Acceptance**: New developer can run project with documented steps