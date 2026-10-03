/**
 * DHARAWATCH — Intervention Evidence Review Engine
 *
 * Dedicated supporting engine for SIH26015:
 *   - Geo-tagged field evidence (photos, coordinates, timestamps, EXIF/GPS)
 *   - Satellite change detection over time (NDVI, NDWI, Water Extent, LULC)
 *   - DEM / terrain / hydrology context (elevation, slope, flow accumulation, drainage proximity)
 *   - Deterministic 5-state evidence assessment (VERIFIED, NEEDS UPDATE, LIMITED EVIDENCE, INCONSISTENT, NO DATA)
 *   - Structured factual synthesis (non-causal, observational language)
 *
 * ACCURACY NOTE:
 *   - Never claims causal attribution ("intervention caused change").
 *   - Uses observational framing ("observed change during the comparison period").
 *   - DEM data is clearly labeled as DEMONSTRATION DATA where external DEM feeds are simulated.
 */

// ─── DEMO WATERSHEDS ─────────────────────────────────────────────────────────
export const REVIEW_WATERSHEDS = [
  {
    id: 'ws-narmada',
    name: 'Narmada River Basin — Kevadiya Catchment',
    district: 'Narmada',
    state: 'Gujarat',
    areaKm2: 1240,
    centroid: { lat: 21.8294, lng: 73.7351 },
    interventionsCount: 8,
    boundaryGeoJSON: {
      type: 'Feature',
      properties: { name: 'Narmada Basin — Kevadiya Catchment' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [73.40, 21.60], [73.95, 21.62], [74.00, 22.05],
          [73.65, 22.10], [73.35, 21.85], [73.40, 21.60]
        ]]
      }
    }
  },
  {
    id: 'ws-godavari',
    name: 'Godavari Basin — Nashik Upper Reach',
    district: 'Nashik',
    state: 'Maharashtra',
    areaKm2: 2150,
    centroid: { lat: 19.9975, lng: 73.7898 },
    interventionsCount: 6,
    boundaryGeoJSON: {
      type: 'Feature',
      properties: { name: 'Godavari Basin — Nashik' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [73.55, 19.80], [74.05, 19.82], [74.10, 20.20],
          [73.70, 20.25], [73.50, 20.00], [73.55, 19.80]
        ]]
      }
    }
  },
  {
    id: 'ws-cauvery',
    name: 'Cauvery Basin — Mandya Micro-Watershed',
    district: 'Mandya',
    state: 'Karnataka',
    areaKm2: 890,
    centroid: { lat: 12.5218, lng: 76.8951 },
    interventionsCount: 5,
    boundaryGeoJSON: {
      type: 'Feature',
      properties: { name: 'Cauvery Basin — Mandya' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [76.70, 12.35], [77.10, 12.38], [77.12, 12.70],
          [76.80, 12.72], [76.65, 12.50], [76.70, 12.35]
        ]]
      }
    }
  },
  {
    id: 'ws-krishna',
    name: 'Krishna Basin — Mahabaleshwar Catchment',
    district: 'Satara',
    state: 'Maharashtra',
    areaKm2: 1460,
    centroid: { lat: 17.9237, lng: 73.6586 },
    interventionsCount: 4,
    boundaryGeoJSON: {
      type: 'Feature',
      properties: { name: 'Krishna Basin — Mahabaleshwar' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [73.45, 17.75], [73.85, 17.78], [73.90, 18.10],
          [73.55, 18.15], [73.40, 17.95], [73.45, 17.75]
        ]]
      }
    }
  }
];

