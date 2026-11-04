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

  const shell = page.locator('#shell:not(.hidden)')
  // Already signed in
  if (await shell.isVisible().catch(() => false)) return

  await expect(page.locator('#login-view')).toBeVisible({ timeout: 30_000 })
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(password)
  await page.locator('#login-form button[type="submit"]').click()
  await expect(shell).toBeVisible({ timeout: 30_000 })
}

/** Force a sync of every source with the header Refresh button and wait for it to finish without a Shopify error. */
export async function syncShopifyFromDashboard(page: Page): Promise<void> {
  const refresh = page.locator('#refresh-btn')
  // The quiet sync that runs on login must finish before Refresh accepts a click.
  await expect(refresh).not.toHaveAttribute('aria-busy', 'true', { timeout: 120_000 })
  await refresh.click()
  await expect(refresh).toHaveAttribute('aria-busy', 'true')
  await expect(refresh).not.toHaveAttribute('aria-busy', 'true', { timeout: 120_000 })
  expect(await refresh.getAttribute('title')).not.toMatch(/Shopify/i)
}

export async function assertProductInOverview(
  page: Page,
  productName: string | RegExp,
): Promise<void> {
  await page.goto(`${dashboardBaseUrl()}#/products`)
  await page.locator('#range-pills button[data-period="7d"]').click()
  const root = page.locator('#page-root[data-page="products"]')
  await expect(root).not.toHaveAttribute('aria-busy', 'true', { timeout: 30_000 })
  await expect
    .poll(async () => root.innerText(), { timeout: 60_000 })
    .toMatch(productName instanceof RegExp ? productName : new RegExp(productName, 'i'))
}
