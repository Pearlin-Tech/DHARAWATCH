import { api } from './api';

export const evidenceService = {
  getAll: async () => {
    return await api.get('/evidence');
  },
  
  getById: async (id) => {
    return await api.get(`/evidence/${id}`);
  },
  
  create: async (evidence) => {
    return await api.post('/evidence', evidence);
  }
};
