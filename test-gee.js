import { initEE, getCompareData } from './server-gee.js';

async function test() {
  await initEE();
  const res = await getCompareData('2026-09-10', '2026-09-24', { lng: 72.5714, lat: 23.0225 }); // Ahmedabad
  console.log(JSON.stringify(res, null, 2));
}

test();
