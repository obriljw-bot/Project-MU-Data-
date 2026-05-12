import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Expose to local network and tunnel
    allowedHosts: ['.trycloudflare.com', '.loca.lt', 'localhost'], // Vite 7: 명시적 허용 목록
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
