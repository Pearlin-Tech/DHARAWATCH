import { api } from './api';

export const aiService = {
  /**
   * Submit a natural language question to the AI Ask geospatial intelligence pipeline.
   * @param {Object} params
   * @param {string} params.question - Natural language user question
   * @param {Object} params.mapContext - Current map center {lat, lng/lon}, zoom, bounds
   * @param {string} [params.mode] - 'explorer' (default) or 'expert'
   * @param {Object} [params.roi] - Optional ROI polygon or bounding box
   * @param {Object} [params.timeRange] - Optional {start, end} dates
   * @param {Array} [params.history] - Conversation history for follow-ups
   * @param {Object} [params.attachment] - Optional { attachmentId, filename }
   * @param {Object} [params.selectedLocation] - Optional { lat, lon/lng }
   * @param {string} [params.entryPoint] - 'selected_location' | 'floating_map_button' | 'direct_navigation'
   * @param {string} [params.dataset] - 'Sentinel-2' etc.
   */
  ask: async ({ question, mapContext, mode = 'explorer', roi = null, timeRange = null, history = [], attachment = null, selectedLocation = null, entryPoint = 'direct_navigation', dataset = 'Sentinel-2' }) => {
    try {
      const payload = {
        question,
        mode,
        entryPoint,
        selectedLocation: selectedLocation ? {
          lat: selectedLocation.lat,
          lon: selectedLocation.lon ?? selectedLocation.lng
        } : null,
        dataset,
        mapContext: {
          center: {
            lat: selectedLocation?.lat ?? mapContext?.center?.lat ?? 23.0225,
            lon: selectedLocation?.lon ?? selectedLocation?.lng ?? mapContext?.center?.lng ?? mapContext?.center?.lon ?? 72.5714
          },
          zoom: mapContext?.zoom ?? 12,
          bounds: mapContext?.bounds ?? null
        },
        roi,
        timeRange,
        history,
        attachment
      };

      const data = await api.post('/ai/ask', payload);
      return data;
    } catch (error) {
      console.error('aiService.ask error:', error);
      throw error;
    }
  },

  /**
   * Upload a GeoTIFF / TIFF file to the backend raster processing endpoint.
   * @param {File} file
   */
  uploadRaster: async (file) => {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/ai/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(errorData.error || `Upload failed with status ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('aiService.uploadRaster error:', error);
      throw error;
    }
  }
};
