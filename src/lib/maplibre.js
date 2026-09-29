import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

// Configure the worker URL
if (maplibregl.setWorkerUrl) {
  maplibregl.setWorkerUrl(workerUrl);
}

export default maplibregl;
