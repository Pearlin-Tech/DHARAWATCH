import http from 'http';

const API_HOST = 'localhost';
const API_PORT = 3001;

function makePostRequest(pathStr, bodyObj) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(bodyObj);
    const req = http.request(
      {
        host: API_HOST,
        port: API_PORT,
        path: pathStr,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ statusCode: res.statusCode, body: data });
          }
        });
      }
    );

    req.on('error', (err) => reject(err));
    req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('STARTING AI COPILOT LOCATION CONTEXT INTEGRATION SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assertTest(name, condition, detail = '') {
    total++;
    if (condition) {
      passed++;
      console.log(`✅ [PASS] TEST ${total}: ${name}`);
      if (detail) console.log(`   └─ ${detail}`);
    } else {
      console.log(`❌ [FAIL] TEST ${total}: ${name}`);
      if (detail) console.log(`   └─ ${detail}`);
    }
  }

  try {
    // TEST 1: Entry point "selected_location" with coordinates
    const locationContextPayload = {
      question: 'What changed here?',
      mode: 'explorer',
      entryPoint: 'selected_location',
      selectedLocation: { lat: 23.0103, lon: 72.6155 },
      mapContext: {
        center: { lat: 23.0103, lon: 72.6155 },
        zoom: 13,
        bounds: { north: 23.05, south: 22.95, east: 72.65, west: 72.55 }
      },
      dataset: 'Sentinel-2',
      selectedDate: '24 Sep 2026'
    };

    const res1 = await makePostRequest('/api/ai/ask', locationContextPayload);
    assertTest(
      'Selected Location Entry Point (POST /api/ai/ask)',
      res1.statusCode === 200 && res1.body.status === 'VERIFIED',
      `Title: "${res1.body.title}" | Lat: ${res1.body.location?.lat}, Lon: ${res1.body.location?.lon}`
    );

    // TEST 2: Entry point "floating_map_button"
    const floatingPayload = {
      question: 'Find water expansion',
      mode: 'expert',
      entryPoint: 'floating_map_button',
      mapContext: {
        center: { lat: 18.5204, lon: 73.8567 },
        zoom: 14
      }
    };

    const res2 = await makePostRequest('/api/ai/ask', floatingPayload);
    assertTest(
      'Floating Map Button Entry Point (Expert Mode)',
      res2.statusCode === 200 && res2.body.expert && res2.body.expert.metrics,
      `Technical Finding: "${res2.body.expert.technicalFinding.substring(0, 50)}..."`
    );

    // TEST 3: Context Switch (Location B)
    const contextSwitchPayload = {
      question: 'Check vegetation health',
      mode: 'explorer',
      entryPoint: 'selected_location',
      selectedLocation: { lat: 28.6139, lon: 77.2090 },
      mapContext: {
        center: { lat: 28.6139, lon: 77.2090 },
        zoom: 12
      }
    };

    const res3 = await makePostRequest('/api/ai/ask', contextSwitchPayload);
    assertTest(
      'Location Context Switch (Location B: 28.6139° N, 77.2090° E)',
      res3.statusCode === 200 && res3.body.location?.lat === 28.6139,
      `Location B Lat: ${res3.body.location?.lat}, Lon: ${res3.body.location?.lon}`
    );

    // TEST 4: Follow-up question preserving location context
    const followUpPayload = {
      question: 'How much changed?',
      mode: 'explorer',
      entryPoint: 'selected_location',
      selectedLocation: { lat: 28.6139, lon: 77.2090 },
      mapContext: { center: { lat: 28.6139, lon: 77.2090 }, zoom: 12 },
      history: [{ question: 'Check vegetation health', result: res3.body }]
    };

    const res4 = await makePostRequest('/api/ai/ask', followUpPayload);
    assertTest(
      'Follow-up Question Preserving Context',
      res4.statusCode === 200 && res4.body.status === 'VERIFIED',
      `AnalysisType: ${res4.body.analysisType}`
    );

  } catch (err) {
    console.error('Test execution error:', err);
  }

  console.log('\n====================================================');
  console.log(`FINAL RESULTS: ${passed} PASSED | ${total - passed} FAILED out of ${total}`);
  console.log('====================================================');

  process.exit(total - passed === 0 ? 0 : 1);
}

runTests();
