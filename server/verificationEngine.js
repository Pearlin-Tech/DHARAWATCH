/**
 * DHARAWATCH — Verification Engine
 *
 * Deterministic Evidence-Driven Field Verification Planner.
 *
 * Implements:
 *   - Deterministic priority scoring (0-100, explainable formula)
 *   - Evidence gap analysis
 *   - DEM / terrain context adapter (demo data clearly labeled)
 *   - Intervention-level satellite + field evidence linking
 *   - Nearest-neighbor route optimization
 *
 * ACCURACY NOTE: This is a prototype decision-support system.
 * Priority scores are NOT official government KPIs.
 * Satellite context uses observed analytical language only.
 * DEM terrain data where marked is DEMONSTRATION DATA.
 */

// ─── Haversine distance (meters) ─────────────────────────────────────────────
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Seeded deterministic random (LCG) ───────────────────────────────────────
// Used only for spreading demo data; result is always the same for same seed.
function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 4294967296;
  };
}

// ─── DEMO WATERSHEDS ─────────────────────────────────────────────────────────
export const DEMO_WATERSHEDS = [
  { id: 'ws-narmada', name: 'Narmada River Basin — Kevadiya Catchment', areaKm2: 1240, lat: 21.8294, lng: 73.7351, state: 'Gujarat' },
  { id: 'ws-godavari', name: 'Godavari Basin — Nashik Reach', areaKm2: 2150, lat: 19.9975, lng: 73.7898, state: 'Maharashtra' },
  { id: 'ws-cauvery', name: 'Cauvery Basin — Mandya Micro-Watershed', areaKm2: 890, lat: 12.5218, lng: 76.8951, state: 'Karnataka' },
  { id: 'ws-krishna', name: 'Krishna Basin — Mahabaleshwar Catchment', areaKm2: 1460, lat: 17.9237, lng: 73.6586, state: 'Maharashtra' },
  { id: 'ws-tapi', name: 'Tapi River Basin — Surat Reach', areaKm2: 980, lat: 21.1702, lng: 72.8311, state: 'Gujarat' }
];

