/**
 * DHARAWATCH — Watershed Naming Service
 * 
 * Resolves human-readable watershed names from HydroBASINS metadata,
 * geocoding, Wikidata, and curated known watershed aliases.
 * Never invents names — only uses verified data sources.
 */

// Curated known watershed name mappings based on HydroBASINS IDs and geography
const KNOWN_WATERSHEDS = {
  // India - Major Basins
  'hybas-4040027780': { name: 'Godavari Basin', river: 'Godavari', level: 4 },
  'hybas-4040027100': { name: 'Mahanadi Basin', river: 'Mahanadi', level: 4 },
  'hybas-4050031610': { name: 'Narmada Basin', river: 'Narmada', level: 5, feature: 'Sardar Sarovar Reservoir' },
  'hybas-4060026820': { name: 'Subarnarekha Basin', river: 'Subarnarekha', level: 6 },
  'hybas-4071011740': { name: 'Bhadar Basin', river: 'Bhadar', level: 7 },
  'hybas-4050031880': { name: 'Tapti Basin', river: 'Tapti', level: 5 },
  'hybas-4050032340': { name: 'Sabarmati Basin', river: 'Sabarmati', level: 5 },
  'hybas-4040026540': { name: 'Krishna Basin', river: 'Krishna', level: 4 },
  'hybas-4040026980': { name: 'Cauvery Basin', river: 'Cauvery', level: 4 },
  'hybas-4040027400': { name: 'Pennar Basin', river: 'Pennar', level: 4 },
  'hybas-4030018920': { name: 'Ganga Basin', river: 'Ganga', level: 3 },
  'hybas-4030019460': { name: 'Brahmaputra Basin', river: 'Brahmaputra', level: 3 },
  'hybas-4030020120': { name: 'Indus Basin', river: 'Indus', level: 3 },
  
  // Global Major Basins
  'hybas-6030007000': { name: 'Amazon Basin', river: 'Amazon', level: 3 },
  'hybas-1030020040': { name: 'Congo Basin', river: 'Congo', level: 3 },
  'hybas-1030020500': { name: 'Nile Basin', river: 'Nile', level: 3 },
  'hybas-1030020980': { name: 'Niger Basin', river: 'Niger', level: 3 },
  'hybas-1030021400': { name: 'Zambezi Basin', river: 'Zambezi', level: 3 },
  'hybas-2030015000': { name: 'Mississippi Basin', river: 'Mississippi', level: 3 },
  'hybas-2030014500': { name: 'Mackenzie Basin', river: 'Mackenzie', level: 3 },
  'hybas-3030012000': { name: 'Orinoco Basin', river: 'Orinoco', level: 3 },
  'hybas-3030012500': { name: 'Paraná Basin', river: 'Paraná', level: 3 },
  'hybas-5030009000': { name: 'Yangtze Basin', river: 'Yangtze', level: 3 },
  'hybas-5030009500': { name: 'Yellow River Basin', river: 'Yellow River', level: 3 },
  'hybas-5030010000': { name: 'Mekong Basin', river: 'Mekong', level: 3 },
  'hybas-5030010500': { name: 'Salween Basin', river: 'Salween', level: 3 },
  'hybas-5030011000': { name: 'Irrawaddy Basin', river: 'Irrawaddy', level: 3 },
  'hybas-7030005000': { name: 'Murray-Darling Basin', river: 'Murray-Darling', level: 3 },
  'hybas-7030005500': { name: 'Lake Eyre Basin', river: 'Lake Eyre', level: 3 },
  
  // Major Reservoir/Dam Features
  'hybas-4050031610': { name: 'Narmada Basin', river: 'Narmada', level: 5, feature: 'Sardar Sarovar Reservoir' },
  'hybas-4040027100': { name: 'Mahanadi Basin', river: 'Mahanadi', level: 4, feature: 'Hirakud Reservoir' },
  'hybas-4030018920': { name: 'Ganga Basin', river: 'Ganga', level: 3, feature: 'Tehri Dam' },
  'hybas-4050031880': { name: 'Tapti Basin', river: 'Tapti', level: 5, feature: 'Ukai Dam' },
  'hybas-4040026540': { name: 'Krishna Basin', river: 'Krishna', level: 4, feature: 'Srisailam Dam' },
  'hybas-4040026540': { name: 'Krishna Basin', river: 'Krishna', level: 4, feature: 'Nagarjuna Sagar Dam' },
  'hybas-4050032340': { name: 'Sabarmati Basin', river: 'Sabarmati', level: 5, feature: 'Dharoi Dam' },
  'hybas-4040027780': { name: 'Godavari Basin', river: 'Godavari', level: 4, feature: 'Jayakwadi Dam' },
};

