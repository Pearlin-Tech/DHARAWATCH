import { useEffect, useRef, useState, useCallback } from 'react';
import { WATERSHED_LAYERS, LAYER_IDS, RASTER_LAYER_IDS } from '../../shared/layerRegistry.js';
import { getLayerTile } from '../../services/watershedClient';

/** Draw order, bottom → top. Boundary vector layers always stay above every raster. */
const ORDER = ['sentinel2', 'terrain', 'dynamicWorld', 'soilMoisture', 'ndvi', 'ndwi', 'ndmi', 'drainage'];
export const BOUNDARY_MAP_LAYERS = ['ws-boundary-fill', 'ws-boundary-line'];

const initialLayers = () => Object.fromEntries(LAYER_IDS.map((id) => {
  const d = WATERSHED_LAYERS[id];
  return [id, { enabled: !!d.defaultVisible, opacity: d.defaultOpacity ?? 0.8, status: 'OFF', meta: null, error: null, tiles: 0, tileErrors: 0 }];
}));

/**
 * Layer pipeline: toggle → state → POST /api/analysis/layers (active context) → EE tile URL →
 * MapLibre raster source + layer with a STABLE id (ws-ndvi, ws-sentinel2 …) → tile events → status.
 *
 * Status: OFF | LOADING | ACTIVE | NO_DATA | ERROR.  ACTIVE is set only after MapLibre reports a
 * tile of that source as loaded, i.e. pixels are actually on the map.
 */