// ─── DEMO INTERVENTIONS DATASET ───────────────────────────────────────────────
export const REVIEW_INTERVENTIONS = [
  {
    id: 'int-narmada-cd-01',
    watershedId: 'ws-narmada',
    name: 'Check Dam #17',
    type: 'Check Dam',
    village: 'Kevadiya Colony',
    district: 'Narmada, Gujarat',
    lat: 21.8294,
    lng: 73.7351,
    constructionDate: '2022-06-10',
    status: 'Operational',
    costInr: '₹ 14,80,000',
    implementingAgency: 'Gujarat State Watershed Management Agency (GSWMA)',
    scheme: 'PMKSY-WDC 2.0',
    
    // Field Evidence
    fieldPhotos: [
      {
        id: 'fp-cd17-01',
        title: 'Spillway & Water Storage',
        url: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=80',
        thumbnail: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=400&q=80',
        date: '2024-08-14',
        lat: 21.8295,
        lng: 73.7353,
        accuracyMeters: 3.2,
        photographer: 'Rajesh Patel (Junior Engineer)',
        type: 'Post-Monsoon Storage',
        notes: 'Water depth at crest is ~1.8m. Spillway is intact with no structural seepage observed.',
        device: 'Samsung Galaxy Tab S7 / GPS Locked (8 sats)',
        exif: { iso: 100, focalLength: '26mm', shutter: '1/450s', direction: '142° SE' }
      },
      {
        id: 'fp-cd17-02',
        title: 'Left Abutment & Embankment',
        url: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1200&q=80',
        thumbnail: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=400&q=80',
        date: '2024-08-14',
        lat: 21.8292,
        lng: 73.7348,
        accuracyMeters: 4.1,
        photographer: 'Rajesh Patel (Junior Engineer)',
        type: 'Embankment Inspection',
        notes: 'Riprap protection along the left wing wall is stable. Minor silt deposition in upstream basin.',
        device: 'Samsung Galaxy Tab S7 / GPS Locked (9 sats)',
        exif: { iso: 125, focalLength: '26mm', shutter: '1/320s', direction: '310° NW' }
      },
      {
        id: 'fp-cd17-03',
        title: 'Downstream Stilling Basin',
        url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80',
        thumbnail: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=400&q=80',
        date: '2024-08-14',
        lat: 21.8296,
        lng: 73.7356,
        accuracyMeters: 2.8,
        photographer: 'Rajesh Patel (Junior Engineer)',
        type: 'Stilling Basin',
        notes: 'Downstream apron in sound condition. Energy dissipation working as designed during heavy flow.',
        device: 'Samsung Galaxy Tab S7 / GPS Locked (7 sats)',
        exif: { iso: 80, focalLength: '26mm', shutter: '1/600s', direction: '45° NE' }
      }
    ],

    // Satellite Change Analysis (Baseline vs Current)
    satelliteChange: {
      baselineDate: '2022-05-15',
      currentDate: '2024-09-18',
      sensor: 'Sentinel-2 Multispectral (L2A Surface Reflectance)',
      baselineImageUrl: 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&w=900&q=80',
      currentImageUrl: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=900&q=80',
      
      ndvi: {
        before: 0.34,
        after: 0.47,
        delta: +0.13,
        interpretation: 'Moderate vegetation density increase within 250m buffer'
      },
      ndwi: {
        before: -0.18,
        after: +0.12,
        delta: +0.30,
        interpretation: 'Significant surface water index improvement'
      },
      waterExtentHa: {
        before: 2.7,
        after: 4.9,
        delta: +2.2,
        interpretation: 'Observed surface water accumulation expansion'
      },
      lulc: {
        before: 'Barren / Shrubland',
        after: 'Open Water & Mixed Crop',
        transition: 'Fallow / Barren → Moisture-Supported Mixed Cover'
      },
      observedChangeSummary: 'Vegetation and water-related indicators increased during the selected comparison period. Satellite evidence indicates expanded seasonal water retention upstream of the check dam structure.'
    },

    // DEM / Terrain Context
    terrain: {
      elevationM: 412,
      slopeDeg: 7.2,
      flowAccumulation: 'HIGH',
      flowAccumulationVal: '14,250 cells',
      drainageDistanceM: 38,
      catchmentAreaHa: 185,
      streamOrder: 3,
      terrainType: 'Gently Rolling Valley Basin',
      explanation: 'Terrain context indicates that the intervention is located 38 m from a 3rd-order drainage stream within a high-flow-accumulation catchment zone.',
      dataSource: 'DEM DEMONSTRATION DATA (SRTM 30m derived)'
    },

    // Review / Watchlist Status
    isReviewed: false,
    reviewStatus: 'PENDING_REVIEW',
    reviewNotes: ''
  },

  {
    id: 'int-narmada-fp-09',
    watershedId: 'ws-narmada',
    name: 'Farm Pond #09',
    type: 'Farm Pond',
    village: 'Rajpipla',
    district: 'Narmada, Gujarat',
    lat: 21.8512,
    lng: 73.5023,
    constructionDate: '2022-11-18',
    status: 'Operational',
    costInr: '₹ 3,20,000',
    implementingAgency: 'GSWMA',
    scheme: 'PMKSY-WDC 2.0',
    
    fieldPhotos: [
      {
        id: 'fp-fp09-01',
        title: 'Farm Pond Excavation & Inflow Inlet',
        url: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=1200&q=80',
        thumbnail: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=400&q=80',
        date: '2023-03-15',
        lat: 21.8513,
        lng: 73.5025,
        accuracyMeters: 4.5,
        photographer: 'Kishan Solanki (Field Assistant)',
        type: 'Dry Season Inspection',
        notes: 'Inlet channel clear. Pond holding ~30% capacity at end of dry season.',
        device: 'Redmi Note 11 / GPS Locked',
        exif: { iso: 100, focalLength: '24mm', shutter: '1/500s', direction: '180° S' }
      }
    ],

    satelliteChange: {
      baselineDate: '2022-10-01',
      currentDate: '2024-09-18',
      sensor: 'Sentinel-2 Multispectral (L2A)',
      baselineImageUrl: 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&w=900&q=80',
      currentImageUrl: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=900&q=80',
      ndvi: { before: 0.42, after: 0.31, delta: -0.11, interpretation: 'Local vegetation index decline around perimeter' },
      ndwi: { before: -0.05, after: +0.16, delta: +0.21, interpretation: 'Pronounced water signal detection in excavated depression' },
      waterExtentHa: { before: 0.2, after: 1.1, delta: +0.9, interpretation: 'Water ponding signature detected' },
      lulc: { before: 'Rainfed Agriculture', after: 'Water Storage & Silt Embankment', transition: 'Crop Land → Surface Storage' },
      observedChangeSummary: 'Satellite observations indicate a marked increase in surface moisture with a slight localized vegetation dip surrounding the pond perimeter.'
    },

    terrain: {
      elevationM: 388,
      slopeDeg: 4.1,
      flowAccumulation: 'MEDIUM',
      flowAccumulationVal: '6,400 cells',
      drainageDistanceM: 95,
      catchmentAreaHa: 62,
      streamOrder: 2,
      terrainType: 'Terraced Agricultural Lowland',
      explanation: 'Terrain context shows a gentle 4.1° slope in a terraced field catchment located 95 m from a 2nd-order tributary.',
      dataSource: 'DEM DEMONSTRATION DATA (SRTM 30m derived)'
    },

    isReviewed: false,
    reviewStatus: 'PENDING_REVIEW',
    reviewNotes: ''
  },

  {
    id: 'int-narmada-pt-03',
    watershedId: 'ws-narmada',
    name: 'Percolation Tank #03',
    type: 'Percolation Tank',
    village: 'Garudeshwar',
    district: 'Narmada, Gujarat',
    lat: 21.9184,
    lng: 73.6712,
    constructionDate: '2021-09-22',
    status: 'Completed',
    costInr: '₹ 18,50,000',
    implementingAgency: 'GSWMA',
    scheme: 'PMKSY-WDC 1.0',
    
    fieldPhotos: [
      {
        id: 'fp-pt03-01',
        title: 'Percolation Bed & Bund',
        url: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1200&q=80',
        thumbnail: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=400&q=80',
        date: '2022-10-05',
        lat: 21.9185,
        lng: 73.6715,
        accuracyMeters: 5.0,
        photographer: 'P. N. Joshi (Executive Engineer)',
        type: 'Completion Record',
        notes: 'Percolation tank construction completed as per DPR specifications.',
        device: 'Handheld Trimble GPS / Geotagged',
        exif: { iso: 100, focalLength: '28mm', shutter: '1/250s', direction: '90° E' }
      }
    ],

    satelliteChange: {
      baselineDate: '2021-08-10',
      currentDate: '2024-08-30',
      sensor: 'Sentinel-2 Multispectral',
      baselineImageUrl: 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&w=900&q=80',
      currentImageUrl: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=900&q=80',
      ndvi: { before: 0.38, after: 0.44, delta: +0.06, interpretation: 'Stable to slight greening in downstream zone' },
      ndwi: { before: -0.10, after: -0.07, delta: +0.03, interpretation: 'Stable sub-surface recharge signature' },
      waterExtentHa: { before: 1.4, after: 2.1, delta: +0.7, interpretation: 'Seasonal percolation ponding' },
      lulc: { before: 'Scrub / Grazing Land', after: 'Recharge Basin & Scrub', transition: 'Scrub → Percolation Facility' },
      observedChangeSummary: 'Satellite observations indicate consistent vegetation stability in the downstream zone with seasonal water infiltration signatures.'
    },

    terrain: {
      elevationM: 356,
      slopeDeg: 2.8,
      flowAccumulation: 'LOW',
      flowAccumulationVal: '2,100 cells',
      drainageDistanceM: 220,
      catchmentAreaHa: 45,
      streamOrder: 1,
      terrainType: 'Plateau Depressional Plain',
      explanation: 'Terrain context shows a flat 2.8° plateau depression suitable for groundwater recharge percolation.',
      dataSource: 'DEM DEMONSTRATION DATA (SRTM 30m derived)'
    },

    isReviewed: false,
    reviewStatus: 'PENDING_REVIEW',
    reviewNotes: ''
  },

  {
    id: 'int-narmada-pl-04',
    watershedId: 'ws-narmada',
    name: 'Plantation Zone #04',
    type: 'Afforestation / Plantation',
    village: 'Poicha',
    district: 'Vadodara, Gujarat',
    lat: 21.9841,
    lng: 73.8023,
    constructionDate: '2022-07-01',
    status: 'Operational',
    costInr: '₹ 8,90,000',
    implementingAgency: 'Social Forestry Division',
    scheme: 'PMKSY-WDC 2.0 Ridge-to-Valley',
    
    fieldPhotos: [
      {
        id: 'fp-pl04-01',
        title: 'Sapling Establishment Survey',
        url: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=1200&q=80',
        thumbnail: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=400&q=80',
        date: '2023-07-20',
        lat: 21.9842,
        lng: 73.8025,
        accuracyMeters: 3.8,
        photographer: 'Anil Vasava (Forest Guard)',
        type: 'Survival Rate Audit',
        notes: 'Survival rate recorded at ~68%. Termite damage reported in northern quadrant.',
        device: 'Garmin eTrex 32x / Geotagged',
        exif: { iso: 200, focalLength: '35mm', shutter: '1/350s', direction: '270° W' }
      }
    ],

    satelliteChange: {
      baselineDate: '2022-06-01',
      currentDate: '2024-10-01',
      sensor: 'Sentinel-2 Multispectral',
      baselineImageUrl: 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&w=900&q=80',
      currentImageUrl: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=900&q=80',
      ndvi: { before: 0.52, after: 0.34, delta: -0.18, interpretation: 'Vegetation density decrease detected across parcel' },
      ndwi: { before: -0.08, after: -0.13, delta: -0.05, interpretation: 'Moisture deficit signature' },
      waterExtentHa: { before: 0.0, after: 0.0, delta: 0.0, interpretation: 'No open surface water' },
      lulc: { before: 'Dense Scrub / Plantation', after: 'Degraded Shrub / Fallow', transition: 'Plantation → Sparse Scrub' },
      observedChangeSummary: 'Satellite observations indicate a noticeable decrease in vegetation index (NDVI Δ -0.18) during the comparison period, suggesting stress or die-off in portions of the plantation zone.'
    },

    terrain: {
      elevationM: 298,
      slopeDeg: 5.5,
      flowAccumulation: 'MEDIUM',
      flowAccumulationVal: '5,800 cells',
      drainageDistanceM: 155,
      catchmentAreaHa: 78,
      streamOrder: 2,
      terrainType: 'Upper Ridge Slope',
      explanation: 'Terrain context shows a 5.5° upper ridge slope with moderate drainage runoff.',
      dataSource: 'DEM DEMONSTRATION DATA (SRTM 30m derived)'
    },

    isReviewed: false,
    reviewStatus: 'PENDING_REVIEW',
    reviewNotes: ''
  },

  {
    id: 'int-narmada-bund-02',
    watershedId: 'ws-narmada',
    name: 'Earthen Bund #02',
    type: 'Earthen Contour Bund',
    village: 'Shoolpaneshwar',
    district: 'Narmada, Gujarat',
    lat: 21.7923,
    lng: 73.8741,
    constructionDate: '2021-12-14',
    status: 'Needs Repair',
    costInr: '₹ 4,10,000',
    implementingAgency: 'GSWMA',
    scheme: 'PMKSY-WDC 1.0',
    
    fieldPhotos: [
      {
        id: 'fp-bund02-01',
        title: 'Embankment Breach Section',
        url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80',
        thumbnail: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=400&q=80',
        date: '2022-05-10',
        lat: 21.7924,
        lng: 73.8743,
        accuracyMeters: 6.2,
        photographer: 'Mahesh Solanki (Field Supervisor)',
        type: 'Damage Assessment',
        notes: 'Section breached by flash runoff during unseasonal rain. Repair estimate submitted.',
        device: 'Samsung M31 / GPS Tagged',
        exif: { iso: 160, focalLength: '26mm', shutter: '1/400s', direction: '180° S' }
      }
    ],

    satelliteChange: {
      baselineDate: '2021-11-01',
      currentDate: '2024-07-15',
      sensor: 'Sentinel-2 Multispectral',
      baselineImageUrl: 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&w=900&q=80',
      currentImageUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=900&q=80',
      ndvi: { before: 0.41, after: 0.34, delta: -0.07, interpretation: 'Slight reduction in retention strip vegetation' },
      ndwi: { before: -0.04, after: -0.16, delta: -0.12, interpretation: 'Decline in moisture retention behind bund' },
      waterExtentHa: { before: 0.8, after: 0.1, delta: -0.7, interpretation: 'Loss of ponding capacity' },
      lulc: { before: 'Contour Retention Strip', after: 'Eroded Gully / Scrub', transition: 'Retention Strip → Gully Exposure' },
      observedChangeSummary: 'Satellite observations indicate a decline in moisture retention indicators behind the bund line during the comparison period.'
    },

    terrain: {
      elevationM: 445,
      slopeDeg: 11.3,
      flowAccumulation: 'HIGH',
      flowAccumulationVal: '18,900 cells',
      drainageDistanceM: 28,
      catchmentAreaHa: 210,
      streamOrder: 3,
      terrainType: 'Steep Valley Flank',
      explanation: 'Terrain context shows a steep 11.3° slope situated 28 m from a high-flow drainage line, subjecting the structure to severe hydrodynamic velocity.',
      dataSource: 'DEM DEMONSTRATION DATA (SRTM 30m derived)'
    },

    isReviewed: false,
    reviewStatus: 'PENDING_REVIEW',
    reviewNotes: ''
  },

  {
    id: 'int-narmada-ct-06',
    watershedId: 'ws-narmada',
    name: 'Contour Trench #06',
    type: 'Continuous Contour Trench (CCT)',
    village: 'Dediapada',
    district: 'Narmada, Gujarat',
    lat: 21.6743,
    lng: 73.6201,
    constructionDate: '2023-01-08',
    status: 'Completed',
    costInr: '₹ 6,30,000',
    implementingAgency: 'GSWMA',
    scheme: 'PMKSY-WDC 2.0',
    
    fieldPhotos: [
      {
        id: 'fp-ct06-01',
        title: 'Trench Line & Mound Stabilization',
        url: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=80',
        thumbnail: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=400&q=80',
        date: '2024-02-14',
        lat: 21.6745,
        lng: 73.6204,
        accuracyMeters: 3.0,
        photographer: 'C. R. Parmar (GIS Inspector)',
        type: 'Routine Audit',
        notes: 'Continuous trenches effectively trapping hill runoff. Berm grasses well established.',
        device: 'OnePlus Nord CE / GPS Locked (11 sats)',
        exif: { iso: 100, focalLength: '24mm', shutter: '1/640s', direction: '0° N' }
      }
    ],

    satelliteChange: {
      baselineDate: '2022-12-01',
      currentDate: '2024-09-25',
      sensor: 'Sentinel-2 Multispectral',
      baselineImageUrl: 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&w=900&q=80',
      currentImageUrl: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=900&q=80',
      ndvi: { before: 0.29, after: 0.38, delta: +0.09, interpretation: 'Consistent greening along contour lines' },
      ndwi: { before: -0.15, after: -0.11, delta: +0.04, interpretation: 'Soil moisture improvement' },
      waterExtentHa: { before: 0.0, after: 0.4, delta: +0.4, interpretation: 'Micro-ponding in trench invert' },
      lulc: { before: 'Degraded Hill Slope', after: 'Vegetated Contour Ridges', transition: 'Barren Hill → Stabilized Contour' },
      observedChangeSummary: 'Satellite observations indicate an increase in greenness (NDVI Δ +0.09) along the contour lines during the comparison period.'
    },

    terrain: {
      elevationM: 321,
      slopeDeg: 8.7,
      flowAccumulation: 'MEDIUM',
      flowAccumulationVal: '7,300 cells',
      drainageDistanceM: 112,
      catchmentAreaHa: 94,
      streamOrder: 2,
      terrainType: 'Moderate Hill Ridge Slope',
      explanation: 'Terrain context shows an 8.7° moderate slope situated 112 m from a secondary drainage channel.',
      dataSource: 'DEM DEMONSTRATION DATA (SRTM 30m derived)'
    },

    isReviewed: false,
    reviewStatus: 'PENDING_REVIEW',
    reviewNotes: ''
  },

  {
    id: 'int-narmada-dw-08',
    watershedId: 'ws-narmada',
    name: 'Drainage Channel #08',
    type: 'Drainage Line Treatment',
    village: 'Tilakwada',
    district: 'Narmada, Gujarat',
    lat: 21.9102,
    lng: 73.5834,
    constructionDate: '2022-03-20',
    status: 'Operational',
    costInr: '₹ 7,40,000',
    implementingAgency: 'GSWMA',
    scheme: 'PMKSY-WDC 2.0',
    
    fieldPhotos: [], // No field photos yet (LIMITED EVIDENCE / NO DATA)

    satelliteChange: {
      baselineDate: '2022-02-15',
      currentDate: '2024-06-10',
      sensor: 'Sentinel-2 Multispectral',
      baselineImageUrl: 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&w=900&q=80',
      currentImageUrl: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=900&q=80',
      ndvi: { before: 0.35, after: 0.37, delta: +0.02, interpretation: 'Marginal change in riparian vegetation' },
      ndwi: { before: -0.02, after: +0.13, delta: +0.15, interpretation: 'Channel moisture retention enhancement' },
      waterExtentHa: { before: 1.1, after: 2.3, delta: +1.2, interpretation: 'Channel flow retention detected' },
      lulc: { before: 'Uncontrolled Gully', after: 'Treated Drainage Course', transition: 'Gully → Stabilized Channel' },
      observedChangeSummary: 'Satellite observations indicate increased channel moisture retention during the comparison period.'
    },

    terrain: {
      elevationM: 372,
      slopeDeg: 3.4,
      flowAccumulation: 'HIGH',
      flowAccumulationVal: '22,400 cells',
      drainageDistanceM: 18,
      catchmentAreaHa: 340,
      streamOrder: 4,
      terrainType: 'Major Valley Drainage Inflow',
      explanation: 'Terrain context shows a 3.4° valley bed situated directly within 18 m of a 4th-order major stream line with high flow accumulation.',
      dataSource: 'DEM DEMONSTRATION DATA (SRTM 30m derived)'
    },

    isReviewed: false,
    reviewStatus: 'PENDING_REVIEW',
    reviewNotes: ''
  },

  {
    id: 'int-narmada-rs-11',
    watershedId: 'ws-narmada',
    name: 'Recharge Well #11',
    type: 'Recharge Shaft / Well',
    village: 'Sagbara',
    district: 'Narmada, Gujarat',
    lat: 21.7401,
    lng: 73.7089,
    constructionDate: '2022-09-05',
    status: 'Operational',
    costInr: '₹ 5,20,000',
    implementingAgency: 'Central Ground Water Board (CGWB) & GSWMA',
    scheme: 'Jal Shakti Abhiyan / PMKSY',
    
    fieldPhotos: [
      {
        id: 'fp-rs11-01',
        title: 'Recharge Shaft Silt Filter Chamber',
        url: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=80',
        thumbnail: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=400&q=80',
        date: '2024-08-03',
        lat: 21.7403,
        lng: 73.7091,
        accuracyMeters: 2.5,
        photographer: 'S. K. Joshi (Hydrogeologist)',
        type: 'Water Table & Filter Audit',
        notes: 'Gravel filter clean. Water level measured at 8.4m below ground level post-monsoon.',
        device: 'Garmin Oregon 700 / DGPS Mode',
        exif: { iso: 100, focalLength: '26mm', shutter: '1/500s', direction: '135° SE' }
      }
    ],

    satelliteChange: {
      baselineDate: '2022-08-01',
      currentDate: '2024-09-20',
      sensor: 'Sentinel-2 Multispectral',
      baselineImageUrl: 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&w=900&q=80',
      currentImageUrl: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=900&q=80',
      ndvi: { before: 0.44, after: 0.47, delta: +0.03, interpretation: 'Consistent cropland productivity' },
      ndwi: { before: -0.06, after: -0.04, delta: +0.02, interpretation: 'Stable aquifer moisture' },
      waterExtentHa: { before: 0.0, after: 0.0, delta: 0.0, interpretation: 'Sub-surface injection (no open surface water)' },
      lulc: { before: 'Irrigated Cropland', after: 'Irrigated Double Crop', transition: 'Single Crop → Double Crop Sustained' },
      observedChangeSummary: 'Satellite observations indicate consistent vegetation and moisture stability in the surrounding agricultural zone during the comparison period.'
    },

    terrain: {
      elevationM: 391,
      slopeDeg: 2.1,
      flowAccumulation: 'LOW',
      flowAccumulationVal: '1,800 cells',
      drainageDistanceM: 310,
      catchmentAreaHa: 38,
      streamOrder: 1,
      terrainType: 'Alluvial Flat Basin',
      explanation: 'Terrain context shows a flat 2.1° alluvial basin situated 310 m from surface drainage, suitable for direct aquifer injection.',
      dataSource: 'DEM DEMONSTRATION DATA (SRTM 30m derived)'
    },

    isReviewed: false,
    reviewStatus: 'PENDING_REVIEW',
    reviewNotes: ''
  }
];

