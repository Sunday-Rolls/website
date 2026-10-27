import { expect, type Page } from '@playwright/test'
import { optionalEnv, requireEnv } from './load-env'

export function dashboardBaseUrl(): string {
  const raw = optionalEnv('E2E_DASHBOARD_URL', 'http://127.0.0.1:3001/dashboard/')
  return raw.endsWith('/') ? raw : `${raw}/`
}

export async function loginDashboard(page: Page): Promise<void> {
  const email = requireEnv('E2E_DASHBOARD_EMAIL')
  const password = requireEnv('E2E_DASHBOARD_PASSWORD')
  await page.goto(dashboardBaseUrl(), { waitUntil: 'domcontentloaded' })

  const loginView = page.locator('#login-view')
  // Already signed in
  if (await page.locator('#dash-view:not(.hidden)').isVisible().catch(() => false)) {
    return
  }

  await expect(loginView).toBeVisible({ timeout: 30_000 })
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(password)
  await page.locator('#login-form button[type="submit"]').click()
  await expect(page.locator('#dash-view:not(.hidden)')).toBeVisible({ timeout: 30_000 })
}

export async function syncShopifyFromDashboard(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Data$/i }).click()
  await expect(page.locator('#sync-shopify-btn')).toBeVisible()
  await page.locator('#sync-shopify-btn').click()
  await expect(page.locator('#sync-feedback')).toContainText(/Shopify synced/i, { timeout: 120_000 })
}

export async function assertProductInOverview(
  page: Page,
  productName: string | RegExp,
): Promise<void> {
  await page.getByRole('button', { name: /^Overview$/i }).click()
  await page.locator('#period-pills button[data-period="7d"]').click()
  // Wait for products table to refresh
  await expect(page.locator('#products-table tbody')).toBeVisible({ timeout: 30_000 })
  await expect
    .poll(async () => page.locator('#products-table tbody').innerText(), { timeout: 60_000 })
    .toMatch(productName instanceof RegExp ? productName : new RegExp(productName, 'i'))
}
