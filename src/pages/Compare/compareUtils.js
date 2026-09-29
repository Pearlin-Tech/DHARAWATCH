export function calculateNDVI(nir, red) {
  if (nir == null || red == null || isNaN(nir) || isNaN(red)) return NaN;
  if (nir + red === 0) return 0;
  return (nir - red) / (nir + red);
}

export function calculateNDWI(green, nir) {
  if (green == null || nir == null || isNaN(green) || isNaN(nir)) return NaN;
  if (green + nir === 0) return 0;
  return (green - nir) / (green + nir);
}

export function calculateDifference(current, baseline) {
  if (current == null || baseline == null || isNaN(current) || isNaN(baseline)) return NaN;
  return current - baseline;
}

export function calculatePercentageChange(currentArea, baselineArea) {
  if (baselineArea === 0) return undefined;
  if (currentArea == null || baselineArea == null || isNaN(currentArea) || isNaN(baselineArea)) return NaN;
  return ((currentArea - baselineArea) / baselineArea) * 100;
}

export function routeCompareQuery(query) {
  if (!query) return { analysisType: "temporal_comparison", indicator: "unspecified" };
  const lowerQuery = query.toLowerCase();

  if (lowerQuery.includes('vegetation') || lowerQuery.includes('forest') || lowerQuery.includes('farmland')) {
    return { analysisType: "temporal_comparison", indicator: "NDVI" };
  } else if (lowerQuery.includes('water') || lowerQuery.includes('flood')) {
    return { analysisType: "temporal_comparison", indicator: "NDWI" };
  } else {
    return { analysisType: "temporal_comparison", indicator: "unspecified" };
  }
}

export function validateDates(baselineDate, currentDate) {
  if (!baselineDate || !currentDate) {
    return { valid: false, reason: "Invalid date" };
  }
  if (baselineDate === currentDate) {
    return { valid: false, reason: "Baseline and current observations are identical." };
  }
  return { valid: true };
}

/**
 * Finds the best Sentinel-2 observation near the requested date.
 * Enforces a strict valid pixel threshold and maximum temporal window.
 */
export function findTemporalObservation(requestedDate, collection, maxWindowDays = 7, minValidPixels = 50) {
  if (!requestedDate || !collection || collection.length === 0) return null;

  const reqTime = new Date(requestedDate).getTime();
  const msInDay = 24 * 60 * 60 * 1000;

  let bestObs = null;
  let minDiffDays = Infinity;

  for (const obs of collection) {
    if (obs.validPixelPercentage < minValidPixels) continue;

    const obsTime = new Date(obs.actualDate).getTime();
    const diffDays = Math.abs(obsTime - reqTime) / msInDay;

    if (diffDays <= maxWindowDays) {
      if (diffDays < minDiffDays) {
        minDiffDays = diffDays;
        bestObs = obs;
      }
    }
  }

  return bestObs;
}

export function validateActualObservations(baselineObs, currentObs) {
  if (!baselineObs || !currentObs) {
    return { valid: false, reason: "Insufficient valid satellite data for reliable comparison. No reliable satellite observation available for the selected region and dates." };
  }

  if (baselineObs.actualDate === currentObs.actualDate || baselineObs.imageId === currentObs.imageId) {
    return { valid: false, reason: "Baseline and current observations are identical (same acquisition)." };
  }

  return { valid: true };
}

/**
 * Simulates a robust Compare Data Pipeline response formatting.
 */
export function buildCompareResponse(requestedBaseline, requestedCurrent, collection) {
  const baselineObs = findTemporalObservation(requestedBaseline, collection);
  const currentObs = findTemporalObservation(requestedCurrent, collection);

  const validation = validateActualObservations(baselineObs, currentObs);

  if (!validation.valid) {
    return {
      status: "insufficient_data",
      reason: validation.reason,
      baseline: baselineObs ? { requestedDate: requestedBaseline, ...baselineObs } : { requestedDate: requestedBaseline, actualDate: null },
      current: currentObs ? { requestedDate: requestedCurrent, ...currentObs } : { requestedDate: requestedCurrent, actualDate: null }
    };
  }

  return {
    status: "success",
    baseline: {
      requestedDate: requestedBaseline,
      ...baselineObs
    },
    current: {
      requestedDate: requestedCurrent,
      ...currentObs
    },
    analysis: {
      indicator: "NDVI",
      baselineValue: null,
      currentValue: null,
      difference: null,
      affectedArea: null,
      percentageChange: null
    },
    quality: {
      validPixelPercentage: Math.min(baselineObs.validPixelPercentage, currentObs.validPixelPercentage),
      warnings: baselineObs.actualDate !== requestedBaseline || currentObs.actualDate !== requestedCurrent
        ? ["Actual acquisition dates differ from requested dates due to satellite orbit/clouds."]
        : []
    }
  };
}
