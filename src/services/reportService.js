import { api } from './api';

export const reportService = {
  getAll: async () => {
    return await api.get('/reports');
  },
  
  getById: async (id) => {
    return await api.get(`/reports/${id}`);
  },
  
  create: async (report) => {
    return await api.post('/reports', report);
  },
  
  update: async (id, report) => {
    return await api.put(`/reports/${id}`, report);
  },
  
  delete: async (id) => {
    return await api.delete(`/reports/${id}`);
  }
};
