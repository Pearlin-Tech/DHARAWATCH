import ee from '@google/earthengine';
import { initializeEarthEngine } from './auth.js';

export const EarthEngineImageryProvider = {
  async findLatestScene(aoiGeometry, maxCloudCover = 20) {
    const isReady = await initializeEarthEngine();
    if (!isReady) throw new Error('REAL PROVIDER UNAVAILABLE');

    return new Promise((resolve, reject) => {
      try {
        console.log('Searching imagery...');
        
        // Convert GeoJSON geometry to EE geometry
        const aoi = ee.Geometry(aoiGeometry);

        // Define the collection
        const collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
          .filterBounds(aoi)
          .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', maxCloudCover))
          .sort('system:time_start', false); // Descending (latest first)

        // Get the first image
        const image = collection.first();

        // Check if image exists
        ee.Algorithms.If(
          collection.size().gt(0),
          image.id(),
          ee.String('NONE')
        ).evaluate((id) => {
          if (id === 'NONE' || !id) {
             resolve(null);
             return;
          }

          // We have an image, let's get its metadata
          image.toDictionary().evaluate((metadata) => {
            console.log(`Scene selected: ${id}`);
            
            const timeStart = metadata['system:time_start'] || metadata['DATATAKE_1_DATETIME'];
            let acqTime = new Date().toISOString();
            if (timeStart) {
              const dt = new Date(Number(timeStart) || timeStart);
              if (!isNaN(dt.getTime())) acqTime = dt.toISOString();
            }
            
            console.log(`Acquisition: ${acqTime}`);
            const cloudPct = metadata['CLOUDY_PIXEL_PERCENTAGE'] || 0;
            console.log(`Cloud: ${cloudPct}%`);
            
            resolve({
              image: image,
              metadata: {
                sceneId: id,
                dataset: 'COPERNICUS/S2_SR_HARMONIZED',
                sensor: 'Sentinel-2 L2A',
                acquisitionTime: acqTime,
                cloudPercentage: cloudPct,
                resolution: '10m'
              }
            });
          });
        });
      } catch (err) {
        reject(err);
      }
    });
  }
};
