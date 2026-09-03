import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Set to your GitHub repo name for Project Pages, e.g. '/milk-vendor-app/'.
  // Use '/' if deploying to a custom domain or a username.github.io repo.
  base: process.env.VITE_BASE_PATH || '/milk-vendor-app/',
})
