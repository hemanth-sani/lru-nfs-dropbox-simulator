import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Vite dev server on 5173; proxy /files to Nest on 3000
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
    '/api': {
      target: 'http://localhost:3000',
      changeOrigin: true,
    },
      // (optional) if you ever use /upload separately:
      '/upload': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    }
  }
})
