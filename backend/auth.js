import ee from '@google/earthengine';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env.local') });

let eeInitialized = false;

export const initializeEarthEngine = async () => {
  if (eeInitialized) return true;
  
  return new Promise((resolve, reject) => {
    const privateKey = process.env.EARTH_ENGINE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const clientEmail = process.env.EARTH_ENGINE_CLIENT_EMAIL;
    const projectId = process.env.EARTH_ENGINE_PROJECT_ID;

    if (!privateKey || !clientEmail) {
      console.warn('EARTH ENGINE PROVIDER NOT CONFIGURED');
      console.warn('Required: EARTH_ENGINE_PROJECT_ID, EARTH_ENGINE_CLIENT_EMAIL, EARTH_ENGINE_PRIVATE_KEY');
      return resolve(false);
    }

    ee.data.authenticateViaPrivateKey(
      { client_email: clientEmail, private_key: privateKey },
      () => {
        ee.initialize(null, null, () => {
          console.log('Earth Engine initialized successfully.');
          eeInitialized = true;
          resolve(true);
        }, (err) => {
          console.error('Failed to initialize Earth Engine:', err);
          reject(err);
        });
      },
      (err) => {
        console.error('Failed to authenticate with Earth Engine:', err);
        reject(err);
      }
    );
  });
};
