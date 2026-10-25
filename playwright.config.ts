import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: 'agent-chat.spec.ts',
  outputDir: './test-results/e2e',
  workers: 1,
  use: {
    baseURL: process.env.REGULA_TEST_URL || 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 1100 },
    launchOptions: process.env.REGULA_CHROME_PATH ? {executablePath: process.env.REGULA_CHROME_PATH} : {},
    trace: 'retain-on-failure',
  },
})
