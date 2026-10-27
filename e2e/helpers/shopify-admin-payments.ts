import { existsSync } from 'node:fs'
import type { Browser, BrowserContext, Page } from '@playwright/test'
import { optionalEnv, requireEnv } from './load-env'

export type AdminPaymentsSession = {
  context: BrowserContext
  page: Page
  paymentsUrl: string
}

function shopHandle(): string {
  return requireEnv('SHOPIFY_SHOP').replace(/\.myshopify\.com$/i, '')
}

export function paymentsSettingsUrl(): string {
  return `https://admin.shopify.com/store/${shopHandle()}/settings/payments`
}

async function fillIfVisible(page: Page, locator: ReturnType<Page['locator']>, value: string) {
  if (await locator.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
    await locator.first().fill(value)
    return true
  }
  return false
}

/** Log into Shopify Admin (or reuse storageState). Leaves page on Payments settings. */
export async function openAdminPayments(browser: Browser): Promise<AdminPaymentsSession> {
  const storagePath = optionalEnv('SHOPIFY_ADMIN_STORAGE_STATE')
  const context = await browser.newContext(
    storagePath && existsSync(storagePath) ? { storageState: storagePath } : {},
  )
  const page = await context.newPage()
  const paymentsUrl = paymentsSettingsUrl()

  await page.goto(paymentsUrl, { waitUntil: 'domcontentloaded' })

  const needsLogin =
    /accounts\.shopify\.com|login/i.test(page.url()) ||
    (await page.getByRole('textbox', { name: /email|account/i }).first().isVisible().catch(() => false))

  if (needsLogin) {
    if (storagePath && existsSync(storagePath)) {
      throw new Error(
        `Shopify Admin still showing login despite SHOPIFY_ADMIN_STORAGE_STATE=${storagePath}. Re-save storage after 2FA.`,
      )
    }
    const email = requireEnv('SHOPIFY_ADMIN_EMAIL')
    const password = requireEnv('SHOPIFY_ADMIN_PASSWORD')

    const emailBox = page.getByRole('textbox', { name: /email|account/i }).or(page.locator('input[type="email"]'))
    await fillIfVisible(page, emailBox, email)
    const continueBtn = page.getByRole('button', { name: /continue|next|log in|sign in/i })
    if (await continueBtn.first().isVisible().catch(() => false)) {
      await continueBtn.first().click()
    }

    const passwordBox = page.locator('input[type="password"]')
    await passwordBox.first().waitFor({ state: 'visible', timeout: 30_000 })
    await passwordBox.first().fill(password)
    await page.getByRole('button', { name: /log in|sign in|continue/i }).first().click()

    // 2FA / captcha — operator must complete in headed mode
    await page.waitForURL(/admin\.shopify\.com/, { timeout: 180_000 }).catch(() => {
      throw new Error(
        'Shopify Admin login did not reach admin.shopify.com (2FA/captcha?). Run headed and set SHOPIFY_ADMIN_STORAGE_STATE — see docs/E2E_ORDER_ANALYTICS.md',
      )
    })
    await page.goto(paymentsUrl, { waitUntil: 'domcontentloaded' })
  }

  await page.waitForLoadState('networkidle').catch(() => undefined)
  return { context, page, paymentsUrl }
}

async function clickFirstMatching(page: Page, names: RegExp[], timeout = 8_000): Promise<boolean> {
  for (const name of names) {
    const btn = page.getByRole('button', { name })
    if (await btn.first().isVisible({ timeout: 1_500 }).catch(() => false)) {
      await btn.first().click()
      return true
    }
    const link = page.getByRole('link', { name })
    if (await link.first().isVisible({ timeout: 1_000 }).catch(() => false)) {
      await link.first().click()
      return true
    }
  }
  // Fallback: any element with matching text
  for (const name of names) {
    const el = page.getByText(name).first()
    if (await el.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await el.click({ timeout }).catch(() => undefined)
      return true
    }
  }
  return false
}

