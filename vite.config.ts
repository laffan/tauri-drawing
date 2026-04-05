import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: '0.0.0.0', // Required for Tauri mobile dev
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    outDir: './dist',
    emptyOutDir: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
})
