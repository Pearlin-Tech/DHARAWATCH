/**
 * Intent Parser for SATQUERY AI
 * Classifies user questions into one of 10 supported geospatial intents,
 * handles follow-up question routing, and blocks prompt injection.
 */

export const INTENT_TYPES = {
  CHANGE_DETECTION: 'CHANGE_DETECTION',
  WATER_ANALYSIS: 'WATER_ANALYSIS',
  VEGETATION_ANALYSIS: 'VEGETATION_ANALYSIS',
  INFRASTRUCTURE_ANALYSIS: 'INFRASTRUCTURE_ANALYSIS',
  TEMPORAL_COMPARISON: 'TEMPORAL_COMPARISON',
  LOCATION_QUERY: 'LOCATION_QUERY',
  MEASUREMENT: 'MEASUREMENT',
  DATA_AVAILABILITY: 'DATA_AVAILABILITY',
  GENERAL_GEOSPATIAL_HELP: 'GENERAL_GEOSPATIAL_HELP',
  RASTER_UPLOAD_ANALYSIS: 'RASTER_UPLOAD_ANALYSIS',
  UNSUPPORTED: 'UNSUPPORTED'
};

export function parseIntent(question = '', history = []) {
  const q = question.toLowerCase().trim();

  if (!q) {
    return {
      intent: INTENT_TYPES.UNSUPPORTED,
      confidence: 0,
      reason: 'Empty question provided'
    };
  }

  // Safety & prompt injection check
  if (q.includes('ignore all') || q.includes('system prompt') || q.includes('pretend you are') || q.includes('override evidence')) {
    return {
      intent: INTENT_TYPES.UNSUPPORTED,
      confidence: 1.0,
      isPromptInjection: true,
      reason: 'Safety policy violation: System prompt or evidence override attempt detected.'
    };
  }

  // Follow-up question routing
  if (history.length > 0) {
    const lastTurn = history[history.length - 1];

    if (q.includes('was it construction') || q.includes('was it building') || q.includes('is it built up') || q.includes('was it built-up')) {
      return { intent: INTENT_TYPES.INFRASTRUCTURE_ANALYSIS, confidence: 0.95, isFollowUp: true };
    }
    if (q.includes('was it water') || q.includes('was it flood') || q.includes('is it water')) {
      return { intent: INTENT_TYPES.WATER_ANALYSIS, confidence: 0.95, isFollowUp: true };
    }
    if (q.includes('was vegetation affected') || q.includes('was it trees') || q.includes('is it vegetation') || q.includes('deforestation')) {
      return { intent: INTENT_TYPES.VEGETATION_ANALYSIS, confidence: 0.95, isFollowUp: true };
    }
    if (q.includes('how much') || q.includes('how big') || q.includes('what percent')) {
      return { intent: lastTurn.analysisType || INTENT_TYPES.MEASUREMENT, confidence: 0.90, isFollowUp: true };
    }
    if (q.includes('where') || q.includes('show me where')) {
      return { intent: lastTurn.analysisType || INTENT_TYPES.LOCATION_QUERY, confidence: 0.90, isFollowUp: true };
    }
    if (q.includes('what satellite') || q.includes('which satellite') || q.includes('what data')) {
      return { intent: INTENT_TYPES.DATA_AVAILABILITY, confidence: 0.95, isFollowUp: true };
    }
  }

  // 1. GENERAL_GEOSPATIAL_HELP & CONCEPTUAL EXPLANATIONS
  if (
    q.includes('how does') ||
    q.includes('what is ndvi') ||
    q.includes('what is ndwi') ||
    q.includes('what is ndbi') ||
    q.includes('explain') ||
    q.includes('how to use') ||
    q.includes('documentation') ||
    q.includes('why are you confident') ||
    q.includes('help me understand')
  ) {
    return { intent: INTENT_TYPES.GENERAL_GEOSPATIAL_HELP, confidence: 0.90 };
  }

  // 2. INFRASTRUCTURE_ANALYSIS (Specific questions about construction/buildings)
  if (
    q.includes('infrastructure') ||
    q.includes('building') ||
    q.includes('construction') ||
    q.includes('built-up') ||
    q.includes('ndbi') ||
    q.includes('road') ||
    q.includes('structure') ||
    q.includes('settlement') ||
    q.includes('was it construction')
  ) {
    return { intent: INTENT_TYPES.INFRASTRUCTURE_ANALYSIS, confidence: 0.95 };
  }

  // 3. WATER_ANALYSIS
  if (
    q.includes('water') ||
    q.includes('ndwi') ||
    q.includes('flood') ||
    q.includes('lake') ||
    q.includes('river') ||
    q.includes('reservoir') ||
    q.includes('ocean') ||
    q.includes('sea level') ||
    q.includes('wetland')
  ) {
    return { intent: INTENT_TYPES.WATER_ANALYSIS, confidence: 0.95 };
  }

  // 4. VEGETATION_ANALYSIS
  if (
    q.includes('vegetation') ||
    q.includes('ndvi') ||
    q.includes('forest') ||
    q.includes('deforestation') ||
    q.includes('tree') ||
    q.includes('crop') ||
    q.includes('agriculture') ||
    q.includes('canopy') ||
    q.includes('greenery')
  ) {
    return { intent: INTENT_TYPES.VEGETATION_ANALYSIS, confidence: 0.95 };
  }

  // 5. TEMPORAL_COMPARISON
  if (
    q.includes('compare') ||
    q.includes('difference between') ||
    q.includes('before and after') ||
    q.includes('versus') ||
    q.includes('vs') ||
    q.includes('last month') ||
    q.includes('previous year')
  ) {
    return { intent: INTENT_TYPES.TEMPORAL_COMPARISON, confidence: 0.90 };
  }

  // 6. LOCATION_QUERY
  if (
    q.includes('what is this location') ||
    q.includes('coordinates') ||
    q.includes('where am i') ||
    q.includes('what location') ||
    q.includes('what area am i') ||
    q.includes('latitude') ||
    q.includes('longitude')
  ) {
    return { intent: INTENT_TYPES.LOCATION_QUERY, confidence: 0.90 };
  }

  // 7. MEASUREMENT
  if (
    q.includes('measure') ||
    q.includes('distance') ||
    q.includes('area size') ||
    q.includes('how big') ||
    q.includes('surface area') ||
    q.includes('square kilometers') ||
    q.includes('km2') ||
    q.includes('hectares')
  ) {
    return { intent: INTENT_TYPES.MEASUREMENT, confidence: 0.90 };
  }

  // 8. DATA_AVAILABILITY
  if (
    q.includes('what satellite data did you use') ||
    q.includes('imagery available') ||
    q.includes('satellite data') ||
    q.includes('sensor pass') ||
    q.includes('cloud cover') ||
    q.includes('resolution') ||
    q.includes('available imagery') ||
    q.includes('sentinel') ||
    q.includes('landsat')
  ) {
    return { intent: INTENT_TYPES.DATA_AVAILABILITY, confidence: 0.90 };
  }

  // 9. CHANGE_DETECTION (Default for "what changed here?", "where did the change happen?", "how much changed?")
  if (
    q.includes('what changed') ||
    q.includes('where did the change') ||
    q.includes('how much changed') ||
    q.includes('show changes') ||
    q.includes('change here') ||
    q.includes('any changes') ||
    q.includes('shift in') ||
    q.includes('anomaly') ||
    q.includes('altered')
  ) {
    return { intent: INTENT_TYPES.CHANGE_DETECTION, confidence: 0.95 };
  }

  if (q.includes('here') || q.includes('map') || q.includes('this area') || q.includes('region')) {
    return { intent: INTENT_TYPES.CHANGE_DETECTION, confidence: 0.70 };
  }

  return {
    intent: INTENT_TYPES.UNSUPPORTED,
    confidence: 0.30,
    reason: 'Question falls outside supported geospatial intelligence queries'
  };
}
