import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test'
import { loadProjectEnv, optionalEnv } from './e2e/helpers/load-env'

loadProjectEnv()

const orderAnalytics = process.env.E2E_ORDER_ANALYTICS === '1'
const dashboardUrl = optionalEnv('E2E_DASHBOARD_URL', 'http://127.0.0.1:3001/dashboard/')
const needsLocalDashboard =
  orderAnalytics &&
  (/127\.0\.0\.1|localhost/.test(dashboardUrl) || dashboardUrl.includes(':3001'))

const webServers: NonNullable<PlaywrightTestConfig['webServer']> = [
  {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
]

if (needsLocalDashboard) {
  webServers.push({
    command: 'npm run dev',
    cwd: 'server',
    url: 'http://127.0.0.1:3001/dashboard/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  })
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: !orderAnalytics,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: orderAnalytics || process.env.CI ? 1 : undefined,
  reporter: 'list',
  timeout: orderAnalytics ? 10 * 60 * 1000 : 30_000,
  expect: {
    timeout: orderAnalytics ? 60_000 : 5_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    actionTimeout: orderAnalytics ? 45_000 : undefined,
    navigationTimeout: orderAnalytics ? 60_000 : undefined,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: webServers,
})