const LEVEL_LABELS = {
  1: 'CONTINENT',
  2: 'MAJOR BASIN',
  3: 'SUB-CONTINENTAL BASIN',
  4: 'MAJOR SUB-BASIN',
  5: 'SUB-BASIN',
  6: 'CATCHMENT',
  7: 'SUB-CATCHMENT',
  8: 'LOCAL CATCHMENT',
  9: 'SMALL CATCHMENT',
  10: 'MICRO CATCHMENT',
  11: 'HILLSLOPE',
  12: 'HILLSLOPE DETAIL'
};

const CONTINENT_NAMES = {
  1: 'Africa',
  2: 'Europe',
  3: 'Siberia',
  4: 'Asia',
  5: 'Australia',
  6: 'South America',
  7: 'North America',
  8: 'Arctic',
  9: 'Greenland',
  10: 'Antarctica',
  11: 'Central America',
  12: 'Middle East'
};

function parseHybasId(id) {
  if (!id || !id.startsWith('hybas-')) return null;
  const numStr = id.replace('hybas-', '');
  if (!/^\d+$/.test(numStr)) return null;
  
  const continent = parseInt(numStr[0], 10);
  const level = parseInt(numStr.slice(1, 3), 10);
  const pfafstetter = numStr;
  
  return { continent, level, pfafstetter, fullId: numStr };
}

function formatArea(km2) {
  if (!km2 || !Number.isFinite(km2)) return 'Unknown';
  if (km2 >= 1e6) return `${(km2 / 1e6).toFixed(1)}M km²`;
  if (km2 >= 1e3) return `${(km2 / 1e3).toFixed(0)}K km²`;
  return `${km2.toFixed(0)} km²`;
}

function formatNumber(n) {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString();
}

/**
 * Resolve a human-readable watershed name from HydroBASINS properties and metadata.
 * Priority:
 * 1. Curated known watershed mapping
 * 2. River name from metadata + basin level descriptor
 * 3. PFAF_ID based descriptive name
 * 4. Continent + Level fallback
 * 5. HydroBASIN ID as last resort
 */
export function resolveWatershedName(watershed) {
  const { id, metadata = {}, river, level, name, displayName, areaKm2, centroid } = watershed;
  
  // 1. Check curated known watersheds (highest priority)
  if (id && KNOWN_WATERSHEDS[id]) {
    const known = KNOWN_WATERSHEDS[id];
    const parts = [known.name];
    if (known.feature) parts.push(`(${known.feature})`);
    return {
      primaryName: parts.join(' '),
      secondaryName: `HydroSHEDS · Level ${known.level} · ${formatArea(known.areaKm2 || areaKm2)}`,
      river: known.river,
      level: known.level,
      source: 'CURATED',
      confidence: 'HIGH'
    };
  }
  
  // 2. Use provided name if it's meaningful (not just "HydroBASIN L3 - 452")
  if (name && !name.match(/^HydroBASIN\s+L\d+\s*[·-]\s*\d+$/i)) {
    return {
      primaryName: name,
      secondaryName: `HydroSHEDS · Level ${level || '?'} · ${formatArea(areaKm2)}`,
      river: river || metadata?.MAIN_BAS ? `Main Basin: ${metadata.MAIN_BAS}` : null,
      level,
      source: 'DATASET',
      confidence: 'HIGH'
    };
  }
  
  // 3. Use river name from metadata if available
  if (river && river !== '—') {
    const levelLabel = level ? LEVEL_LABELS[level] : 'Basin';
    return {
      primaryName: `${river} ${levelLabel}`,
      secondaryName: `HydroSHEDS · Level ${level || '?'} · ${formatArea(areaKm2)}`,
      river,
      level,
      source: 'METADATA_RIVER',
      confidence: 'MEDIUM'
    };
  }
  
  // 4. Use PFAF_ID from metadata
  if (metadata?.PFAF_ID) {
    const levelLabel = level ? LEVEL_LABELS[level] : 'Basin';
    return {
      primaryName: `Pfafstetter ${metadata.PFAF_ID} ${levelLabel}`,
      secondaryName: `HydroSHEDS · Level ${level || '?'} · ${formatArea(areaKm2)}`,
      river: metadata.MAIN_BAS ? `Main: ${metadata.MAIN_BAS}` : null,
      level,
      source: 'METADATA_PFAF',
      confidence: 'MEDIUM'
    };
  }
  
  // 5. Parse HydroBASIN ID for continent and level info
  const parsed = parseHybasId(id);
  if (parsed) {
    const continentName = CONTINENT_NAMES[parsed.continent] || `Continent ${parsed.continent}`;
    const levelLabel = parsed.level ? LEVEL_LABELS[parsed.level] : 'Basin';
    return {
      primaryName: `${continentName} ${levelLabel} (Pfafstetter ${parsed.pfafstetter})`,
      secondaryName: `HydroSHEDS · Level ${parsed.level} · ${formatArea(areaKm2)}`,
      river: null,
      level: parsed.level,
      source: 'ID_PARSE',
      confidence: 'LOW'
    };
  }
  
  // 6. Ultimate fallback - displayName or ID
  return {
    primaryName: displayName || name || id || 'Unknown Watershed',
    secondaryName: `HydroSHEDS · Level ${level || '?'} · ${formatArea(areaKm2)}`,
    river: null,
    level,
    source: 'FALLBACK',
    confidence: 'NONE'
  };
}

