export const TARGET_REGISTRY = {
  water: {
    id: 'water',
    label: 'Water',
    available: true,
    supportedDatasets: ['sentinel-2', 'landsat-8', 'sar'],
    resultType: 'Polygon',
    description: 'Detects water bodies, rivers, and lakes using NDWI.',
    color: '#06b6d4',
    fillOpacity: 0.3,
  },
  vegetation: {
    id: 'vegetation',
    label: 'Vegetation',
    available: true,
    supportedDatasets: ['sentinel-2', 'landsat-8'],
    resultType: 'Polygon',
    description: 'Measures vegetation health and coverage using NDVI.',
    color: '#10b981',
    fillOpacity: 0.2,
  },
  buildings: {
    id: 'buildings',
    label: 'Buildings',
    available: false,
    supportedDatasets: ['high-res-optical'],
    resultType: 'Polygon',
    description: 'Coming Soon — Building footprint detection.',
    color: '#3b82f6',
    fillOpacity: 0.2,
  },
  construction: {
    id: 'construction',
    label: 'Construction',
    available: false,
    supportedDatasets: ['sentinel-2', 'high-res-optical'],
    resultType: 'Polygon',
    description: 'Coming Soon — Active construction detection.',
    color: '#f59e0b',
    fillOpacity: 0.25,
  },
  roads: {
    id: 'roads',
    label: 'Roads',
    available: false,
    supportedDatasets: ['high-res-optical', 'sentinel-2'],
    resultType: 'LineString',
    description: 'Coming Soon — Road network extraction.',
    color: '#f97316',
    lineThickness: 3,
  },
  burn: {
    id: 'burn',
    label: 'Burn Areas',
    available: false,
    supportedDatasets: ['sentinel-2', 'landsat-8'],
    resultType: 'Polygon',
    description: 'Coming Soon — Burn scar detection.',
    color: '#ef4444',
    fillOpacity: 0.3,
  },
};

// Simple router to match text to target
export const detectRouter = (query) => {
  if (!query) return null;
  const q = query.toLowerCase();
  
  if (q.includes('water') || q.includes('lake') || q.includes('pond') || q.includes('river')) return 'water';
  if (q.includes('veg') || q.includes('tree') || q.includes('forest') || q.includes('plant')) return 'vegetation';
  if (q.includes('build') || q.includes('house')) return 'buildings';
  if (q.includes('construct') || q.includes('chang')) return 'construction';
  if (q.includes('road') || q.includes('highway') || q.includes('street')) return 'roads';
  if (q.includes('burn') || q.includes('fire')) return 'burn';
  
  return 'unsupported';
};



// Main detection service (Frontend API client)
export const detect = async (request, onStatusUpdate = () => {}) => {
  const { query, targetType, geometry, dataset, date } = request;
  
  let finalTargetType = targetType;
  if (query) {
    const routedType = detectRouter(query);
    if (routedType === 'unsupported') {
      return {
        status: 'error',
        error: 'UNSUPPORTED_TARGET',
        message: 'SATQUERY cannot reliably detect that target type yet. I can currently detect Water, Vegetation, Buildings, Construction, Roads, and Burn Areas.',
      };
    }
    finalTargetType = routedType;
  }
  
  if (!TARGET_REGISTRY[finalTargetType]) {
    return {
      status: 'error',
      error: 'INVALID_TARGET',
      message: 'Invalid target type selected.'
    };
  }

  // Call real API
  try {
    const res = await fetch('/api/detection', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        targetType: finalTargetType,
        geometry,
        dataset,
        date
      })
    });
    
    let data = await res.json();
    
    if (data.status === 'queued') {
      onStatusUpdate(data.status);
      while (['queued', 'searching_imagery', 'analysing', 'vectorising', 'measuring', 'saving'].includes(data.status)) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        const pollRes = await fetch(`/api/detection/${data.id}`);
        data = await pollRes.json();
        onStatusUpdate(data.status);
      }
    }
    
    return data;
  } catch (err) {
    console.error('API call failed:', err);
    return {
      status: 'error',
      error: 'NETWORK_ERROR',
      message: 'Failed to connect to detection backend.'
    };
  }
};