/**
 * Activate (for testing) Bogus Gateway.
 * Shopify may require switching away from Shopify Payments first — we attempt the common UI path.
 */
export async function activateBogusGateway(page: Page): Promise<void> {
  await page.goto(paymentsSettingsUrl(), { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => undefined)

  const alreadyOn = page.getByText(/bogus gateway/i).first()
  const manageBogus = page.getByRole('button', { name: /manage.*bogus|bogus.*manage/i }).or(
    page.getByText(/\(for testing\)\s*bogus gateway/i),
  )
  if (await manageBogus.first().isVisible().catch(() => false)) {
    // Present on page — check if we need Activate vs already active
    const deactivate = page.getByRole('button', { name: /deactivate.*bogus|deactivate\(for testing\)/i })
    if (await deactivate.first().isVisible().catch(() => false)) {
      return // already active
    }
  }

  // Path when Shopify Payments is the primary provider
  await clickFirstMatching(page, [/manage payment methods/i, /^manage$/i])
  await clickFirstMatching(page, [/switch to a third-party provider/i])
  // Confirm dialog often repeats the same label
  await clickFirstMatching(page, [/switch to a third-party provider/i])

  await clickFirstMatching(page, [
    /see all other providers/i,
    /choose a provider/i,
    /add payment method/i,
    /third-party providers/i,
  ])

  const bogusRow = page.getByText(/\(for testing\)\s*bogus gateway|bogus gateway/i).first()
  await bogusRow.waitFor({ state: 'visible', timeout: 60_000 }).catch(() => {
    throw new Error(
      'Could not find Bogus Gateway on Payments settings. Enable it manually once, or update e2e/helpers/shopify-admin-payments.ts selectors.',
    )
  })
  await bogusRow.click()

  const activated = await clickFirstMatching(page, [
    /activate\s*\(for testing\)\s*bogus/i,
    /activate.*bogus/i,
    /^activate$/i,
  ])
  if (!activated) {
    // Some UIs use a primary button labeled Activate after selecting the provider
    await page.getByRole('button', { name: /^activate$/i }).first().click({ timeout: 15_000 })
  }

  await clickFirstMatching(page, [/^save$/i])
  await page.waitForTimeout(2_000)

  if (!(await alreadyOn.isVisible().catch(() => false))) {
    // Soft check — page copy varies
    const anyBogus = page.getByText(/bogus/i).first()
    if (!(await anyBogus.isVisible().catch(() => false))) {
      throw new Error('Bogus Gateway activation did not appear to succeed on Payments settings.')
    }
  }
}

/** Deactivate Bogus Gateway (best-effort). */
export async function deactivateBogusGateway(page: Page): Promise<void> {
  await page.goto(paymentsSettingsUrl(), { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => undefined)

  const manage = page.getByRole('button', { name: /manage/i }).filter({ hasText: /bogus/i })
  if (await manage.first().isVisible().catch(() => false)) {
    await manage.first().click()
  } else {
    const bogus = page.getByText(/bogus gateway/i).first()
    if (await bogus.isVisible().catch(() => false)) {
      await bogus.click()
    } else {
      console.warn('[e2e] Bogus Gateway not visible on Payments — nothing to deactivate')
      return
    }
  }

  const deactivated = await clickFirstMatching(page, [
    /deactivate\s*\(for testing\)\s*bogus/i,
    /deactivate.*bogus/i,
    /^deactivate$/i,
  ])
  if (!deactivated) {
    console.warn('[e2e] Could not find Deactivate for Bogus Gateway — check Admin Payments manually')
    return
  }
  await clickFirstMatching(page, [/confirm|deactivate|save/i])
  await page.waitForTimeout(1_500)
}

export async function closeAdminPayments(session: AdminPaymentsSession): Promise<void> {
  await session.context.close()
}
