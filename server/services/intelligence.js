/**
 * DHARAWATCH — Intelligence Service
 * 
 * Aggregates data across observations, missions, evidence gaps,
 * satellite changes, and watershed context into a unified intelligence view.
 * 
 * All data comes from the same SQLite database - no mock data.
 */

// Database helpers will be injected via setDbHelpers
let dbGetAllRows = null;
let dbGetRow = null;

function setDbHelpers(getAll, getOne) {
  dbGetAllRows = getAll;
  dbGetRow = getOne;
}

export async function getIntelligenceOverview(filters = {}) {
  if (!dbGetAllRows) {
    // Import from server.js
    const serverModule = await import('../server.js');
    dbGetAllRows = serverModule.getAllRows;
    dbGetRow = serverModule.getRow;
  }

  const { watershedId, dateFrom, dateTo, region, eventType } = filters;

  try {
    // Get all data from database tables
    const [
      observations,
      missions,
      evidence,
      evidenceGaps,
      aiQueries,
      watches,
      fieldObservations,
      analyses,
      analysisResults
    ] = await Promise.all([
      dbGetAllRows('evidence'),
      dbGetAllRows('missions'),
      dbGetAllRows('evidence'),
      dbGetAllRows('evidence_gaps').catch(() => []),
      dbGetAllRows('ai_queries'),
      dbGetAllRows('watches'),
      dbGetAllRows('field_observations'),
      dbGetAllRows('analyses'),
      dbGetAllRows('analysis_results')
    ]);

    // Filter by date range if provided
    const dateFilter = (item) => {
      if (!item.createdAt && !item.timestamp && !item.generatedAt) return true;
      const itemDate = new Date(item.createdAt || item.timestamp || item.generatedAt);
      if (dateFrom && itemDate < new Date(dateFrom)) return false;
      if (dateTo && itemDate > new Date(dateTo)) return false;
      return true;
    };

    // Filter by watershed if provided
    const watershedFilter = (item) => {
      if (!watershedId) return true;
      return item.watershedId === watershedId || 
             item.target?.id === watershedId ||
             item.targetWatershed === watershedId;
    };

    const filteredObservations = observations.filter(o => dateFilter(o) && watershedFilter(o));
    const filteredMissions = missions.filter(m => dateFilter(m) && watershedFilter(m));
    const filteredEvidence = evidence.filter(e => dateFilter(e) && watershedFilter(e));
    const filteredFieldObs = fieldObservations.filter(f => dateFilter(f) && watershedFilter(f));
    const filteredAnalyses = analyses.filter(a => dateFilter(a) && watershedFilter(a));
    const filteredResults = analysisResults.filter(r => dateFilter(r) && watershedFilter(r));
    const filteredWatches = watches.filter(w => dateFilter(w) && watershedFilter(w));

    // Build intelligence events from all sources
    const intelligenceEvents = [];

    // Field observations as events
    for (const obs of filteredFieldObs) {
      intelligenceEvents.push({
        id: obs.id,
        type: 'NEW_OBSERVATION',
        location: obs.location,
        watershedId: obs.watershedId,
        severity: obs.aiAnalysis?.data?.hazards?.present ? 'HIGH' : 'INFO',
        confidence: obs.aiAnalysis?.status === 'COMPLETE' ? 0.9 : 0.5,
        source: 'FIELD_OBSERVATION',
        relatedObservationId: obs.id,
        timestamp: obs.createdAt,
        status: obs.status,
        summary: obs.synthesis || obs.aiAnalysis?.data?.observationSummary || 'Field observation recorded'
      });
    }

    // Evidence records as events
    for (const ev of filteredEvidence) {
      intelligenceEvents.push({
        id: ev.id,
        type: 'EVIDENCE_CREATED',
        location: ev.coordinates,
        watershedId: ev.watershedId,
        severity: 'INFO',
        confidence: 1.0,
        source: 'EVIDENCE_PASSPORT',
        relatedObservationId: ev.observationId,
        timestamp: ev.createdAt,
        status: 'VERIFIED',
        summary: `Evidence created for observation ${ev.observationId}`
      });
    }

    // Missions as events
    for (const mission of filteredMissions) {
      intelligenceEvents.push({
        id: mission.id,
        type: mission.status === 'IN_PROGRESS' ? 'MISSION_IN_PROGRESS' : 
            mission.status === 'COMPLETED' ? 'MISSION_COMPLETED' : 'MISSION_CREATED',
        location: mission.target?.center,
        watershedId: mission.target?.id,
        severity: mission.summary?.isFeasible === false ? 'WARNING' : 'INFO',
        confidence: mission.summary?.confidence ? mission.summary.confidence / 100 : 0.8,
        source: 'MISSION_PLANNER',
        relatedMissionId: mission.id,
        timestamp: mission.timestamps?.generatedAt || mission.createdAt,
        status: mission.status,
        summary: `Mission ${mission.status.toLowerCase()} for ${mission.target?.name}`
      });
    }

    // AI Queries as events
    for (const query of aiQueries) {
      intelligenceEvents.push({
        id: query.id,
        type: 'SATELLITE_ANALYSIS',
        location: query.location,
        watershedId: null,
        severity: query.status === 'VERIFIED' ? 'INFO' : 'WARNING',
        confidence: 0.85,
        source: 'SATELLITE_INTELLIGENCE',
        relatedObservationId: null,
        timestamp: query.timestamp,
        status: query.status,
        summary: query.summary || `AI Analysis: ${query.analysisType}`
      });
    }

    // Watches as events
    for (const watch of filteredWatches) {
      if (watch.alert) {
        intelligenceEvents.push({
          id: watch.id,
          type: 'EVIDENCE_GAP',
          location: { lat: watch.lat, lng: watch.lng },
          watershedId: watch.watershedId,
          severity: 'HIGH',
          confidence: 0.9,
          source: 'WATCH_ALERT',
          relatedObservationId: null,
          timestamp: watch.lastChecked || watch.createdAt,
          status: watch.status,
          summary: `Watch alert: ${watch.condition} threshold breached`
        });
      }
    }

    // Analyses as events
    for (const analysis of filteredAnalyses) {
      intelligenceEvents.push({
        id: analysis.id,
        type: 'SATELLITE_CHANGE',
        location: analysis.geometry ? getGeometryCentroid(analysis.geometry) : null,
        watershedId: null,
        severity: analysis.status === 'completed' ? 'INFO' : 'WARNING',
        confidence: 0.9,
        source: 'SATELLITE_CHANGE_DETECTION',
        relatedObservationId: null,
        timestamp: analysis.createdAt,
        status: analysis.status,
        summary: `Analysis: ${analysis.targetType} - ${analysis.status}`
      });
    }

    // Analysis results as anomaly events
    for (const result of filteredResults) {
      if (result.detections && result.detections.features?.length > 0) {
        intelligenceEvents.push({
          id: result.id,
          type: 'WATER_CHANGE', // Could be VEGETATION_CHANGE, EROSION, INFRASTRUCTURE_CHANGE based on targetType
          location: result.aoi ? getGeometryCentroid(result.aoi) : null,
          watershedId: null,
          severity: 'INFO',
          confidence: 0.85,
          source: 'SATELLITE_ANOMALY',
          relatedObservationId: null,
          timestamp: result.createdAt,
          status: 'DETECTED',
          summary: `Detected ${result.detections.features.length} ${result.targetType} regions`
        });
      }
    }

    // Sort events by timestamp (newest first)
    intelligenceEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Compute watershed metrics
    const watershedMetrics = {};
    for (const obs of filteredFieldObs) {
      const wsId = obs.watershedId || 'unknown';
      if (!watershedMetrics[wsId]) {
        watershedMetrics[wsId] = { observations: 0, evidence: 0, gaps: 0, lastActivity: null };
      }
      watershedMetrics[wsId].observations++;
      watershedMetrics[wsId].lastActivity = obs.createdAt;
    }
    for (const ev of filteredEvidence) {
      const wsId = ev.watershedId || 'unknown';
      if (!watershedMetrics[wsId]) {
        watershedMetrics[wsId] = { observations: 0, evidence: 0, gaps: 0, lastActivity: null };
      }
      watershedMetrics[wsId].evidence++;
    }

    // Compute active gaps (from missions with isFeasible false or evidence gaps table)
    const activeGaps = [];
    for (const mission of filteredMissions) {
      if (mission.summary && mission.summary.isFeasible === false) {
        activeGaps.push({
          id: `gap-${mission.id}`,
          type: 'TIME_WINDOW_INFEASIBLE',
          missionId: mission.id,
          watershedId: mission.target?.id,
          reason: 'Mission exceeds time window',
          severity: 'HIGH',
          timestamp: mission.timestamps?.generatedAt
        });
      }
    }

    // Recent satellite anomalies (from analysis_results with detections)
    const satelliteAnomalies = filteredResults
      .filter(r => r.detections && r.detections.features?.length > 0)
      .map(r => ({
        id: r.id,
        type: r.targetType === 'water' ? 'WATER_CHANGE' : 
            r.targetType === 'vegetation' ? 'VEGETATION_CHANGE' : 
            r.targetType === 'construction' ? 'INFRASTRUCTURE_CHANGE' : 'SURFACE_ANOMALY',
        count: r.detections.features.length,
        totalAreaKm2: r.summary?.totalAreaKm2 || 0,
        location: r.aoi ? getGeometryCentroid(r.aoi) : null,
        timestamp: r.createdAt,
        severity: r.detections.features.length > 5 ? 'HIGH' : 'INFO'
      }));

    return {
      summary: {
        totalObservations: filteredFieldObs.length,
        totalEvidence: filteredEvidence.length,
        totalMissions: filteredMissions.length,
        activeMissions: filteredMissions.filter(m => m.status === 'IN_PROGRESS').length,
        completedMissions: filteredMissions.filter(m => m.status === 'COMPLETED').length,
        totalWatches: filteredWatches.length,
        activeWatches: filteredWatches.filter(w => w.status === 'Active').length,
        totalAnalyses: filteredAnalyses.length,
        totalAnomalies: satelliteAnomalies.length,
        activeGaps: activeGaps.length,
        intelligenceEvents: intelligenceEvents.length
      },
      events: intelligenceEvents.slice(0, 50), // Limit to 50 most recent
      watershedMetrics,
      satelliteAnomalies,
      activeGaps,
      recentActivity: intelligenceEvents.slice(0, 10),
      generatedAt: new Date().toISOString()
    };

  } catch (err) {
    console.error('[Intelligence] Overview error:', err.message);
    return {
      summary: {
        totalObservations: 0,
        totalEvidence: 0,
        totalMissions: 0,
        activeMissions: 0,
        completedMissions: 0,
        totalWatches: 0,
        activeWatches: 0,
        totalAnalyses: 0,
        totalAnomalies: 0,
        activeGaps: 0,
        intelligenceEvents: 0
      },
      events: [],
      watershedMetrics: {},
      satelliteAnomalies: [],
      activeGaps: [],
      recentActivity: [],
      error: err.message,
      generatedAt: new Date().toISOString()
    };
  }
}

function getGeometryCentroid(geometry) {
  if (!geometry) return null;
  try {
    if (geometry.type === 'Polygon') {
      const ring = geometry.coordinates[0];
      const lons = ring.map(c => c[0]);
      const lats = ring.map(c => c[1]);
      return {
        lon: lons.reduce((a, b) => a + b, 0) / lons.length,
        lat: lats.reduce((a, b) => a + b, 0) / lats.length
      };
    }
    if (geometry.type === 'Point') {
      return { lon: geometry.coordinates[0], lat: geometry.coordinates[1] };
    }
  } catch (_) {}
  return null;
}

export async function getIntelligenceEvents(filters = {}) {
  const overview = await getIntelligenceOverview(filters);
  return overview.events;
}

export async function getIntelligenceAnomalies(filters = {}) {
  const overview = await getIntelligenceOverview(filters);
  return overview.satelliteAnomalies;
}

export async function getIntelligenceActivity(filters = {}) {
  const overview = await getIntelligenceOverview(filters);
  return overview.recentActivity;
}

export { setDbHelpers };