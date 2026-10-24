import { defineConfig } from 'vite'
import { pdfAssets } from './scripts/pdf-assets'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss(), pdfAssets()],
  server: {
    watch: { ignored: ['**/api/**', '**/tests/**', '**/test-results/**', '**/docs/**'] },
    proxy: { '/api': process.env.REGULA_API_TARGET || 'http://127.0.0.1:8000' },
  },
})
