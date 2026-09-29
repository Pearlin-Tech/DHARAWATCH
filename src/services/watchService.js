import { api } from './api';

export const watchService = {
  getAll: async () => {
    return await api.get('/watches');
  },
  
  getById: async (id) => {
    return await api.get(`/watches/${id}`);
  },
  
  create: async (watch) => {
    return await api.post('/watches', watch);
  },
  
  update: async (id, watch) => {
    return await api.put(`/watches/${id}`, watch);
  },
  
  delete: async (id) => {
    return await api.delete(`/watches/${id}`);
  }
};
