import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_DIR = path.join(path.dirname(__dirname), 'server-data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}
const dbPath = path.join(DB_DIR, 'satquery.sqlite');
const db = new sqlite3.Database(dbPath);

const runQuery = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const insertRow = async (table, id, data) => {
  await runQuery(`INSERT OR REPLACE INTO ${table} (id, data) VALUES (?, ?)`, [id, JSON.stringify(data)]);
};

const now = new Date().toISOString();

const watersheds = [
  {
    id: 'ws-narmada',
    type: 'PUBLIC_SNAPSHOT',
    name: 'Narmada Basin',
    alternateNames: ['Narmada River Basin'],
    river: 'Narmada',
    basin: 'Narmada Basin',
    states: ['Gujarat', 'Madhya Pradesh', 'Maharashtra'],
    areaKm2: 98796,
    centroid: { lat: 22.0, lon: 75.0 },
    majorDams: ['Sardar Sarovar', 'Indira Sagar', 'Omkareshwar', 'Maheshwar'],
    source: 'India-WRIS',
    sourceUrl: 'https://indiawris.gov.in',
    attribution: 'India Water Resources Information System',
    createdAt: now,
    updatedAt: now,
    dataStatus: 'AVAILABLE'
  },
  {
    id: 'ws-ganga',
    type: 'PUBLIC_SNAPSHOT',
    name: 'Ganga Basin',
    alternateNames: ['Ganges Basin'],
    river: 'Ganga',
    basin: 'Ganga Basin',
    states: ['Uttarakhand', 'Uttar Pradesh', 'Bihar', 'West Bengal'],
    areaKm2: 861452,
    centroid: { lat: 26.0, lon: 83.0 },
    majorDams: ['Tehri', 'Farakka'],
    source: 'India-WRIS',
    sourceUrl: 'https://indiawris.gov.in',
    attribution: 'India Water Resources Information System',
    createdAt: now,
    updatedAt: now,
    dataStatus: 'AVAILABLE'
  },
  {
    id: 'ws-krishna',
    type: 'PUBLIC_SNAPSHOT',
    name: 'Krishna Basin',
    river: 'Krishna',
    basin: 'Krishna Basin',
    states: ['Maharashtra', 'Karnataka', 'Telangana', 'Andhra Pradesh'],
    areaKm2: 258948,
    centroid: { lat: 16.0, lon: 77.0 },
    majorDams: ['Nagarjuna Sagar', 'Srisailam', 'Almatti'],
    source: 'India-WRIS',
    sourceUrl: 'https://indiawris.gov.in',
    attribution: 'India Water Resources Information System',
    createdAt: now,
    updatedAt: now,
    dataStatus: 'AVAILABLE'
  },
  {
    id: 'ws-mahanadi',
    type: 'PUBLIC_SNAPSHOT',
    name: 'Mahanadi Basin',
    river: 'Mahanadi',
    basin: 'Mahanadi Basin',
    states: ['Chhattisgarh', 'Odisha'],
    areaKm2: 141589,
    centroid: { lat: 20.5, lon: 83.5 },
    majorDams: ['Hirakud'],
    source: 'India-WRIS',
    sourceUrl: 'https://indiawris.gov.in',
    attribution: 'India Water Resources Information System',
    createdAt: now,
    updatedAt: now,
    dataStatus: 'AVAILABLE'
  },
  { id: 'ws-godavari', type: 'PUBLIC_SNAPSHOT', name: 'Godavari Basin', river: 'Godavari', centroid: { lat: 18.0, lon: 79.0 }, createdAt: now, dataStatus: 'AVAILABLE' },
  { id: 'ws-tapi', type: 'PUBLIC_SNAPSHOT', name: 'Tapi Basin', river: 'Tapi', centroid: { lat: 21.0, lon: 74.5 }, createdAt: now, dataStatus: 'AVAILABLE' },
  { id: 'ws-cauvery', type: 'PUBLIC_SNAPSHOT', name: 'Cauvery Basin', river: 'Cauvery', centroid: { lat: 11.5, lon: 78.0 }, createdAt: now, dataStatus: 'AVAILABLE' },
  { id: 'ws-yamuna', type: 'PUBLIC_SNAPSHOT', name: 'Yamuna Basin', river: 'Yamuna', centroid: { lat: 28.0, lon: 78.0 }, createdAt: now, dataStatus: 'AVAILABLE' },
  { id: 'ws-brahmaputra', type: 'PUBLIC_SNAPSHOT', name: 'Brahmaputra Basin', river: 'Brahmaputra', centroid: { lat: 26.5, lon: 92.0 }, createdAt: now, dataStatus: 'AVAILABLE' },
  { id: 'ws-indus', type: 'PUBLIC_SNAPSHOT', name: 'Indus Basin', river: 'Indus', centroid: { lat: 31.0, lon: 75.0 }, createdAt: now, dataStatus: 'AVAILABLE' }
];

const infrastructure = [
  {
    id: 'inf-sardar-sarovar',
    type: 'PUBLIC_SNAPSHOT',
    featureType: 'DAM',
    name: 'Sardar Sarovar Dam',
    river: 'Narmada',
    basin: 'Narmada Basin',
    state: 'Gujarat',
    district: 'Narmada',
    lat: 21.8322,
    lon: 73.7483,
    damInformation: { height: 163, length: 1210 },
    hydropower: { installedCapacityMw: 1450 },
    source: 'India-WRIS / NWDA',
    sourceUrl: 'https://indiawris.gov.in',
    attribution: 'National Water Development Agency',
    watershedRelationship: 'ws-narmada',
    createdAt: now,
    dataStatus: 'AVAILABLE'
  },
  {
    id: 'inf-hirakud',
    type: 'PUBLIC_SNAPSHOT',
    featureType: 'DAM',
    name: 'Hirakud Dam',
    river: 'Mahanadi',
    state: 'Odisha',
    lat: 21.5283,
    lon: 83.8744,
    source: 'India-WRIS',
    watershedRelationship: 'ws-mahanadi',
    createdAt: now,
    dataStatus: 'AVAILABLE'
  },
  {
    id: 'inf-tehri',
    type: 'PUBLIC_SNAPSHOT',
    featureType: 'DAM',
    name: 'Tehri Dam',
    river: 'Bhagirathi',
    state: 'Uttarakhand',
    lat: 30.3789,
    lon: 78.4797,
    source: 'India-WRIS',
    watershedRelationship: 'ws-ganga',
    createdAt: now,
    dataStatus: 'AVAILABLE'
  },
  {
    id: 'inf-ukai',
    type: 'PUBLIC_SNAPSHOT',
    featureType: 'DAM',
    name: 'Ukai Dam',
    river: 'Tapi',
    state: 'Gujarat',
    lat: 21.2464,
    lon: 73.5930,
    source: 'India-WRIS',
    watershedRelationship: 'ws-tapi',
    createdAt: now,
    dataStatus: 'AVAILABLE'
  },
  {
    id: 'inf-srisailam',
    type: 'PUBLIC_SNAPSHOT',
    featureType: 'DAM',
    name: 'Srisailam Dam',
    river: 'Krishna',
    lat: 16.0825,
    lon: 78.8997,
    source: 'India-WRIS',
    watershedRelationship: 'ws-krishna',
    createdAt: now,
    dataStatus: 'AVAILABLE'
  },
  {
    id: 'inf-nagarjuna-sagar',
    type: 'PUBLIC_SNAPSHOT',
    featureType: 'DAM',
    name: 'Nagarjuna Sagar Dam',
    river: 'Krishna',
    lat: 16.5744,
    lon: 79.3130,
    source: 'India-WRIS',
    watershedRelationship: 'ws-krishna',
    createdAt: now,
    dataStatus: 'AVAILABLE'
  },
  {
    id: 'inf-indira-sagar',
    type: 'PUBLIC_SNAPSHOT',
    featureType: 'DAM',
    name: 'Indira Sagar Dam',
    river: 'Narmada',
    lat: 22.2858,
    lon: 76.4719,
    source: 'India-WRIS',
    watershedRelationship: 'ws-narmada',
    createdAt: now,
    dataStatus: 'AVAILABLE'
  },
  {
    id: 'inf-bhakra',
    type: 'PUBLIC_SNAPSHOT',
    featureType: 'DAM',
    name: 'Bhakra Dam',
    river: 'Sutlej',
    lat: 31.4111,
    lon: 76.3267,
    source: 'India-WRIS',
    createdAt: now,
    dataStatus: 'AVAILABLE'
  },
  {
    id: 'inf-koyna',
    type: 'PUBLIC_SNAPSHOT',
    featureType: 'DAM',
    name: 'Koyna Dam',
    river: 'Koyna',
    lat: 17.3997,
    lon: 73.7483,
    source: 'India-WRIS',
    watershedRelationship: 'ws-krishna',
    createdAt: now,
    dataStatus: 'AVAILABLE'
  }
];

const evidenceGaps = [
  {
    id: 'gap-narmada-1',
    watershedId: 'hybas-4050031610',
    type: 'WATER_CHANGE',
    title: 'Reservoir shoreline expansion',
    description: 'Historical surface-water context (JRC Global Surface Water 1984-2024) indicates unverified changes.',
    location: { lat: 21.84, lng: 73.76 },
    severity: 'MEDIUM',
    priority: 'HIGH',
    status: 'OPEN',
    source: 'JRC GLOBAL SURFACE WATER',
    metadata: { period: '1984-2024', statusText: 'HISTORICAL PUBLIC CONTEXT' },
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'gap-narmada-2',
    watershedId: 'hybas-4050031610',
    type: 'INFRASTRUCTURE_CHANGE',
    title: 'Primary Spillway',
    description: 'Requires field verification for structure status.',
    location: { lat: 21.8322, lng: 73.7483 },
    severity: 'LOW',
    priority: 'MEDIUM',
    status: 'OPEN',
    source: 'PUBLIC FEATURE DATA',
    metadata: { statusText: 'FIELD VERIFICATION' },
    createdAt: now,
    updatedAt: now
  }
];

async function seed() {
  console.log('Seeding database with public data snapshots...');

  const tables = [
    'watersheds', 'infrastructure_features', 'evidence_gaps'
  ];

  for (const table of tables) {
    await runQuery(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, data TEXT)`);
  }

  for (const w of watersheds) {
    await insertRow('watersheds', w.id, w);
  }
  console.log(`Seeded ${watersheds.length} watersheds.`);

  for (const inf of infrastructure) {
    await insertRow('infrastructure_features', inf.id, inf);
  }
  console.log(`Seeded ${infrastructure.length} infrastructure features.`);

  for (const gap of evidenceGaps) {
    await insertRow('evidence_gaps', gap.id, gap);
  }
  console.log(`Seeded ${evidenceGaps.length} evidence gaps.`);

  console.log('Seed process completed successfully.');
  db.close();
}

seed().catch(err => {
  console.error('Seed process failed:', err);
  process.exit(1);
});
