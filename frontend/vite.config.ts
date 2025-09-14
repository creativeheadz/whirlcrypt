import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: ['whirlcrypt.co.uk', 'www.whirlcrypt.co.uk', 'localhost', '127.0.0.1', '192.168.1.100'],
    hmr: {
      port: 5173,
      // For reverse proxy setup, let the client determine the WebSocket URL
      clientPort: 443,
      host: 'whirlcrypt.co.uk'
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})