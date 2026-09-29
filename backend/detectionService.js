import { EarthEngineImageryProvider } from './imageryProvider.js';
import { EarthEngineProvider } from './earthEngineProvider.js';

// Supported production detectors
const SUPPORTED_TARGETS = ['water', 'vegetation'];

export const detectionService = {
  async detect(request, updateJob = () => {}) {
    console.log('[Service] Detection request received');
    updateJob('searching_imagery');
    const { targetType, geometry } = request;
    console.log(`[Service] Target: ${targetType}`);
    console.log(`[Service] AOI valid: ${!!geometry}`);

    // Block unsupported targets before any EE call
    if (!SUPPORTED_TARGETS.includes(targetType)) {
      return {
        status: 'error',
        error: 'UNSUPPORTED_TARGET',
        message: `'${targetType}' detection is not yet configured. Currently available: water, vegetation.`
      };
    }

    try {
      // 1. Search imagery
      const sceneData = await EarthEngineImageryProvider.findLatestScene(geometry, 20);
      updateJob('analysing');

      if (!sceneData) {
        return {
          status: 'no_imagery',
          reason: 'No suitable imagery found for this area with acceptable cloud cover.',
          suggestions: ['Try another date', 'Increase date range', 'Allow higher cloud cover']
        };
      }

      console.log(`[Service] Scene: ${sceneData.metadata.sceneId}`);
      console.log(`[Service] Cloud: ${sceneData.metadata.cloudPercentage}%`);

      let resultFeatures;
      let methodInfo;

      // 2. Delegate to specialist workflows
      if (targetType === 'water') {
        const threshold = parseFloat(process.env.WATER_NDWI_THRESHOLD ?? '0');
        methodInfo = { index: 'NDWI', redBand: 'B3', nirBand: 'B8', threshold };
        resultFeatures = await EarthEngineProvider.detectWater(sceneData.image, geometry, threshold, updateJob);
      } else if (targetType === 'vegetation') {
        const threshold = parseFloat(process.env.VEGETATION_NDVI_THRESHOLD ?? '0.3');
        methodInfo = { index: 'NDVI', redBand: 'B4', nirBand: 'B8', threshold };
        resultFeatures = await EarthEngineProvider.detectVegetation(sceneData.image, geometry, threshold, updateJob);
      }

      // 3. Handle zero results
      if (!resultFeatures.features?.length) {
        const stats = resultFeatures.analysis ?? {};
        const hasPixels = (stats.candidatePixels ?? stats.vegetationPixelCount ?? 0) > 0;
        return {
          status: hasPixels ? 'no_detections' : 'no_candidate_pixels',
          message: hasPixels
            ? `Pixels were found above threshold, but they did not form regions large enough to vectorize.`
            : `No pixels exceeded the ${methodInfo.index} threshold (${methodInfo.threshold}) in this AOI.`,
          targetType,
          analysis: stats,
          method: methodInfo,
          dataset: buildDataset(sceneData.metadata),
          acquisition: buildAcquisition(sceneData.metadata),
          graph: resultFeatures.graph ?? null
        };
      }

      updateJob('saving');
      console.log('[Service] Completed. Building response...');

      // 4. Build vegetation-specific summary
      const detectionCount = resultFeatures.features.length;
      const totalAreaKm2 = resultFeatures.totalAreaKm2 ?? 0;

      // Calculate AOI area for coverage %
      let coveragePercent = null;
      try {
        const aoiCoords = geometry.type === 'Polygon' ? geometry.coordinates[0] : null;
        if (aoiCoords) {
          // Rough spherical area of AOI
          const aoiAreaKm2 = resultFeatures.totalAreaKm2; // fallback, will improve
          coveragePercent = null; // Requires EE to compute AOI area accurately
        }
      } catch (_) {}

      const evidenceId = `ev-${Date.now()}`;

      return {
        id: `req-${Date.now()}`,
        status: 'success',
        targetType,
        dataset: buildDataset(sceneData.metadata),
        acquisition: buildAcquisition(sceneData.metadata),
        aoi: geometry,
        analysis: {
          ...(resultFeatures.analysis ?? {}),
          ...methodInfo
        },
        detections: {
          type: 'FeatureCollection',
          features: resultFeatures.features
        },
        summary: {
          detectionCount,
          totalAreaKm2,
          coveragePercent
        },
        graph: resultFeatures.graph ?? null,
        method: methodInfo,
        processing: resultFeatures.processing ?? {},
        evidenceId
      };

    } catch (err) {
      if (err.message === 'REAL PROVIDER UNAVAILABLE') {
        return {
          status: 'error',
          error: 'PROVIDER_UNAVAILABLE',
          message: 'Earth Engine provider not configured. Required env vars: EARTH_ENGINE_PROJECT_ID, EARTH_ENGINE_CLIENT_EMAIL, EARTH_ENGINE_PRIVATE_KEY'
        };
      }
      console.error('[Service] Detection Error:', err);
      return {
        status: 'error',
        error: 'PROCESSING_FAILED',
        message: err.message || 'Unknown processing error'
      };
    }
  }
};

function buildDataset(metadata) {
  return {
    id: metadata.dataset,
    name: 'Sentinel-2 Harmonized',
    sensor: metadata.sensor,
    sceneId: metadata.sceneId,
    resolutionMeters: 10
  };
}

function buildAcquisition(metadata) {
  return {
    timestamp: metadata.acquisitionTime,
    cloudPercentage: metadata.cloudPercentage
  };
}