// ─── DEMO DATASET — Narmada Basin ─────────────────────────────────────────────
// Clearly labeled as DEMONSTRATION DATA.
// Real data should replace these records via the database once available.
export const DEMO_INTERVENTIONS = [
  {
    id: 'int-narmada-cd-01',
    watershedId: 'ws-narmada',
    type: 'Check Dam',
    name: 'Check Dam #17',
    village: 'Kevadiya Colony',
    district: 'Narmada, Gujarat',
    lat: 21.8294,
    lng: 73.7351,
    date: '2022-06-10',
    status: 'OPERATIONAL',
    photoCount: 0,
    latestPhotoDate: null,
    satObsDate: '2024-09-12',
    ndviChange: +0.14,
    ndwiChange: +0.08,
    waterChange: 'INCREASE',
    lulcChange: 'Barren → Mixed',
    elevation: 412,
    slope: 7.2,
    flowAccumulation: 'HIGH',
    drainageDistanceM: 38,
    dataQuality: 45,  // lower = worse quality
    _demo: true
  },
  {
    id: 'int-narmada-fp-09',
    watershedId: 'ws-narmada',
    type: 'Farm Pond',
    name: 'Farm Pond #09',
    village: 'Rajpipla',
    district: 'Narmada, Gujarat',
    lat: 21.8512,
    lng: 73.5023,
    date: '2022-11-18',
    status: 'OPERATIONAL',
    photoCount: 2,
    latestPhotoDate: '2023-03-15',
    satObsDate: '2024-09-18',
    ndviChange: -0.11,
    ndwiChange: +0.21,
    waterChange: 'ANOMALY',
    lulcChange: null,
    elevation: 388,
    slope: 4.1,
    flowAccumulation: 'MEDIUM',
    drainageDistanceM: 95,
    dataQuality: 68,
    _demo: true
  },
  {
    id: 'int-narmada-pt-03',
    watershedId: 'ws-narmada',
    type: 'Percolation Tank',
    name: 'Percolation Tank #03',
    village: 'Garudeshwar',
    district: 'Narmada, Gujarat',
    lat: 21.9184,
    lng: 73.6712,
    date: '2021-09-22',
    status: 'COMPLETED',
    photoCount: 4,
    latestPhotoDate: '2022-10-05',
    satObsDate: '2024-08-30',
    ndviChange: +0.06,
    ndwiChange: +0.03,
    waterChange: 'STABLE',
    lulcChange: null,
    elevation: 356,
    slope: 2.8,
    flowAccumulation: 'LOW',
    drainageDistanceM: 220,
    dataQuality: 82,
    _demo: true
  },
  {
    id: 'int-narmada-pl-04',
    watershedId: 'ws-narmada',
    type: 'Plantation',
    name: 'Plantation Zone #04',
    village: 'Poicha',
    district: 'Vadodara, Gujarat',
    lat: 21.9841,
    lng: 73.8023,
    date: '2022-07-01',
    status: 'OPERATIONAL',
    photoCount: 3,
    latestPhotoDate: '2023-07-20',
    satObsDate: '2024-10-01',
    ndviChange: -0.18,
    ndwiChange: -0.05,
    waterChange: 'DECREASE',
    lulcChange: 'Vegetation → Mixed',
    elevation: 298,
    slope: 5.5,
    flowAccumulation: 'MEDIUM',
    drainageDistanceM: 155,
    dataQuality: 55,
    _demo: true
  },
  {
    id: 'int-narmada-bund-02',
    watershedId: 'ws-narmada',
    type: 'Bund',
    name: 'Earthen Bund #02',
    village: 'Shoolpaneshwar',
    district: 'Narmada, Gujarat',
    lat: 21.7923,
    lng: 73.8741,
    date: '2021-12-14',
    status: 'NEEDS_REPAIR',
    photoCount: 1,
    latestPhotoDate: '2022-05-10',
    satObsDate: '2024-07-15',
    ndviChange: -0.07,
    ndwiChange: -0.12,
    waterChange: 'DECREASE',
    lulcChange: null,
    elevation: 445,
    slope: 11.3,
    flowAccumulation: 'HIGH',
    drainageDistanceM: 28,
    dataQuality: 30,
    _demo: true
  },
  {
    id: 'int-narmada-ct-06',
    watershedId: 'ws-narmada',
    type: 'Contour Trench',
    name: 'Contour Trench #06',
    village: 'Dediapada',
    district: 'Narmada, Gujarat',
    lat: 21.6743,
    lng: 73.6201,
    date: '2023-01-08',
    status: 'COMPLETED',
    photoCount: 5,
    latestPhotoDate: '2024-02-14',
    satObsDate: '2024-09-25',
    ndviChange: +0.09,
    ndwiChange: +0.04,
    waterChange: 'STABLE',
    lulcChange: null,
    elevation: 321,
    slope: 8.7,
    flowAccumulation: 'MEDIUM',
    drainageDistanceM: 112,
    dataQuality: 91,
    _demo: true
  },
  {
    id: 'int-narmada-dw-08',
    watershedId: 'ws-narmada',
    type: 'Drainage Work',
    name: 'Drainage Channel #08',
    village: 'Tilakwada',
    district: 'Narmada, Gujarat',
    lat: 21.9102,
    lng: 73.5834,
    date: '2022-03-20',
    status: 'OPERATIONAL',
    photoCount: 0,
    latestPhotoDate: null,
    satObsDate: '2024-06-10',
    ndviChange: null,
    ndwiChange: +0.15,
    waterChange: 'INCREASE',
    lulcChange: null,
    elevation: 372,
    slope: 3.4,
    flowAccumulation: 'HIGH',
    drainageDistanceM: 18,
    dataQuality: 42,
    _demo: true
  },
  {
    id: 'int-narmada-rs-11',
    watershedId: 'ws-narmada',
    type: 'Recharge Structure',
    name: 'Recharge Well #11',
    village: 'Sagbara',
    district: 'Narmada, Gujarat',
    lat: 21.7401,
    lng: 73.7089,
    date: '2022-09-05',
    status: 'OPERATIONAL',
    photoCount: 6,
    latestPhotoDate: '2024-08-03',
    satObsDate: '2024-09-20',
    ndviChange: +0.03,
    ndwiChange: +0.02,
    waterChange: 'STABLE',
    lulcChange: null,
    elevation: 391,
    slope: 2.1,
    flowAccumulation: 'LOW',
    drainageDistanceM: 310,
    dataQuality: 96,
    _demo: true
  }
];

