import { api } from './api';

/**
 * Service to resolve global watershed context and layers.
 * Designed to connect to the Earth Engine backend.
 */
export const watershedService = {
  /**
   * Resolves a watershed by coordinate or ID.
   */
  async resolveWatershed(params) {
    try {
      const query = new URLSearchParams(params).toString();
      return await api.get(`/watersheds/resolve?${query}`);
    } catch (error) {
      console.warn('Watershed resolution failed (backend may not be available yet):', error);
      return null;
    }
  },

  /**
   * Fetches layer resources (e.g. Earth Engine map IDs/tokens) for the active watershed.
   */
  async getLayerResource(watershedId, layerId, params = {}) {
    try {
      const query = new URLSearchParams(params).toString();
      return await api.get(`/watersheds/${watershedId}/layers/${layerId}?${query}`);
    } catch (error) {
      console.warn(`Layer ${layerId} request failed:`, error);
      return null;
    }
  },

  /**
   * Fetches analytical fingerprint summary.
   */
  async getFingerprint(watershedId) {
    try {
      return await api.get(`/watersheds/${watershedId}/fingerprint`);
    } catch (error) {
      console.warn('Fingerprint request failed:', error);
      return null;
    }
  },

  /**
   * Fetches areas needing attention.
   */
  async getAttentionItems(watershedId) {
    try {
      return await api.get(`/watersheds/${watershedId}/attention`);
    } catch (error) {
      console.warn('Attention items request failed:', error);
      return [];
    }
  }
};
