import { api } from './api';

export const settingsService = {
  get: async () => {
    try {
      const data = await api.get('/settings');
      // If server returns empty object {}, provide defaults
      if (Object.keys(data).length === 0) {
        return {
          autoFetchHighRes: true,
          elevationContour: false,
          surfaceAlerts: true,
          passPredictions: true,
          auditLogs: true,
          lowBandwidth: false,
          highContrast: false,
          monoFont: true,
          theme: 'Dark (Default)',
          accent: 'Electric Cyan'
        };
      }
      return data;
    } catch (error) {
      console.warn("Failed to load settings from server, using fallback.", error);
      return null; // Let the UI handle defaults
    }
  },
  
  update: async (settings) => {
    return await api.post('/settings', settings);
  }
};
