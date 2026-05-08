import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  publicDir: 'public',
  server: {
    port: 3030,
    proxy: {
      '/api': 'http://localhost:3031',
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
