import { GoogleAuth } from 'google-auth-library';
import fs from 'fs';

async function getEarthEngineToken() {
  const auth = new GoogleAuth({
    keyFile: './ee-key.json',
    scopes: ['https://www.googleapis.com/auth/earthengine']
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  console.log('Earth Engine Access Token:', token.token);
  return token.token;
}

getEarthEngineToken().catch(console.error);