// ─── DEM / TERRAIN CONTEXT ADAPTER ───────────────────────────────────────────
// Returns terrain context for a given intervention.
// Marked as DEM_DEMONSTRATION_DATA where real DEM source is not connected.
// Structure is designed so a real SRTM/DEM source can be swapped in.
export function getTerrainContext(intervention) {
  if (
    intervention.elevation !== undefined &&
    intervention.slope !== undefined &&
    intervention.flowAccumulation !== undefined
  ) {
    return {
      elevation: intervention.elevation,
      slope: intervention.slope,
      flowAccumulation: intervention.flowAccumulation,
      drainageDistanceM: intervention.drainageDistanceM,
      flowDirection: intervention.flowAccumulation === 'HIGH' ? 'Converging' : 'Diverging',
      catchmentContext: intervention.flowAccumulation === 'HIGH'
        ? 'High-accumulation drainage zone'
        : intervention.flowAccumulation === 'MEDIUM'
          ? 'Moderate catchment'
          : 'Low accumulation',
      dataLabel: intervention._demo ? 'DEM DEMONSTRATION DATA' : 'DEM'
    };
  }
  return null;
}

// ─── EVIDENCE STATUS ──────────────────────────────────────────────────────────
// GREEN = VERIFIED, YELLOW = NEEDS_UPDATE, ORANGE = INCONSISTENT, RED = HIGH_PRIORITY, GRAY = NO_DATA
export function classifyEvidenceStatus(intervention) {
  const daysSincePhoto = intervention.latestPhotoDate
    ? Math.floor((Date.now() - new Date(intervention.latestPhotoDate)) / 86400000)
    : null;

  const hasPhoto = intervention.photoCount > 0;
  const hasRecentPhoto = daysSincePhoto !== null && daysSincePhoto < 180; // 6 months
  const hasSatObs = !!intervention.satObsDate;
  const hasMajorSatChange = intervention.ndviChange !== null &&
    (Math.abs(intervention.ndviChange) > 0.1 || intervention.waterChange === 'ANOMALY' || intervention.waterChange === 'DECREASE');

  if (!hasPhoto && !hasSatObs) return 'NO_DATA';
  if (!hasPhoto || !hasRecentPhoto) {
    if (hasMajorSatChange) return 'HIGH_PRIORITY';
    return 'NEEDS_UPDATE';
  }
  if (hasRecentPhoto && hasMajorSatChange) return 'INCONSISTENT';
  if (hasRecentPhoto && !hasMajorSatChange) return 'VERIFIED';
  return 'NEEDS_UPDATE';
}

// ─── DETERMINISTIC PRIORITY SCORING ──────────────────────────────────────────
//
// Formula:
//   priorityScore =
//     0.35 * evidenceGap +
//     0.25 * satelliteAnomaly +
//     0.15 * interventionImportance +
//     0.15 * terrainHydrologyRelevance +
//     0.10 * dataQualityRisk
//
// All components normalized to 0-100 before combining.
// Higher score = higher need for field verification.
//
// IMPORTANT: This is a prototype heuristic, not an official government score.