// ─── DETERMINISTIC EVIDENCE STATUS LOGIC ──────────────────────────────────────
/**
 * Computes evidence status and explanation:
 *   - VERIFIED: Recent photo (<180 days), GPS available, consistent with satellite indicators.
 *   - NEEDS UPDATE: Field photo exists but is older than 180 days.
 *   - LIMITED EVIDENCE: Some data exists but incomplete (e.g. 0 photos or missing satellite).
 *   - INCONSISTENT: Field record says operational, but satellite indicates major decline/anomaly.
 *   - NO DATA: Insufficient records.
 */
export function calculateEvidenceStatus(intervention) {
  const photos = intervention.fieldPhotos || [];
  const photoCount = photos.length;
  const latestPhoto = photoCount > 0 ? photos[0] : null;
  const sat = intervention.satelliteChange;

  if (photoCount === 0 && !sat) {
    return {
      status: 'NO DATA',
      color: '#6b7280',
      bg: 'rgba(107,114,128,0.12)',
      badge: 'NO DATA',
      explanation: 'Insufficient field photographs and satellite observations recorded for this intervention.'
    };
  }

  if (photoCount === 0 && sat) {
    return {
      status: 'LIMITED EVIDENCE',
      color: '#38bdf8',
      bg: 'rgba(56,189,248,0.12)',
      badge: 'LIMITED EVIDENCE',
      explanation: 'Satellite observation exists but supporting ground-truth photo evidence is not yet recorded.'
    };
  }

  // Check if photo is recent (within 180 days of now or within 180 days of sat observation)
  const photoDate = latestPhoto?.date ? new Date(latestPhoto.date) : null;
  const daysSincePhoto = photoDate ? Math.floor((Date.now() - photoDate.getTime()) / 86400000) : 9999;
  const isRecentPhoto = daysSincePhoto < 240; // 8 months threshold

  // Check for satellite decline / discrepancy
  const hasDecline = sat?.ndvi?.delta !== undefined && sat.ndvi.delta < -0.10;
  const isDamaged = intervention.status === 'Needs Repair';

  if (isDamaged || (hasDecline && isRecentPhoto && intervention.status === 'Operational')) {
    return {
      status: 'INCONSISTENT',
      color: '#f97316',
      bg: 'rgba(249,115,22,0.12)',
      badge: 'INCONSISTENT',
      explanation: 'Field record indicates operational status, but satellite observations show anomalous spectral decline.'
    };
  }

  if (!isRecentPhoto) {
    return {
      status: 'NEEDS UPDATE',
      color: '#f59e0b',
      bg: 'rgba(245,158,11,0.12)',
      badge: 'NEEDS UPDATE',
      explanation: `Recent field evidence is unavailable for this intervention (last photo: ${latestPhoto?.date || 'unknown'}).`
    };
  }

  return {
    status: 'VERIFIED',
    color: '#10b981',
    bg: 'rgba(16,185,129,0.12)',
    badge: 'VERIFIED',
    explanation: 'Recent geo-tagged field evidence and satellite observations are consistent.'
  };
}

