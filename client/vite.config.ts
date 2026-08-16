import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // changeOrigin must stay false: the server builds the QR registration URL
      // from the request's Host header, which has to be the browser-facing origin.
      '/api': { target: 'http://localhost:3001', changeOrigin: false },
    },
  },
})
