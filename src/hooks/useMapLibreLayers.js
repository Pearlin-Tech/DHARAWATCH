/**
 * DHARAWATCH — MapLibre Layer Management Hook
 * 
 * Provides stable, lifecycle-aware layer management for MapLibre GL.
 * Handles: source/layer creation, updates, removal, ordering, opacity, visibility.
 * Includes debug logging for development.
 */
import { useRef, useCallback, useEffect } from 'react';

export const MAP_LAYER_ORDER = [
  'ws-boundary-line',
  'ws-boundary-fill',
  'ee-layer-drainage',
  'ee-layer-soilMoisture',
  'ee-layer-terrain',
  'ee-layer-dynamicWorld',
  'ee-layer-ndwi',
  'ee-layer-ndvi',
  'ee-layer-sentinel2',
];

export const BASE_LAYER_ID = 'satellite-base';

function isStyleLoaded(map) {
  return map && map.isStyleLoaded();
}

function logDebug(enabled, ...args) {
  if (enabled && process.env.NODE_ENV !== 'production') {
    console.log('[MAP LAYER DEBUG]', new Date().toISOString(), ...args);
  }
}

export function useMapLibreLayers(mapRef, options = {}) {
  const { debug = process.env.NODE_ENV !== 'production' } = options;
  
  const layerStateRef = useRef(new Map()); // layerId -> { sourceId, layerIds, opacity, status, metadata }
  const pendingOpsRef = useRef(new Map()); // layerId -> Promise
  
  // Wait for map style to be loaded before executing
  const waitForStyle = useCallback(async (map) => {
    if (isStyleLoaded(map)) return true;
    
    return new Promise((resolve) => {
      const check = () => {
        if (isStyleLoaded(map)) {
          map.off('style.load', check);
          resolve(true);
        }
      };
      map.on('style.load', check);
      // Fallback timeout
      setTimeout(() => {
        map.off('style.load', check);
        resolve(isStyleLoaded(map));
      }, 5000);
    });
  }, []);

  // Core: ensure source exists
  const ensureSource = useCallback(async (map, sourceId, sourceDef) => {
    if (!map) return false;
    
    await waitForStyle(map);
    
    if (map.getSource(sourceId)) {
      // Update existing source data if needed
      if (sourceDef.data !== undefined) {
        try {
          map.getSource(sourceId).setData(sourceDef.data);
          logDebug(debug, 'SOURCE UPDATED', sourceId);
        } catch (e) {
          logDebug(debug, 'SOURCE UPDATE FAILED', sourceId, e.message);
        }
      }
      return true;
    }
    
    try {
      map.addSource(sourceId, sourceDef);
      logDebug(debug, 'SOURCE CREATED', sourceId, sourceDef);
      return true;
    } catch (e) {
      logDebug(debug, 'SOURCE CREATE FAILED', sourceId, e.message);
      return false;
    }
  }, [debug, waitForStyle]);

  // Core: ensure layer exists with correct ordering
  const ensureLayer = useCallback(async (map, layerId, layerDef, beforeLayerId) => {
    if (!map) return false;
    
    await waitForStyle(map);
    
    if (map.getLayer(layerId)) {
      logDebug(debug, 'LAYER EXISTS', layerId);
      return true;
    }
    
    try {
      const insertBefore = beforeLayerId && map.getLayer(beforeLayerId) ? beforeLayerId : undefined;
      map.addLayer(layerDef, insertBefore);
      logDebug(debug, 'LAYER CREATED', layerId, { before: insertBefore });
      return true;
    } catch (e) {
      logDebug(debug, 'LAYER CREATE FAILED', layerId, e.message);
      return false;
    }
  }, [debug, waitForStyle]);

  // Public: add/update a raster layer from EE tile URL
  const setRasterLayer = useCallback(async (layerId, tileUrl, options = {}) => {
    const map = mapRef.current;
    if (!map || !tileUrl) return false;
    
    const { 
      opacity = 0.8, 
      visible = true, 
      metadata = {},
      minzoom = 0,
      maxzoom = 22,
      tileSize = 256 
    } = options;
    
    const sourceId = `ee-source-${layerId}`;
    const mapLayerId = `ee-layer-${layerId}`;
    
    // Track pending operation to prevent duplicate requests
    if (pendingOpsRef.current.has(layerId)) {
      logDebug(debug, 'OPERATION PENDING', layerId);
      return pendingOpsRef.current.get(layerId);
    }
    
    const op = (async () => {
      try {
        logDebug(debug, 'LAYER REQUEST', { layerId, tileUrl, opacity, visible });
        
        // 1. Ensure source
        const sourceOk = await ensureSource(map, sourceId, {
          type: 'raster',
          tiles: [tileUrl],
          tileSize,
          minzoom,
          maxzoom,
          attribution: metadata.source || 'Earth Engine'
        });
        if (!sourceOk) throw new Error('Source creation failed');
        
        // 2. Ensure layer
        const layerOk = await ensureLayer(map, mapLayerId, {
          id: mapLayerId,
          type: 'raster',
          source: sourceId,
          paint: { 'raster-opacity': visible ? opacity : 0 }
        }, 'ws-boundary-fill'); // Insert above boundary
        
        if (!layerOk) throw new Error('Layer creation failed');
        
        // 3. Set initial visibility via opacity
        if (map.getLayer(mapLayerId)) {
          map.setPaintProperty(mapLayerId, 'raster-opacity', visible ? opacity : 0);
        }
        
        // 4. Update internal state
        layerStateRef.current.set(layerId, {
          sourceId,
          layerIds: [mapLayerId],
          opacity,
          visible,
          status: 'ACTIVE',
          metadata,
          tileUrl
        });
        
        logDebug(debug, 'LAYER ACTIVE', layerId, { opacity, visible });
        return true;
        
      } catch (e) {
        logDebug(debug, 'LAYER ERROR', layerId, e.message);
        layerStateRef.current.set(layerId, {
          status: 'ERROR',
          reason: e.message
        });
        return false;
      } finally {
        pendingOpsRef.current.delete(layerId);
      }
    })();
    
    pendingOpsRef.current.set(layerId, op);
    return op;
  }, [mapRef, debug, ensureSource, ensureLayer]);

  // Public: add/update a vector layer (boundary, drainage)
  const setVectorLayer = useCallback(async (layerId, geojson, options = {}) => {
    const map = mapRef.current;
    if (!map) return false;
    
    const { 
      color = '#38bdf8', 
      lineWidth = 2, 
      fillOpacity = 0.1,
      lineOpacity = 1,
      visible = true,
      metadata = {}
    } = options;
    
    const sourceId = `ws-${layerId}`;
    const fillLayerId = `ws-${layerId}-fill`;
    const lineLayerId = `ws-${layerId}-line`;
    
    try {
      logDebug(debug, 'VECTOR LAYER REQUEST', { layerId, visible });
      
      await waitForStyle(map);
      
      // Ensure source
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, { type: 'geojson', data: geojson || { type: 'FeatureCollection', features: [] } });
        logDebug(debug, 'VECTOR SOURCE CREATED', sourceId);
      } else {
        map.getSource(sourceId).setData(geojson || { type: 'FeatureCollection', features: [] });
      }
      
      // Fill layer
      if (!map.getLayer(fillLayerId)) {
        map.addLayer({
          id: fillLayerId,
          type: 'fill',
          source: sourceId,
          paint: { 
            'fill-color': color, 
            'fill-opacity': visible ? fillOpacity : 0 
          }
        }, 'ws-boundary-fill');
      } else {
        map.setPaintProperty(fillLayerId, 'fill-opacity', visible ? fillOpacity : 0);
      }
      
      // Line layer
      if (!map.getLayer(lineLayerId)) {
        map.addLayer({
          id: lineLayerId,
          type: 'line',
          source: sourceId,
          paint: { 
            'line-color': color, 
            'line-width': lineWidth, 
            'line-opacity': visible ? lineOpacity : 0,
            'line-dasharray': layerId === 'boundary' ? [3, 2] : undefined
          }
        }, 'ws-boundary-fill');
      } else {
        map.setPaintProperty(lineLayerId, 'line-opacity', visible ? lineOpacity : 0);
      }
      
      layerStateRef.current.set(layerId, {
        sourceId,
        layerIds: [fillLayerId, lineLayerId],
        opacity: fillOpacity,
        visible,
        status: 'ACTIVE',
        metadata
      });
      
      logDebug(debug, 'VECTOR LAYER ACTIVE', layerId);
      return true;
      
    } catch (e) {
      logDebug(debug, 'VECTOR LAYER ERROR', layerId, e.message);
      layerStateRef.current.set(layerId, { status: 'ERROR', reason: e.message });
      return false;
    }
  }, [mapRef, debug, waitForStyle]);

  // Public: update layer opacity
  const setLayerOpacity = useCallback((layerId, opacity) => {
    const map = mapRef.current;
    const state = layerStateRef.current.get(layerId);
    if (!map || !state) return false;
    
    state.layerIds.forEach(lid => {
      if (map.getLayer(lid)) {
        try {
          map.setPaintProperty(lid, 'raster-opacity', state.visible ? opacity : 0);
        } catch (e) {
          // Try fill-opacity for vector layers
          map.setPaintProperty(lid, 'fill-opacity', state.visible ? opacity : 0);
        }
      }
    });
    
    state.opacity = opacity;
    layerStateRef.current.set(layerId, state);
    logDebug(debug, 'OPACITY SET', layerId, opacity);
    return true;
  }, [mapRef, debug]);

  // Public: toggle layer visibility
  const setLayerVisibility = useCallback((layerId, visible) => {
    const map = mapRef.current;
    const state = layerStateRef.current.get(layerId);
    if (!map || !state) return false;
    
    state.layerIds.forEach(lid => {
      if (map.getLayer(lid)) {
        try {
          if (state.layerIds.length === 1) {
            // Raster layer
            map.setPaintProperty(lid, 'raster-opacity', visible ? state.opacity : 0);
          } else {
            // Vector layers
            if (lid.includes('-fill')) {
              map.setPaintProperty(lid, 'fill-opacity', visible ? state.opacity : 0);
            } else {
              map.setPaintProperty(lid, 'line-opacity', visible ? 1 : 0);
            }
          }
        } catch (e) {
          logDebug(debug, 'VISIBILITY TOGGLE ERROR', layerId, e.message);
        }
      }
    });
    
    state.visible = visible;
    layerStateRef.current.set(layerId, state);
    logDebug(debug, 'VISIBILITY SET', layerId, visible);
    return true;
  }, [mapRef, debug]);

  // Public: remove layer completely
  const removeLayer = useCallback((layerId) => {
    const map = mapRef.current;
    const state = layerStateRef.current.get(layerId);
    if (!map || !state) return false;
    
    state.layerIds.forEach(lid => {
      if (map.getLayer(lid)) {
        try { map.removeLayer(lid); } catch (_) {}
      }
    });
    
    if (map.getSource(state.sourceId)) {
      try { map.removeSource(state.sourceId); } catch (_) {}
    }
    
    layerStateRef.current.delete(layerId);
    logDebug(debug, 'LAYER REMOVED', layerId);
    return true;
  }, [mapRef, debug]);

  // Public: get layer state for UI
  const getLayerState = useCallback((layerId) => {
    return layerStateRef.current.get(layerId) || { status: 'OFF' };
  }, []);

  // Public: get all layer states
  const getAllLayerStates = useCallback(() => {
    const states = {};
    layerStateRef.current.forEach((v, k) => { states[k] = v; });
    return states;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const map = mapRef.current;
      if (map) {
        layerStateRef.current.forEach((state, layerId) => {
          state.layerIds.forEach(lid => {
            if (map.getLayer(lid)) map.removeLayer(lid);
          });
          if (map.getSource(state.sourceId)) map.removeSource(state.sourceId);
        });
      }
      layerStateRef.current.clear();
      pendingOpsRef.current.clear();
    };
  }, [mapRef]);

  return {
    setRasterLayer,
    setVectorLayer,
    setLayerOpacity,
    setLayerVisibility,
    removeLayer,
    getLayerState,
    getAllLayerStates,
    layerStateRef
  };
}

export default useMapLibreLayers;