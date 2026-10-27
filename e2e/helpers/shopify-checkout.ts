import type { Page } from '@playwright/test'
import { optionalEnv } from './load-env'

/** Unlock Shopify “Opening soon” / password gate when present. */
export async function unlockStorefrontPassword(page: Page): Promise<void> {
  const gateVisible =
    (await page.getByText(/opening soon/i).isVisible().catch(() => false)) ||
    (await page.getByText(/enter using password/i).isVisible().catch(() => false)) ||
    (await page.getByRole('button', { name: /enter using password/i }).isVisible().catch(() => false))

  if (!gateVisible) return

  const password = optionalEnv('SHOPIFY_STOREFRONT_PASSWORD')
  if (!password) {
    throw new Error(
      'Checkout hit the storefront password gate (“Opening soon”) but SHOPIFY_STOREFRONT_PASSWORD is unset.',
    )
  }

  const enterLink = page.getByRole('button', { name: /enter using password/i }).or(
    page.getByRole('link', { name: /enter using password/i }),
  )
  if (await enterLink.first().isVisible().catch(() => false)) {
    await enterLink.first().click()
  }

  const passwordInput = page.locator('input[type="password"]').or(page.getByLabel(/password/i))
  await passwordInput.first().waitFor({ state: 'visible', timeout: 15_000 })
  await passwordInput.first().fill(password)
  await page.getByRole('button', { name: /enter|submit|sign up|continue/i }).filter({ hasNotText: /newsletter/i }).first().click().catch(async () => {
    await passwordInput.first().press('Enter')
  })
  await page.waitForTimeout(1_500)

  if (await page.getByText(/opening soon/i).isVisible().catch(() => false)) {
    throw new Error('Storefront password was rejected or the gate did not dismiss.')
  }
}

async function fillByLabel(page: Page, label: RegExp, value: string): Promise<boolean> {
  const field = page.getByLabel(label).first()
  if (await field.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await field.fill(value)
    return true
  }
  return false
}

async function fillByPlaceholder(page: Page, placeholder: RegExp, value: string): Promise<boolean> {
  const field = page.getByPlaceholder(placeholder).first()
  if (await field.isVisible({ timeout: 1_500 }).catch(() => false)) {
    await field.fill(value)
    return true
  }
  return false
}

/** Complete Shopify hosted checkout with Bogus Gateway test card. */
export async function completeBogusCheckout(
  page: Page,
  opts: { email: string },
): Promise<void> {
  await unlockStorefrontPassword(page)

  // Contact
  await fillByLabel(page, /email/i, opts.email)
  await fillByPlaceholder(page, /email/i, opts.email)

  // Shipping address (US)
  await fillByLabel(page, /first name|nombre/i, 'E2E')
  await fillByLabel(page, /last name|apellido/i, 'Playwright')
  await fillByLabel(page, /^address(?!.*(2|line))/i, '123 Test St')
  await fillByPlaceholder(page, /address/i, '123 Test St')
  await fillByLabel(page, /city/i, 'Austin')
  await fillByLabel(page, /postal code|zip/i, '78701')
  await fillByPlaceholder(page, /postal|zip/i, '78701')

  // Country / province — best effort
  const country = page.getByLabel(/country|region/i).first()
  if (await country.isVisible().catch(() => false)) {
    await country.selectOption({ label: /United States/i }).catch(async () => {
      await country.fill('United States')
    })
  }
  const province = page.getByLabel(/state|province/i).first()
  if (await province.isVisible().catch(() => false)) {
    await province.selectOption({ label: /Texas/i }).catch(async () => {
      await province.fill('Texas')
    })
  }

  await fillByLabel(page, /phone/i, '5125550100')

  // Continue to shipping / payment as needed
  for (const name of [/continue to shipping/i, /continue to payment/i, /^continue$/i]) {
    const btn = page.getByRole('button', { name })
    if (await btn.first().isVisible().catch(() => false)) {
      await btn.first().click()
      await page.waitForTimeout(1_000)
    }
  }

  // Shipping method — pick first available radio / button
  const shippingOption = page.locator('input[name*="shipping"], input[type="radio"]').first()
  if (await shippingOption.isVisible().catch(() => false)) {
    await shippingOption.check({ force: true }).catch(() => shippingOption.click())
  }
  const continuePayment = page.getByRole('button', { name: /continue to payment/i })
  if (await continuePayment.first().isVisible().catch(() => false)) {
    await continuePayment.first().click()
    await page.waitForTimeout(1_000)
  }

  // Bogus card — often in iframe(s)
  const cardFilled = await fillBogusCard(page)
  if (!cardFilled) {
    throw new Error(
      'Could not find Bogus card fields on checkout. Is Bogus Gateway active? (Settings → Payments)',
    )
  }

  const pay = page.getByRole('button', { name: /pay now|complete order|place order|pay \$/i })
  await pay.first().waitFor({ state: 'visible', timeout: 30_000 })
  await pay.first().click()

  // Thank-you / confirmation
  await page.waitForURL(/thank|orders|checkout|processing/i, { timeout: 120_000 }).catch(() => undefined)
  const confirmed =
    (await page.getByText(/thank you|order confirmed|confirmed|thanks/i).first().isVisible().catch(() => false)) ||
    /thank_you|thank-you|orders\//i.test(page.url())

  if (!confirmed) {
    // Still on checkout with an error?
    const err = page.getByText(/error|declined|try again|bogus/i).first()
    if (await err.isVisible().catch(() => false)) {
      throw new Error(`Checkout failed: ${await err.textContent()}`)
    }
    console.warn('[e2e] No explicit thank-you copy; continuing with current URL:', page.url())
  }
}