export function calculateVerificationPriority(intervention) {
  // 1. Evidence Gap (0-100) — missing/outdated field evidence
  let evidenceGap = 0;
  if (!intervention.latestPhotoDate) {
    evidenceGap = 100; // No field evidence at all
  } else {
    const daysSincePhoto = Math.floor(
      (Date.now() - new Date(intervention.latestPhotoDate)) / 86400000
    );
    // 0 days = 0 gap; 365 days = 80 gap; >730 days = 100 gap
    evidenceGap = Math.min(100, (daysSincePhoto / 730) * 100);
  }
  if (intervention.photoCount === 0) evidenceGap = Math.max(evidenceGap, 90);

  // 2. Satellite Anomaly (0-100) — magnitude of satellite change signal
  let satelliteAnomaly = 0;
  if (intervention.waterChange === 'ANOMALY') satelliteAnomaly += 60;
  if (intervention.waterChange === 'DECREASE') satelliteAnomaly += 40;
  if (intervention.waterChange === 'INCREASE') satelliteAnomaly += 20;
  if (intervention.ndviChange !== null) {
    satelliteAnomaly += Math.min(40, Math.abs(intervention.ndviChange) * 200);
  }
  if (intervention.ndwiChange !== null) {
    satelliteAnomaly += Math.min(20, Math.abs(intervention.ndwiChange) * 100);
  }
  satelliteAnomaly = Math.min(100, satelliteAnomaly);

  // 3. Intervention Importance (0-100) — type and status weight
  const importanceMap = {
    'Check Dam': 85,
    'Percolation Tank': 80,
    'Farm Pond': 75,
    'Recharge Structure': 75,
    'Drainage Work': 70,
    'Bund': 65,
    'Contour Trench': 60,
    'Plantation': 55,
    'Other': 50
  };
  let interventionImportance = importanceMap[intervention.type] || 50;
  if (intervention.status === 'NEEDS_REPAIR') interventionImportance = Math.min(100, interventionImportance + 25);
  if (intervention.status === 'PLANNED') interventionImportance = Math.max(0, interventionImportance - 15);

  // 4. Terrain / Hydrology Relevance (0-100)
  let terrainHydrologyRelevance = 40; // baseline
  if (intervention.flowAccumulation === 'HIGH') terrainHydrologyRelevance += 40;
  else if (intervention.flowAccumulation === 'MEDIUM') terrainHydrologyRelevance += 20;
  if (intervention.drainageDistanceM !== undefined && intervention.drainageDistanceM < 50) terrainHydrologyRelevance += 15;
  else if (intervention.drainageDistanceM !== undefined && intervention.drainageDistanceM < 150) terrainHydrologyRelevance += 8;
  if (intervention.slope !== undefined && intervention.slope > 8) terrainHydrologyRelevance += 10;
  terrainHydrologyRelevance = Math.min(100, terrainHydrologyRelevance);

  // 5. Data Quality Risk (0-100) — inverse of data quality (poor quality = high risk)
  const dataQualityRisk = 100 - (intervention.dataQuality || 50);

  // Weighted sum
  const priorityScore = Math.round(
    0.35 * evidenceGap +
    0.25 * satelliteAnomaly +
    0.15 * interventionImportance +
    0.15 * terrainHydrologyRelevance +
    0.10 * dataQualityRisk
  );

  return {
    priorityScore: Math.min(100, Math.max(0, priorityScore)),
    components: {
      evidenceGap: Math.round(evidenceGap),
      satelliteAnomaly: Math.round(satelliteAnomaly),
      interventionImportance: Math.round(interventionImportance),
      terrainHydrologyRelevance: Math.round(terrainHydrologyRelevance),
      dataQualityRisk: Math.round(dataQualityRisk)
    }
  };
}

// ─── EVIDENCE GAP EXPLANATION ─────────────────────────────────────────────────
export function buildEvidenceGapExplanation(intervention, components) {
  const reasons = [];
  const daysSincePhoto = intervention.latestPhotoDate
    ? Math.floor((Date.now() - new Date(intervention.latestPhotoDate)) / 86400000)
    : null;

  if (intervention.photoCount === 0) {
    reasons.push('No field photographs available for this intervention.');
  } else if (daysSincePhoto !== null && daysSincePhoto > 180) {
    reasons.push(`Field evidence is outdated (last photo: ${daysSincePhoto} days ago).`);
  }

  if (intervention.waterChange === 'ANOMALY') {
    reasons.push('Satellite observation indicates a water-related anomaly around this site.');
  } else if (intervention.waterChange === 'DECREASE' && intervention.ndwiChange !== null) {
    reasons.push(`Observed water signal decline (NDWI Δ ${intervention.ndwiChange.toFixed(2)}) requires field verification.`);
  } else if (intervention.waterChange === 'INCREASE') {
    reasons.push(`Observed water signal increase (NDWI Δ +${(intervention.ndwiChange || 0).toFixed(2)}) around the intervention.`);
  }

  if (intervention.ndviChange !== null && Math.abs(intervention.ndviChange) > 0.1) {
    const dir = intervention.ndviChange > 0 ? 'increase' : 'decline';
    reasons.push(`Significant vegetation ${dir} observed (NDVI Δ ${intervention.ndviChange > 0 ? '+' : ''}${intervention.ndviChange.toFixed(2)}) during comparison period.`);
  }

  if (intervention.flowAccumulation === 'HIGH' && intervention.drainageDistanceM < 50) {
    reasons.push(`Site is located within ${intervention.drainageDistanceM}m of a high-flow-accumulation drainage zone.`);
  }

  if (intervention.status === 'NEEDS_REPAIR') {
    reasons.push('Intervention status is marked as NEEDS REPAIR — requires physical verification.');
  }

  if (components.dataQualityRisk > 60) {
    reasons.push('Data quality for this site is low — field update would improve record reliability.');
  }

  return reasons.length > 0 ? reasons : ['Standard monitoring cycle — no specific anomaly detected.'];
}

