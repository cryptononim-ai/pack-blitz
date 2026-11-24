import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves the site under /pack-blitz/, so asset URLs must be
  // relative to that subpath — without this the page loads blank (JS 404s).
  base: '/pack-blitz/',
})