export function useMapLayers(mapRef, mapReady, ctx) {
  const [layers, setLayers] = useState(initialLayers);
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const inflight = useRef({});   // layerId → { ac, key }
  const loadedFor = useRef({});  // layerId → ctx.key currently on the map
  const ctxKey = ctx?.key || null;

  const patch = useCallback((id, p) => setLayers((prev) => ({ ...prev, [id]: { ...prev[id], ...(typeof p === 'function' ? p(prev[id]) : p) } })), []);

  const removeFromMap = useCallback((id) => {
    const m = mapRef.current;
    const mid = WATERSHED_LAYERS[id].mapId;
    if (m?.getStyle()) {
      if (m.getLayer(mid)) m.removeLayer(mid);
      if (m.getSource(mid)) m.removeSource(mid);
    }
    delete loadedFor.current[id];
  }, [mapRef]);

  const addToMap = useCallback((id, url, attribution) => {
    const m = mapRef.current;
    const mid = WATERSHED_LAYERS[id].mapId;
    const src = m.getSource(mid);
    if (src && typeof src.setTiles === 'function') src.setTiles([url]);
    else {
      if (src) removeFromMap(id);
      m.addSource(mid, { type: 'raster', tiles: [url], tileSize: 256, attribution });
      const above = ORDER.slice(ORDER.indexOf(id) + 1).map((l) => WATERSHED_LAYERS[l].mapId).find((l) => m.getLayer(l));
      const beforeId = above || (m.getLayer('ws-boundary-fill') ? 'ws-boundary-fill' : undefined);
      m.addLayer({
        id: mid, type: 'raster', source: mid,
        paint: { 'raster-opacity': layersRef.current[id].opacity, 'raster-fade-duration': 150 }
      }, beforeId);
    }
  }, [mapRef, removeFromMap]);

  // Tile events → truthful ACTIVE / ERROR (registered once the style is ready)
  useEffect(() => {
    const m = mapRef.current;
    if (!mapReady || !m) return undefined;
    const byMapId = Object.fromEntries(RASTER_LAYER_IDS.map((id) => [WATERSHED_LAYERS[id].mapId, id]));
    // ACTIVE only once every tile of the source needed for the current view has loaded
    const onData = (e) => {
      const id = byMapId[e.sourceId];
      if (!id || e.dataType !== 'source' || !e.tile || e.tile.state !== 'loaded') return;
      const complete = m.isSourceLoaded(e.sourceId);
      patch(id, (l) => (l.enabled && (l.status === 'LOADING' || l.status === 'ACTIVE') ? { status: complete ? 'ACTIVE' : 'LOADING', tiles: l.tiles + 1 } : {}));
    };
    const onIdle = () => {
      for (const [mid, id] of Object.entries(byMapId)) {
        if (!m.getSource(mid) || !m.isSourceLoaded(mid)) continue;
        patch(id, (l) => (l.enabled && l.status === 'LOADING' && l.tiles > 0 ? { status: 'ACTIVE' } : {}));
      }
    };
    m.on('idle', onIdle);
    const onError = (e) => {
      const id = byMapId[e.sourceId];
      if (!id) return;
      const msg = e.error?.message || 'Tile request failed';
      patch(id, (l) => (l.tiles > 0 ? { tileErrors: l.tileErrors + 1 } : { status: 'ERROR', error: `Tile error: ${msg}`, tileErrors: l.tileErrors + 1 }));
    };
    m.on('sourcedata', onData);
    m.on('error', onError);
    return () => { m.off('sourcedata', onData); m.off('error', onError); m.off('idle', onIdle); };
  }, [mapRef, mapReady, patch]);

  // Sync: (context, enabled flags) → requests + map layers
  const enabledSig = RASTER_LAYER_IDS.map((id) => (layers[id].enabled ? 1 : 0)).join('');
  useEffect(() => {
    const m = mapRef.current;
    if (!mapReady || !m) return;
    for (const id of RASTER_LAYER_IDS) {
      const enabled = layersRef.current[id].enabled;
      const f = inflight.current[id];
      if (!ctx || !enabled) {
        f?.ac.abort();
        delete inflight.current[id];
        removeFromMap(id);
        if (layersRef.current[id].status !== 'OFF') patch(id, { status: 'OFF', meta: null, error: null, tiles: 0, tileErrors: 0 });
        continue;
      }
      if (loadedFor.current[id] === ctx.key || f?.key === ctx.key) continue;
      // new context (or newly enabled): drop stale imagery, request tiles for THIS context
      f?.ac.abort();
      removeFromMap(id);
      const ac = new AbortController();
      const key = ctx.key;
      inflight.current[id] = { ac, key };
      patch(id, { status: 'LOADING', meta: null, error: null, tiles: 0, tileErrors: 0 });
      getLayerTile(ctx, id, { signal: ac.signal })
        .then((r) => {
          if (ac.signal.aborted) return;
          delete inflight.current[id];
          if (!r.available || !r.tileUrl) {
            patch(id, { status: 'NO_DATA', meta: r, error: r.reason || 'No imagery for this area' });
            return;
          }
          if (!layersRef.current[id].enabled || mapRef.current !== m) return;
          addToMap(id, r.tileUrl, `${WATERSHED_LAYERS[id].source || ''} via Google Earth Engine`);
          loadedFor.current[id] = key;
          patch(id, { meta: r });
        })
        .catch((e) => {
          if (ac.signal.aborted) return;
          delete inflight.current[id];
          patch(id, { status: 'ERROR', error: `${e.code || 'ERROR'}: ${e.message}` });
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxKey, mapReady, enabledSig]);

  // Boundary is a vector layer owned by the page; only its visibility is toggled here.
  useEffect(() => {
    const m = mapRef.current;
    if (!mapReady || !m) return;
    const vis = layers.boundary.enabled ? 'visible' : 'none';
    BOUNDARY_MAP_LAYERS.forEach((l) => m.getLayer(l) && m.setLayoutProperty(l, 'visibility', vis));
    patch('boundary', { status: !ctx ? 'OFF' : layers.boundary.enabled ? 'ACTIVE' : 'OFF' });
  }, [mapRef, mapReady, ctxKey, layers.boundary.enabled, patch]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = useCallback((id) => patch(id, (l) => ({ enabled: !l.enabled })), [patch]);
  const enable = useCallback((id) => patch(id, { enabled: true }), [patch]);

  const setOpacity = useCallback((id, value) => {
    const m = mapRef.current;
    const mid = WATERSHED_LAYERS[id].mapId;
    if (id === 'boundary') {
      if (m?.getLayer('ws-boundary-line')) m.setPaintProperty('ws-boundary-line', 'line-opacity', value);
      if (m?.getLayer('ws-boundary-fill')) m.setPaintProperty('ws-boundary-fill', 'fill-opacity', 0.12 * value);
    } else if (m?.getLayer(mid)) {
      m.setPaintProperty(mid, 'raster-opacity', value);
    }
    patch(id, { opacity: value });
  }, [mapRef, patch]);

  const resetAll = useCallback(() => {
    setLayers((prev) => Object.fromEntries(Object.entries(prev).map(([id, l]) => [id, { ...l, enabled: id === 'boundary', opacity: WATERSHED_LAYERS[id].defaultOpacity ?? 0.8 }])));
    RASTER_LAYER_IDS.forEach((id) => { const mid = WATERSHED_LAYERS[id].mapId; mapRef.current?.getLayer(mid) && mapRef.current.setPaintProperty(mid, 'raster-opacity', WATERSHED_LAYERS[id].defaultOpacity ?? 0.8); });
  }, [mapRef]);

  return { layers, toggle, enable, setOpacity, resetAll };
}
