import { execSync } from 'child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Short commit hash baked into the bundle for the footer. COMMIT_HASH env
 * wins (Docker builds have no .git), otherwise read from git, else unknown.
 */
function commitHash(): string {
  const fromEnv = process.env.COMMIT_HASH?.trim()
  if (fromEnv) return fromEnv
  try {
    const sha = execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return sha || 'unknown'
  } catch {
    return 'unknown'
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash()),
  },
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