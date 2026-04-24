import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Expose to local network and tunnel
    allowedHosts: true, // [CRITICAL FIX] Allow localtunnel domains to access Vite dev server
    cors: true,         // Allow cross-origin requests
    proxy: {
      '/ws-signal': {
        target: 'ws://localhost:8081',
        ws: true,
        secure: false
      }
    }
  }
})