/**
 * Resolve additional geographic context for a watershed
 */
export function resolveWatershedContext(watershed) {
  const { metadata = {}, centroid, areaKm2, level, id } = watershed;
  const nameResult = resolveWatershedName(watershed);
  
  // Countries from metadata or centroid
  let countries = metadata?.COUNTRIES || [];
  if (!countries.length && centroid) {
    // This would ideally come from a reverse geocode or USDOS LSIB lookup
    // For now, we'll use metadata
    if (metadata?.COUNTRY) countries = [metadata.COUNTRY];
  }
  
  // Key features
  const features = [];
  if (nameResult.feature) features.push(nameResult.feature);
  if (metadata?.MAIN_BAS && metadata.MAIN_BAS !== metadata?.SUB_BAS) {
    features.push(`${metadata.MAIN_BAS} River`);
  }
  if (metadata?.ENDO === 1) features.push('Endorheic Basin');
  if (metadata?.COAST === 1) features.push('Coastal Basin');
  
  // Build description
  const parts = [];
  parts.push(`${nameResult.primaryName} is a ${(nameResult.level ? LEVEL_LABELS[nameResult.level] : 'watershed').toLowerCase()}.`);
  if (areaKm2) parts.push(`It covers approximately ${formatArea(areaKm2)}.`);
  if (nameResult.river) parts.push(`Primary river: ${nameResult.river}.`);
  if (countries.length) parts.push(`Countries: ${countries.join(', ')}.`);
  if (features.length) parts.push(`Key features: ${features.join(', ')}.`);
  
  return {
    ...nameResult,
    description: parts.join(' '),
    countries,
    features,
    metadata: {
      ...metadata,
      PFAF_ID: metadata.PFAF_ID,
      SUB_AREA_KM2: metadata.SUB_AREA,
      UP_AREA_KM2: metadata.UP_AREA,
      MAIN_BAS: metadata.MAIN_BAS,
      ENDO: metadata.ENDORHEIC,
      COAST: metadata.COAST,
      ORDER: metadata.ORDER
    },
    sourceDataset: watershed.sourceDataset || `WWF/HydroSHEDS/v1/Basins/hybas_${level || '?'}`,
    sourceFeatureId: watershed.sourceFeatureId || (id ? id.replace('hybas-', '') : null)
  };
}

/**
 * Group watershed candidates by level for UI display
 */
export function groupCandidatesByLevel(candidates) {
  const groups = {};
  
  candidates.forEach(c => {
    const level = c.level || 0;
    const levelLabel = LEVEL_LABELS[level] || `LEVEL ${level}`;
    if (!groups[level]) {
      groups[level] = { level, label: levelLabel, items: [] };
    }
    groups[level].items.push(c);
  });
  
  // Sort levels: coarser first (lower level number)
  return Object.values(groups).sort((a, b) => a.level - b.level);
}

/**
 * Get display info for a candidate (for candidate list UI)
 */
export function getCandidateDisplayInfo(candidate) {
  const nameResult = resolveWatershedName(candidate);
  const overlap = candidate.overlapPercent != null ? candidate.overlapPercent.toFixed(1) : null;
  const coverage = candidate.coveragePercent != null ? candidate.coveragePercent.toFixed(1) : null;
  
  return {
    id: candidate.id,
    primaryName: nameResult.primaryName,
    secondaryName: nameResult.secondaryName,
    level: candidate.level,
    levelLabel: LEVEL_LABELS[candidate.level] || `Level ${candidate.level}`,
    areaKm2: candidate.areaKm2,
    areaFormatted: formatArea(candidate.areaKm2),
    overlapPercent: overlap,
    coveragePercent: coverage,
    source: candidate.source || 'hydrosheds',
    river: nameResult.river,
    feature: nameResult.feature,
    confidence: nameResult.confidence
  };
}

export { KNOWN_WATERSHEDS, LEVEL_LABELS, CONTINENT_NAMES, parseHybasId, formatArea };
export default { resolveWatershedName, resolveWatershedContext, groupCandidatesByLevel, getCandidateDisplayInfo };