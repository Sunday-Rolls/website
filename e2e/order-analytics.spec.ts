import { test, expect } from '@playwright/test'
import {
  activateBogusGateway,
  closeAdminPayments,
  deactivateBogusGateway,
  openAdminPayments,
  type AdminPaymentsSession,
} from './helpers/shopify-admin-payments'
import { assertProductInOverview, loginDashboard, syncShopifyFromDashboard } from './helpers/dashboard'
import { completeBogusCheckout, unlockStorefrontPassword } from './helpers/shopify-checkout'
import { loadProjectEnv } from './helpers/load-env'

loadProjectEnv()

const enabled = process.env.E2E_ORDER_ANALYTICS === '1'
const PRODUCT_NAME = 'The Birdie Machine'
const PRODUCT_PATH = '/products/the-birdie-machine'

test.describe('Order → dashboard analytics', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!enabled, 'Set E2E_ORDER_ANALYTICS=1 to run (see docs/E2E_ORDER_ANALYTICS.md)')

  test('places a storefront order and asserts Sync Shopify product analytics', async ({
    page,
    browser,
  }) => {
    test.setTimeout(10 * 60 * 1000)

    let admin: AdminPaymentsSession | undefined
    try {
      admin = await openAdminPayments(browser)
      await activateBogusGateway(admin.page)

      const email = `e2e+${Date.now()}@sundayrollsgolf.com`

      await page.goto('/')
      await page.getByRole('link', { name: 'Shop Collection' }).first().click()
      await expect(page).toHaveURL(/\/shop\/?$/)

      await page.getByRole('heading', { level: 3, name: PRODUCT_NAME }).click()
      await expect(page).toHaveURL(new RegExp(`${PRODUCT_PATH}/?$`))

      await page.getByRole('button', { name: 'Add to Cart' }).click()
      await expect(page).toHaveURL(/\/cart\/?$/)
      await expect(page.getByRole('link', { name: 'Checkout' })).toBeVisible({ timeout: 60_000 })

      await page.getByRole('link', { name: 'Checkout' }).click()
      await page.waitForURL(/shopify|checkout|myshopify/i, { timeout: 60_000 })

      await unlockStorefrontPassword(page)
      await completeBogusCheckout(page, { email })

      await loginDashboard(page)
      await syncShopifyFromDashboard(page)
      await assertProductInOverview(page, /birdie machine/i)
    } finally {
      if (admin) {
        try {
          await deactivateBogusGateway(admin.page)
        } catch (err) {
          console.error(
            '[e2e] FAILED to deactivate Bogus Gateway — do this manually in Shopify Admin → Settings → Payments',
            err,
          )
        }
        await closeAdminPayments(admin)
      }
    }
  })
})