// ─── EVIDENCE CONSISTENCY ASSESSMENT ─────────────────────────────────────────
export function assessEvidenceConsistency(intervention) {
  const hasPhoto = intervention.photoCount > 0;
  const daysSincePhoto = intervention.latestPhotoDate
    ? Math.floor((Date.now() - new Date(intervention.latestPhotoDate)) / 86400000)
    : null;
  const hasRecentPhoto = daysSincePhoto !== null && daysSincePhoto < 180;
  const hasSatChange = intervention.waterChange === 'ANOMALY' ||
    intervention.waterChange === 'DECREASE' ||
    (intervention.ndviChange !== null && Math.abs(intervention.ndviChange) > 0.1);

  if (!hasPhoto) {
    return {
      status: 'LIMITED',
      label: 'LIMITED',
      description: 'INSUFFICIENT CURRENT EVIDENCE',
      details: {
        locationMatch: true,
        interventionRecord: true,
        recentFieldPhoto: false,
        satelliteChange: hasSatChange
      }
    };
  }
  if (hasRecentPhoto && hasSatChange) {
    return {
      status: 'INCONSISTENT',
      label: 'INCONSISTENT',
      description: 'FIELD AND SATELLITE SIGNALS DO NOT FULLY AGREE',
      details: {
        locationMatch: true,
        interventionRecord: true,
        recentFieldPhoto: true,
        satelliteChange: true
      }
    };
  }
  if (hasRecentPhoto && !hasSatChange) {
    return {
      status: 'CONSISTENT',
      label: 'CONSISTENT',
      description: 'FIELD EVIDENCE SUPPORTS RECORD',
      details: {
        locationMatch: true,
        interventionRecord: true,
        recentFieldPhoto: true,
        satelliteChange: false
      }
    };
  }
  return {
    status: 'LIMITED',
    label: 'LIMITED',
    description: 'INSUFFICIENT CURRENT EVIDENCE',
    details: {
      locationMatch: true,
      interventionRecord: true,
      recentFieldPhoto: false,
      satelliteChange: hasSatChange
    }
  };
}

// ─── PRIORITY LABEL ───────────────────────────────────────────────────────────
export function getPriorityLabel(score) {
  if (score >= 80) return 'HIGH PRIORITY';
  if (score >= 60) return 'MEDIUM PRIORITY';
  if (score >= 40) return 'LOW PRIORITY';
  return 'MONITOR';
}

// ─── FULL CANDIDATE ANALYSIS ──────────────────────────────────────────────────
export function buildVerificationCandidate(intervention) {
  const { priorityScore, components } = calculateVerificationPriority(intervention);
  const evidenceStatus = classifyEvidenceStatus(intervention);
  const terrain = getTerrainContext(intervention);
  const consistency = assessEvidenceConsistency(intervention);
  const reasons = buildEvidenceGapExplanation(intervention, components);

  return {
    id: intervention.id,
    name: intervention.name,
    type: intervention.type,
    lat: intervention.lat,
    lng: intervention.lng,
    village: intervention.village,
    district: intervention.district,
    watershedId: intervention.watershedId,
    interventionDate: intervention.date,
    status: intervention.status,

    // Field evidence
    photoCount: intervention.photoCount,
    latestPhotoDate: intervention.latestPhotoDate,
    gpsAvailable: true,

    // Satellite context
    satObsDate: intervention.satObsDate,
    ndviChange: intervention.ndviChange,
    ndwiChange: intervention.ndwiChange,
    waterChange: intervention.waterChange,
    lulcChange: intervention.lulcChange,
    satellite: {
      obsDate: intervention.satObsDate,
      ndviChange: intervention.ndviChange,
      ndwiChange: intervention.ndwiChange,
      waterChange: intervention.waterChange,
      lulcChange: intervention.lulcChange,
      label: 'Sentinel-2 Multispectral'
    },

    // Terrain
    terrain,

    // Scoring
    priorityScore,
    priorityLabel: getPriorityLabel(priorityScore),
    components,
    evidenceStatus,
    reasons,
    consistency,

    // Meta
    isDemo: !!intervention._demo
  };
}