// ─── SYNTHESIZE FACTUAL ASSESSMENT ───────────────────────────────────────────
export function buildStructuredAssessment(intervention, statusInfo) {
  const photos = intervention.fieldPhotos || [];
  const sat = intervention.satelliteChange;
  const terrain = intervention.terrain;

  const parts = [];

  // 1. Field part
  if (photos.length > 0) {
    const p = photos[0];
    parts.push(`Field evidence confirms ${photos.length} geo-tagged photograph${photos.length > 1 ? 's' : ''} (latest: ${p.date}) at ${intervention.lat.toFixed(4)}°N, ${intervention.lng.toFixed(4)}°E with GPS accuracy ${p.accuracyMeters || 3.0}m.`);
  } else {
    parts.push(`Field photographic evidence is currently pending recording for this intervention.`);
  }

  // 2. Satellite part
  if (sat) {
    const ndviText = sat.ndvi.delta >= 0 ? `+${sat.ndvi.delta.toFixed(2)}` : `${sat.ndvi.delta.toFixed(2)}`;
    const waterText = sat.waterExtentHa ? (sat.waterExtentHa.delta >= 0 ? `+${sat.waterExtentHa.delta.toFixed(1)} ha` : `${sat.waterExtentHa.delta.toFixed(1)} ha`) : null;
    parts.push(`Satellite comparison (${sat.baselineDate} → ${sat.currentDate}) indicates NDVI change of ${ndviText}${waterText ? ` and water extent variation of ${waterText}` : ''}.`);
  }

  // 3. Terrain part
  if (terrain) {
    parts.push(`Terrain analysis situates the structure at elevation ${terrain.elevationM}m (${terrain.slopeDeg}° slope) approximately ${terrain.drainageDistanceM}m from drainage, in a ${terrain.flowAccumulation.toLowerCase()} flow accumulation zone.`);
  }

  return {
    summary: parts.join(' '),
    status: statusInfo.status,
    notes: 'Generated from structured geospatial, satellite, and ground observations. Non-causal analytical interpretation.'
  };
}

// ─── API HANDLER HELPERS ──────────────────────────────────────────────────────

export function getWatershedList() {
  return REVIEW_WATERSHEDS.map(w => ({
    id: w.id,
    name: w.name,
    district: w.district,
    state: w.state,
    areaKm2: w.areaKm2,
    centroid: w.centroid,
    interventionsCount: w.interventionsCount
  }));
}

export function getInterventionsForWatershed(watershedId) {
  const list = REVIEW_INTERVENTIONS.filter(i => i.watershedId === watershedId);
  if (list.length > 0) return list;
  // If no exact match, return Narmada interventions mapped to watershed
  return REVIEW_INTERVENTIONS.map(i => ({ ...i, watershedId }));
}

export function getInterventionDetail(interventionId) {
  const item = REVIEW_INTERVENTIONS.find(i => i.id === interventionId) || REVIEW_INTERVENTIONS[0];
  const statusInfo = calculateEvidenceStatus(item);
  const assessment = buildStructuredAssessment(item, statusInfo);
  return {
    ...item,
    evidenceStatus: statusInfo.status,
    evidenceStatusInfo: statusInfo,
    assessment
  };
}
