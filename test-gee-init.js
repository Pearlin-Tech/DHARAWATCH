import dotenv from 'dotenv';
import ee from '@google/earthengine';

dotenv.config({ path: '.env.local' });

const clientEmail = process.env.EARTH_ENGINE_CLIENT_EMAIL;
const rawKey = process.env.EARTH_ENGINE_PRIVATE_KEY;
const privateKey = rawKey.replace(/\\n/g, '\n');

ee.data.authenticateViaPrivateKey(
  { client_email: clientEmail, private_key: privateKey },
  () => {
    console.log('Authenticated. Initializing...');
    try {
      ee.initialize(null, null, () => {
        console.log('Initialized! Running query...');
        const aoi = ee.Geometry.Point([73.71, 21.83]).buffer(5000);
        const col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
          .filterBounds(aoi)
          .filterDate('2023-01-01', '2023-01-31');
        col.size().evaluate((size, err) => {
            if (err) console.error('Query error:', err);
            else console.log('Query success! Size:', size);
        });
      }, (err) => {
        console.error('Init error:', err);
      });
    } catch(e) {
      console.error('Exception:', e);
    }
  },
  (err) => {
    console.error('Auth error:', err);
  }
);
