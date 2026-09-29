import http from 'http';
import fs from 'fs';
import path from 'path';

const API_HOST = 'localhost';
const API_PORT = 3001;

// Helper to make HTTP POST requests
function makePostRequest(pathStr, headers, bodyBuffer) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: API_HOST,
        port: API_PORT,
        path: pathStr,
        method: 'POST',
        headers
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
    if (bodyBuffer) req.write(bodyBuffer);
    req.end();
  });
}

// Create mock GeoTIFF buffer (Header with TIFF magic 0x4949 42)
function createMockGeoTiffBuffer() {
  const buf = Buffer.alloc(1024);
  // TIFF Magic 0x4949 (Little Endian 'II'), version 42
  buf.write('II', 0);
  buf.writeUInt16LE(42, 2);
  buf.writeUInt32LE(8, 4); // First IFD offset

  // Write mock IFD tags
  buf.writeUInt16LE(5, 8); // 5 tags
  
  // Tag 1: ImageWidth (256)
  buf.writeUInt16LE(256, 10); // Tag 0x0100
  buf.writeUInt16LE(3, 12);   // SHORT
  buf.writeUInt32LE(1, 14);   // Count 1
  buf.writeUInt32LE(512, 18); // Value 512

  // Tag 2: ImageLength (256)
  buf.writeUInt16LE(257, 22); // Tag 0x0101
  buf.writeUInt16LE(3, 24);   // SHORT
  buf.writeUInt32LE(1, 26);   // Count 1
  buf.writeUInt32LE(512, 30); // Value 512

  // Tag 3: BitsPerSample
  buf.writeUInt16LE(258, 34);
  buf.writeUInt16LE(3, 36);
  buf.writeUInt32LE(1, 38);
  buf.writeUInt32LE(8, 42);

  // Tag 4: SamplesPerPixel (4)
  buf.writeUInt16LE(277, 46);
  buf.writeUInt16LE(3, 48);
  buf.writeUInt32LE(1, 50);
  buf.writeUInt32LE(4, 54);

  return buf;
}

async function runTests() {
  console.log('====================================================');
  console.log('STARTING GEOTIFF RASTER UPLOAD & ANALYSIS TEST SUITE');
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
    // TEST 1: Valid GeoTIFF Upload
    const mockTiff = createMockGeoTiffBuffer();
    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    
    let body = `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="file"; filename="sentinel2_water_roi.tif"\r\n`;
    body += `Content-Type: image/tiff\r\n\r\n`;

    const bodyBuffer = Buffer.concat([
      Buffer.from(body, 'utf-8'),
      mockTiff,
      Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8')
    ]);

    const uploadRes = await makePostRequest(
      '/api/ai/upload',
      {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': bodyBuffer.length
      },
      bodyBuffer
    );

    assertTest(
      'Valid GeoTIFF Upload Endpoint (POST /api/ai/upload)',
      uploadRes.statusCode === 201 && uploadRes.body.status === 'READY',
      `Attachment ID: ${uploadRes.body.attachmentId} | FileType: ${uploadRes.body.fileType}`
    );

    const attachmentId = uploadRes.body.attachmentId;

    // TEST 2: Reject Invalid File Format (.png)
    let badBody = `--${boundary}\r\n`;
    badBody += `Content-Disposition: form-data; name="file"; filename="photo.png"\r\n`;
    badBody += `Content-Type: image/png\r\n\r\nFake PNG Data\r\n--${boundary}--\r\n`;

    const badUploadRes = await makePostRequest(
      '/api/ai/upload',
      {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': Buffer.byteLength(badBody)
      },
      Buffer.from(badBody)
    );

    assertTest(
      'Reject Non-TIFF Upload (.png format)',
      badUploadRes.statusCode === 400 && badUploadRes.body.error?.includes('Unsupported file format'),
      `StatusCode: ${badUploadRes.statusCode} | Error: "${badUploadRes.body.error}"`
    );

    // TEST 3: AI Ask with Attachment Payload
    const askPayload = JSON.stringify({
      question: 'Analyze this uploaded satellite raster',
      mode: 'explorer',
      mapContext: { center: { lat: 23.0225, lon: 72.5714 }, zoom: 13 },
      attachment: { attachmentId, filename: 'sentinel2_water_roi.tif' }
    });

    const askRes = await makePostRequest(
      '/api/ai/ask',
      {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(askPayload)
      },
      Buffer.from(askPayload)
    );

    assertTest(
      'AI Ask Pipeline with GeoTIFF Attachment',
      askRes.statusCode === 200 && askRes.body.analysisType === 'RASTER_UPLOAD_ANALYSIS',
      `Title: "${askRes.body.title}" | Status: ${askRes.body.status}`
    );

    // TEST 4: Explorer Mode Output for Raster
    assertTest(
      'Explorer Mode Dual-View Output for GeoTIFF',
      askRes.body.explorer && askRes.body.explorer.howMuch && askRes.body.explorer.learnMore,
      `Summary: "${askRes.body.explorer.summary.substring(0, 60)}..."`
    );

    // TEST 5: Expert Mode Output for Raster
    assertTest(
      'Expert Mode Technical Analysis for GeoTIFF',
      askRes.body.expert && askRes.body.expert.metrics && askRes.body.expert.methodology,
      `Technical Finding: "${askRes.body.expert.technicalFinding.substring(0, 60)}..."`
    );

    // TEST 6: Backward Compatibility (AI Ask without Attachment)
    const normalAskPayload = JSON.stringify({
      question: 'What changed here over the last 14 days?',
      mode: 'explorer',
      mapContext: { center: { lat: 23.0225, lon: 72.5714 }, zoom: 13 }
    });

    const normalAskRes = await makePostRequest(
      '/api/ai/ask',
      {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(normalAskPayload)
      },
      Buffer.from(normalAskPayload)
    );

    assertTest(
      'Backward Compatibility (AI Ask without Attachment)',
      normalAskRes.statusCode === 200 && normalAskRes.body.status === 'VERIFIED',
      `AnalysisType: ${normalAskRes.body.analysisType}`
    );

  } catch (err) {
    console.error('Test suite execution error:', err);
  }

  console.log('\n====================================================');
  console.log(`FINAL RESULTS: ${passed} PASSED | ${total - passed} FAILED out of ${total}`);
  console.log('====================================================');

  process.exit(total - passed === 0 ? 0 : 1);
}

runTests();
