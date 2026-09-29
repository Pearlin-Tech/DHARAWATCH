import ee from '@google/earthengine';

// MIN_CONNECTED_PIXELS: minimum connected pixels to consider a region valid
// At 10m Sentinel-2 resolution: 25 pixels = ~2500 m² = 0.0025 km²
const MIN_CONNECTED_PIXELS = process.env.MIN_CONNECTED_PIXELS ? parseInt(process.env.MIN_CONNECTED_PIXELS) : 25;

// NDVI threshold for vegetation classification
const VEGETATION_NDVI_THRESHOLD = process.env.VEGETATION_NDVI_THRESHOLD ? parseFloat(process.env.VEGETATION_NDVI_THRESHOLD) : 0.3;

// Minimum detection area in m² to include in results
const MIN_DETECTION_AREA_M2 = process.env.MIN_DETECTION_AREA_M2 ? parseInt(process.env.MIN_DETECTION_AREA_M2) : 10000; // 0.01 km²

export const EarthEngineProvider = {

  // ─── Water Detection (NDWI) ──────────────────────────────────────────────
  async detectWater(image, aoiGeometry, threshold = 0, updateJob = () => {}) {
    return new Promise((resolve, reject) => {
      try {
        console.log('[EE] Running NDWI...');
        const aoi = ee.Geometry(aoiGeometry);
        const clipped = image.clip(aoi);

        // NDWI = (Green - NIR) / (Green + NIR) = (B3 - B8) / (B3 + B8)
        const ndwi = clipped.normalizedDifference(['B3', 'B8']).rename('ndwi');

        // Diagnostic stats
        const stats = ndwi.reduceRegion({
          reducer: ee.Reducer.minMax().combine({ reducer2: ee.Reducer.mean(), sharedInputs: true }),
          geometry: aoi,
          scale: 10,
          maxPixels: 1e9,
          bestEffort: true
        });

        // Mask: NDWI > threshold → morphological cleanup → connected-component filter
        const rawMask = ndwi.gt(threshold);
        const cleanMask = rawMask.focalMin(1).focalMax(1);
        const connectedCount = cleanMask.connectedPixelCount(MIN_CONNECTED_PIXELS + 1, false);
        const waterMask = cleanMask.updateMask(connectedCount.gte(MIN_CONNECTED_PIXELS));
        const waterOnly = waterMask.selfMask();

        // Candidate count after cleanup
        const candidateCount = waterMask.reduceRegion({
          reducer: ee.Reducer.sum(),
          geometry: aoi,
          scale: 10,
          maxPixels: 1e9,
          bestEffort: true
        }).get('ndwi');

        console.log('[EE] Vectorizing water mask...');
        updateJob('vectorising');

        const vectors = waterOnly.reduceToVectors({
          geometry: aoi,
          crs: image.select('B3').projection(),
          scale: 10,
          geometryType: 'polygon',
          eightConnected: false,
          maxPixels: 1e9,
          bestEffort: true,
          tileScale: 4
        });

        const vectorsWithArea = vectors.map((feature) => {
          const area = feature.geometry().area(1);
          const areaKm2 = ee.Number(area).divide(1e6);
          return feature.set('areaM2', area).set('areaKm2', areaKm2).set('score', 0.9);
        });

        // Evaluate stats first, then vectors
        stats.evaluate((statsObj) => {
          candidateCount.evaluate((cCount) => {
            const analysis = {
              index: 'NDWI',
              threshold,
              min: statsObj?.['ndwi_min'] ?? null,
              max: statsObj?.['ndwi_max'] ?? null,
              mean: statsObj?.['ndwi_mean'] ?? null,
              candidatePixels: typeof cCount === 'number' ? Math.round(cCount) : 0
            };
            console.log('[EE] NDWI Stats:', analysis);

            vectorsWithArea.evaluate((featureCollection) => {
              if (!featureCollection?.features?.length) {
                console.log('[EE] Vectorization complete. Found 0 polygons.');
                resolve({ type: 'FeatureCollection', features: [], totalAreaKm2: 0, analysis });
                return;
              }

              updateJob('measuring');
              const rawCount = featureCollection.features.length;
              console.log(`[EE] Vectorization complete. Found ${rawCount} raw polygons.`);

              let sumArea = 0;
              const finalFeatures = featureCollection.features
                .filter(f => (f.properties?.areaM2 ?? 0) >= MIN_DETECTION_AREA_M2)
                .map((f, idx) => {
                  const id = Date.now() + idx;
                  const aKm2 = typeof f.properties?.areaKm2 === 'number' ? f.properties.areaKm2 : 0;
                  sumArea += aKm2;
                  return {
                    ...f,
                    id,
                    properties: {
                      ...f.properties,
                      id,
                      areaM2: f.properties?.areaM2 ?? 0,
                      areaKm2: aKm2,
                      area: aKm2,
                      meanIndex: null,
                      label: `Water Body ${String(idx + 1).padStart(2, '0')}`,
                      status: 'Confirmed',
                      targetType: 'water'
                    }
                  };
                });

              console.log(`[EE] After min-area filter: ${finalFeatures.length} polygons (${sumArea.toFixed(3)} km²).`);
              resolve({
                type: 'FeatureCollection',
                features: finalFeatures,
                totalAreaKm2: sumArea,
                analysis,
                processing: { rawFeatureCount: rawCount, finalFeatureCount: finalFeatures.length }
              });
            });
          });
        });

      } catch (err) {
        reject(err);
      }
    });
  },

  // ─── Vegetation Detection (NDVI) ─────────────────────────────────────────
  async detectVegetation(image, aoiGeometry, threshold = VEGETATION_NDVI_THRESHOLD, updateJob = () => {}) {
    return new Promise((resolve, reject) => {
      try {
        console.log('[EE] Running NDVI...');
        const aoi = ee.Geometry(aoiGeometry);
        const clipped = image.clip(aoi);

        // NDVI = (B8 - B4) / (B8 + B4)
        const ndvi = clipped.normalizedDifference(['B8', 'B4']).rename('ndvi');

        // Comprehensive statistics: min, max, mean, percentiles
        const stats = ndvi.reduceRegion({
          reducer: ee.Reducer.minMax()
            .combine({ reducer2: ee.Reducer.mean(), sharedInputs: true })
            .combine({ reducer2: ee.Reducer.percentile([25, 50, 75]), sharedInputs: true })
            .combine({ reducer2: ee.Reducer.count(), sharedInputs: true }),
          geometry: aoi,
          scale: 10,
          maxPixels: 1e9,
          bestEffort: true
        });

        // Histogram for NDVI distribution graph (20 bins from -1 to 1)
        const histogram = ndvi.reduceRegion({
          reducer: ee.Reducer.fixedHistogram(-1, 1, 20),
          geometry: aoi,
          scale: 10,
          maxPixels: 1e9,
          bestEffort: true
        });

        // Vegetation mask: NDVI > threshold → morphological cleanup → connected-component filter
        const rawVegMask = ndvi.gt(threshold);
        const cleanMask = rawVegMask.focalMin(1).focalMax(1);
        const connectedCount = cleanMask.connectedPixelCount(MIN_CONNECTED_PIXELS + 1, false);
        const vegMask = cleanMask.updateMask(connectedCount.gte(MIN_CONNECTED_PIXELS));
        const vegOnly = vegMask.selfMask();

        // Count vegetation pixels
        const vegPixelCount = vegMask.reduceRegion({
          reducer: ee.Reducer.sum(),
          geometry: aoi,
          scale: 10,
          maxPixels: 1e9,
          bestEffort: true
        }).get('ndvi');

        console.log('[EE] Vectorizing vegetation mask...');
        updateJob('vectorising');

        const vectors = vegOnly.reduceToVectors({
          geometry: aoi,
          crs: image.select('B8').projection(),
          scale: 10,
          geometryType: 'polygon',
          eightConnected: false,
          maxPixels: 1e9,
          bestEffort: true,
          tileScale: 4
        });

        const vectorsWithArea = vectors.map((feature) => {
          const area = feature.geometry().area(1);
          const areaKm2 = ee.Number(area).divide(1e6);
          // Per-polygon mean NDVI
          const meanNdvi = ndvi.reduceRegion({
            reducer: ee.Reducer.mean(),
            geometry: feature.geometry(),
            scale: 10,
            maxPixels: 1e8
          }).get('ndvi');
          return feature
            .set('areaM2', area)
            .set('areaKm2', areaKm2)
            .set('meanNDVI', meanNdvi);
        });

        // Evaluate all three computations
        stats.evaluate((statsObj) => {
          histogram.evaluate((histObj) => {
            vegPixelCount.evaluate((vegCount) => {
              vectorsWithArea.evaluate((featureCollection) => {
                const validPixels = statsObj?.['ndwi_count'] ?? statsObj?.['ndvi_count'] ?? null;

                // Build histogram bins from EE fixedHistogram output
                // fixedHistogram returns [[bucketMin, count], ...]
                const histBins = [];
                const rawHist = histObj?.['ndvi'];
                if (Array.isArray(rawHist)) {
                  rawHist.forEach(([rangeStart, pixelCount]) => {
                    histBins.push({
                      rangeStart: parseFloat(rangeStart.toFixed(2)),
                      rangeEnd: parseFloat((rangeStart + 0.1).toFixed(2)),
                      pixelCount: Math.round(pixelCount)
                    });
                  });
                }

                const analysis = {
                  index: 'NDVI',
                  redBand: 'B4',
                  nirBand: 'B8',
                  threshold,
                  min: statsObj?.['ndvi_min'] ?? null,
                  max: statsObj?.['ndvi_max'] ?? null,
                  mean: statsObj?.['ndvi_mean'] ?? null,
                  median: statsObj?.['ndvi_p50'] ?? null,
                  percentile25: statsObj?.['ndvi_p25'] ?? null,
                  percentile75: statsObj?.['ndvi_p75'] ?? null,
                  validPixelCount: validPixels,
                  vegetationPixelCount: typeof vegCount === 'number' ? Math.round(vegCount) : 0
                };

                const graph = {
                  type: 'ndvi_distribution',
                  bins: histBins
                };

                console.log('[EE] NDVI Stats:', analysis);

                if (!featureCollection?.features?.length) {
                  console.log('[EE] Vectorization complete. Found 0 vegetation polygons.');
                  resolve({ type: 'FeatureCollection', features: [], totalAreaKm2: 0, analysis, graph });
                  return;
                }

                updateJob('measuring');
                const rawCount = featureCollection.features.length;
                console.log(`[EE] Vectorization complete. Found ${rawCount} raw vegetation polygons.`);

                let sumArea = 0;
                const finalFeatures = featureCollection.features
                  .filter(f => (f.properties?.areaM2 ?? 0) >= MIN_DETECTION_AREA_M2)
                  .map((f, idx) => {
                    const id = Date.now() + idx;
                    const aKm2 = typeof f.properties?.areaKm2 === 'number' ? f.properties.areaKm2 : 0;
                    const meanNDVI = typeof f.properties?.meanNDVI === 'number' ? f.properties.meanNDVI : null;
                    sumArea += aKm2;
                    return {
                      ...f,
                      id,
                      properties: {
                        ...f.properties,
                        id,
                        areaM2: f.properties?.areaM2 ?? 0,
                        areaKm2: aKm2,
                        area: aKm2,
                        meanNDVI,
                        label: `Vegetation Region ${String(idx + 1).padStart(2, '0')}`,
                        status: 'Confirmed',
                        targetType: 'vegetation'
                      }
                    };
                  });

                console.log(`[EE] After min-area filter: ${finalFeatures.length} vegetation polygons (${sumArea.toFixed(3)} km²).`);
                resolve({
                  type: 'FeatureCollection',
                  features: finalFeatures,
                  totalAreaKm2: sumArea,
                  analysis,
                  graph,
                  processing: { rawFeatureCount: rawCount, finalFeatureCount: finalFeatures.length }
                });
              });
            });
          });
        });

      } catch (err) {
        reject(err);
      }
    });
  }
};
