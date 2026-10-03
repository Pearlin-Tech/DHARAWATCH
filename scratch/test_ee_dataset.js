import ee from '@google/earthengine';
import { initEE } from '../server-gee.js';

async function test() {
  try {
    await initEE();
    const rivers = ee.FeatureCollection('WWF/HydroSHEDS/v1/FreeFlowingRivers');
    const riversInfo = await new Promise((resolve, reject) => {
      rivers.limit(1).evaluate((info, err) => {
        if (err) reject(err);
        else resolve(info);
      });
    });
    console.log('HydroRIVERS Exists!');
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();
