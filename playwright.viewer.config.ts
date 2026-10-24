import { defineConfig } from '@playwright/test'
import base from './playwright.config'
export default defineConfig({
  ...base, testDir: './tests/viewer', outputDir: './test-results/viewer',
  use: {...base.use, baseURL: 'http://127.0.0.1:5175'},
  webServer: {command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5175 --strictPort', port: 5175, reuseExistingServer: !process.env.CI},
})