// ─── GET INTERVENTIONS FOR WATERSHED ─────────────────────────────────────────
// Tries to load from database first; falls back to demo dataset.
export async function getWatershedInterventions(watershedId, dbGetAll) {
  let interventions = [];

  // Try real database interventions
  try {
    const all = await dbGetAll('interventions');
    const real = all.filter(i => i.watershedId === watershedId);
    if (real.length > 0) {
      interventions = real;
    }
  } catch (e) {
    console.warn('[VerificationEngine] DB interventions unavailable:', e.message);
  }

  // If no real interventions, use demo data for the watershed
  if (interventions.length === 0) {
    interventions = DEMO_INTERVENTIONS.filter(i => i.watershedId === watershedId);
  }

  // For Narmada and other watersheds not directly matching, provide demo data
  if (interventions.length === 0) {
    // Use Narmada demo data with adapted watershed ID for demonstration
    interventions = DEMO_INTERVENTIONS.map(i => ({ ...i, watershedId }));
  }

  return interventions;
}

// ─── PRIORITY FILTER ──────────────────────────────────────────────────────────
export function applyPriorityFilter(candidates, filter) {
  switch (filter) {
    case 'HIGH_PRIORITY':
      return candidates.filter(c => c.priorityScore >= 70);
    case 'EVIDENCE_GAP':
      return candidates.filter(c => ['NO_DATA', 'NEEDS_UPDATE', 'HIGH_PRIORITY'].includes(c.evidenceStatus));
    case 'SATELLITE_ANOMALY':
      return candidates.filter(c => c.waterChange === 'ANOMALY' || (c.ndviChange !== null && Math.abs(c.ndviChange) > 0.1));
    case 'NEEDS_UPDATE':
      return candidates.filter(c => c.evidenceStatus === 'NEEDS_UPDATE' || c.evidenceStatus === 'NO_DATA');
    case 'INCONSISTENT':
      return candidates.filter(c => c.consistency.status === 'INCONSISTENT');
    default:
      return candidates; // ALL
  }
}

// ─── NEAREST-NEIGHBOR ROUTE OPTIMIZATION ─────────────────────────────────────
// Greedy nearest-neighbor from origin, selecting highest-priority candidates first.
// Deterministic and reproducible for same input.
export function buildVerificationRoute(candidates, origin, maxStops, fieldWindowMinutes) {
  if (!candidates.length) return { stops: [], estimatedDistanceKm: 0, estimatedDurationMin: 0 };

  // Sort by priority score desc for initial ordering
  const pool = [...candidates].sort((a, b) => b.priorityScore - a.priorityScore);
  const selected = [];

  let currentLat = origin ? origin.lat : pool[0].lat;
  let currentLng = origin ? origin.lng : pool[0].lng;
  let totalDistM = 0;

  while (selected.length < maxStops && pool.length > 0) {
    // Score = priority score - distance penalty (normalized)
    let bestIdx = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < pool.length; i++) {
      const distM = haversineMeters(currentLat, currentLng, pool[i].lat, pool[i].lng);
      // distance penalty: 1 point per 1km
      const score = pool[i].priorityScore - (distM / 1000);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    const next = pool.splice(bestIdx, 1)[0];
    const distM = haversineMeters(currentLat, currentLng, next.lat, next.lng);
    totalDistM += distM;
    currentLat = next.lat;
    currentLng = next.lng;
    selected.push(next);
  }

  // Add return leg distance
  if (origin && selected.length > 0) {
    const last = selected[selected.length - 1];
    totalDistM += haversineMeters(last.lat, last.lng, origin.lat, origin.lng);
  }

  const estimatedDistanceKm = totalDistM / 1000;

  // Estimated duration: 30km/h driving + 25min field time per stop
  const driveMin = (estimatedDistanceKm / 30) * 60;
  const fieldMin = selected.length * 25;
  const estimatedDurationMin = Math.round(driveMin + fieldMin);

  // Route geometry: straight-line segments (labeled as estimated)
  const geometry = [];
  if (origin) geometry.push([origin.lng, origin.lat]);
  for (const s of selected) geometry.push([s.lng, s.lat]);
  if (origin) geometry.push([origin.lng, origin.lat]);

  const isFeasible = estimatedDurationMin <= fieldWindowMinutes;

  return {
    stops: selected.map((s, i) => ({ ...s, sequence: i + 1 })),
    estimatedDistanceKm: parseFloat(estimatedDistanceKm.toFixed(1)),
    estimatedDurationMin,
    isFeasible,
    routeGeometry: geometry,
    driveDistanceLabel: `~${estimatedDistanceKm.toFixed(1)} km est.`,
    durationLabel: `~${Math.floor(estimatedDurationMin / 60)}h ${estimatedDurationMin % 60}m est.`,
    routingMethod: 'STRAIGHT_LINE_ESTIMATED'
  };
}
