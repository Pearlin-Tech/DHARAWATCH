import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// API_TARGET lets a second backend run alongside the default one (e.g. API_TARGET=http://localhost:3011).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': process.env.API_TARGET || 'http://localhost:3001'
    }
  }
})
