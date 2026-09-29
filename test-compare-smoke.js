/**
 * Real end-to-end smoke test for the Compare API.
 * Requires the backend server running on http://localhost:3001
 * with valid Earth Engine credentials.
 * 
 * Usage: node test-compare-smoke.js
 */

const API_URL = 'http://localhost:3001';

async function testHealthCheck() {
  console.log('\n=== TEST: Health Check ===');
  const res = await fetch(`${API_URL}/api/compare/health`);
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
  
  console.assert(data.earthEngine.initialized === true, 'EE should be initialized');
  console.assert(data.earthEngine.authenticated === true, 'EE should be authenticated');
  console.assert(data.dataset.accessible === true, 'Dataset should be accessible');
  console.assert(data.testComputation === true, 'Test computation should pass');
  console.log('✅ Health check passed');
}

async function testRealComparison() {
  console.log('\n=== TEST: Real Comparison (Ahmedabad, 2024 vs 2026) ===');
  const res = await fetch(`${API_URL}/api/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      baselineDate: '2024-01-15',
      currentDate: '2026-09-15',
      coords: { lng: 72.5714, lat: 23.0225 },
      bounds: { north: 23.05, south: 22.99, east: 72.61, west: 72.53 },
      indicator: 'generic'
    })
  });
  
  const data = await res.json();
  console.log('Status:', data.status);
  console.log('Request ID:', data.requestId);
  console.log('Execution time:', data.executionTimeMs, 'ms');
  
  if (data.status === 'success') {
    console.log('\n--- Baseline ---');
    console.log('  Requested:', data.baseline.requestedDate);
    console.log('  Actual:', data.baseline.actualDate, `(offset: ${data.baseline.offsetDays}d)`);
    console.log('  Image:', data.baseline.imageId);
    console.log('  Valid pixels:', data.baseline.validPixelPercentage, '%');
    console.log('  Cloud:', data.baseline.cloudPercentage, '%');
    console.log('  Tile URL:', data.baseline.tileUrl ? 'PRESENT' : 'MISSING');
    
    console.log('\n--- Current ---');
    console.log('  Requested:', data.current.requestedDate);
    console.log('  Actual:', data.current.actualDate, `(offset: ${data.current.offsetDays}d)`);
    console.log('  Image:', data.current.imageId);
    console.log('  Valid pixels:', data.current.validPixelPercentage, '%');
    console.log('  Cloud:', data.current.cloudPercentage, '%');
    console.log('  Tile URL:', data.current.tileUrl ? 'PRESENT' : 'MISSING');
    
    console.log('\n--- Analysis ---');
    console.log('  Type:', data.analysis.type);
    console.log('  Method:', data.analysis.method);
    for (const [k, v] of Object.entries(data.analysis)) {
      if (k !== 'type' && k !== 'method') console.log(`  ${k}: ${v}`);
    }
    
    console.log('\n--- Difference Raster ---');
    console.log('  Type:', data.difference.type);
    console.log('  Tile URL:', data.difference.tileUrl ? 'PRESENT' : 'MISSING');
    
    console.log('\n--- Quality ---');
    console.log('  Cloud mask method:', data.quality.cloudMaskMethod);
    console.log('  Baseline valid pixels:', data.quality.baselineValidPixels, '%');
    console.log('  Current valid pixels:', data.quality.currentValidPixels, '%');
    
    // Assertions
    console.assert(data.baseline.imageId !== data.current.imageId, 'Images should be different');
    console.assert(data.baseline.tileUrl.includes('earthengine.googleapis.com'), 'Baseline tile should be from EE');
    console.assert(data.current.tileUrl.includes('earthengine.googleapis.com'), 'Current tile should be from EE');
    console.assert(data.difference.tileUrl.includes('earthengine.googleapis.com'), 'Diff tile should be from EE');
    console.assert(typeof data.analysis.meanSpectralDistance === 'number', 'Mean spectral distance should be a number');
    console.assert(typeof data.analysis.roiAreaKm2 === 'number', 'ROI area should be a number');
    console.assert(typeof data.analysis.affectedAreaKm2 === 'number', 'Affected area should be a number');
    console.assert(data.analysis.roiAreaKm2 > 0, 'ROI area should be positive');
    
    console.log('\n✅ Real comparison test passed — all values from Earth Engine');
  } else {
    console.log('Response:', JSON.stringify(data, null, 2));
    console.log('⚠️ Comparison did not return success. Investigate reason above.');
  }
}

async function testNDVI() {
  console.log('\n=== TEST: NDVI Comparison ===');
  const res = await fetch(`${API_URL}/api/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      baselineDate: '2024-03-01',
      currentDate: '2024-09-01',
      coords: { lng: 72.5714, lat: 23.0225 },
      indicator: 'NDVI'
    })
  });
  
  const data = await res.json();
  console.log('Status:', data.status);
  if (data.status === 'success') {
    console.log('Baseline NDVI:', data.analysis.baselineValue);
    console.log('Current NDVI:', data.analysis.currentValue);
    console.log('Difference:', data.analysis.difference);
    console.log('Changed area:', data.analysis.affectedAreaKm2, 'km²');
    console.assert(typeof data.analysis.baselineValue === 'number', 'Baseline NDVI should be a number');
    console.assert(typeof data.analysis.currentValue === 'number', 'Current NDVI should be a number');
    console.log('✅ NDVI test passed');
  } else {
    console.log('Result:', JSON.stringify(data, null, 2));
  }
}

async function main() {
  try {
    await testHealthCheck();
    await testRealComparison();
    await testNDVI();
    console.log('\n========================================');
    console.log('All smoke tests completed.');
    console.log('========================================\n');
  } catch (e) {
    console.error('Test failed:', e);
    process.exit(1);
  }
}

main();