async function fillBogusCard(page: Page): Promise<boolean> {
  const tryFill = async (root: Page | import('@playwright/test').FrameLocator) => {
    const number = root.getByLabel(/card number|number/i).or(root.getByPlaceholder(/card number/i))
    const name = root.getByLabel(/name on card|cardholder/i).or(root.getByPlaceholder(/name on card/i))
    const exp = root.getByLabel(/expir/i).or(root.getByPlaceholder(/mm\s*\/?\s*yy/i))
    const cvv = root.getByLabel(/cvv|security code|cvc/i).or(root.getByPlaceholder(/cvv|cvc/i))

    if (await number.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      await number.first().fill('1')
      if (await name.first().isVisible().catch(() => false)) await name.first().fill('Bogus Gateway')
      if (await exp.first().isVisible().catch(() => false)) await exp.first().fill('12/30')
      if (await cvv.first().isVisible().catch(() => false)) await cvv.first().fill('111')
      return true
    }
    return false
  }

  if (await tryFill(page)) return true

  // Card fields are often in nested iframes
  for (const frame of page.frames()) {
    try {
      const number = frame.getByLabel(/card number|number/i).or(frame.locator('input[name*="number"], input[autocomplete="cc-number"]'))
      if (await number.first().isVisible({ timeout: 1_000 }).catch(() => false)) {
        await number.first().fill('1')
        const name = frame.getByLabel(/name on card/i).or(frame.locator('input[autocomplete="cc-name"]'))
        if (await name.first().isVisible().catch(() => false)) await name.first().fill('Bogus Gateway')
        const exp = frame.getByLabel(/expir/i).or(frame.locator('input[autocomplete="cc-exp"], input[name*="expir"]'))
        if (await exp.first().isVisible().catch(() => false)) await exp.first().fill('12/30')
        const cvv = frame.getByLabel(/cvv|cvc|security/i).or(frame.locator('input[autocomplete="cc-csc"]'))
        if (await cvv.first().isVisible().catch(() => false)) await cvv.first().fill('111')
        return true
      }
    } catch {
      // cross-origin or detached
    }
  }

  // Frame locators (Shopify checkout card iframe naming varies)
  for (const name of ['card-fields-number', 'card-fields-name', 'card-fields-expiry', 'card-fields-verification_value']) {
    const fl = page.frameLocator(`iframe[id*="${name}"], iframe[name*="${name}"]`)
    const input = fl.locator('input').first()
    if (await input.isVisible({ timeout: 1_000 }).catch(() => false)) {
      if (name.includes('number')) await input.fill('1')
      else if (name.includes('name')) await input.fill('Bogus Gateway')
      else if (name.includes('expiry')) await input.fill('12/30')
      else await input.fill('111')
    }
  }

  const numberStill = page.locator('iframe[id*="card-fields-number"], iframe[name*="number"]')
  return numberStill.first().isVisible().catch(() => false)
}
