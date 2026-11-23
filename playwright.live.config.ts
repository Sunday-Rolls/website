import { defineConfig, devices } from '@playwright/test'

/**
 * Smoke tests against the deployed site (no local server). `npm run experiments:verify:browser`.
 * SITE_URL defaults to production.
 */
export default defineConfig({
  testDir: './e2e/live',
  reporter: 'list',
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.SITE_URL || 'https://www.sundayrollsgolf.com',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
