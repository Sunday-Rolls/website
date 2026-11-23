import { expect, test, type Page, type Request } from '@playwright/test'
import homeContent from '../../src/content/pages/home.json' with { type: 'json' }

/**
 * Browser half of the post-deploy A/B check (docs/AB_TESTING_VERIFY.md).
 *
 * The site server treats Playwright as a bot, so these tests send a normal Chrome user agent
 * to get a real assignment. Every beacon to /experiments/events is intercepted and answered
 * locally, so the run never adds visitors or exposures to a live test.
 */
const KEY = process.env.EXPECT_EXPERIMENT || 'home-banner'
const BANNER_HEADING = homeContent.featured.title
const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

declare global {
  interface Window {
    __SR_EXP__?: { vid: string | null; assignments: Record<string, string>; tracked: string[]; bot: boolean }
    dataLayer?: unknown[]
  }
}

test.use({ userAgent: CHROME_UA })

type Beacon = { vid: string; events: Array<{ type: string; experiment?: string; variant?: string; forced?: boolean }> }

async function captureBeacons(page: Page): Promise<Beacon[]> {
  const beacons: Beacon[] = []
  await page.route('**/experiments/events', async (route) => {
    try {
      beacons.push(JSON.parse(route.request().postData() || '{}'))
    } catch {
      // ignore
    }
    await route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*' } })
  })
  return beacons
}

const banner = (page: Page) => page.getByRole('heading', { level: 2, name: BANNER_HEADING })

async function waitForExposure(page: Page, beacons: Beacon[], forced: boolean) {
  await expect
    .poll(() => beacons.flatMap((b) => b.events).find((e) => e.type === 'exposure' && e.experiment === KEY && e.forced === forced), {
      message: `exposure beacon for ${KEY} (forced=${forced})`,
    })
    .toBeTruthy()
  return beacons.flatMap((b) => b.events).find((e) => e.type === 'exposure' && e.experiment === KEY)!
}

test(`?sr_force=${KEY}:b shows the Retro Roller banner`, async ({ page }) => {
  const beacons = await captureBeacons(page)
  await page.goto(`/?sr_force=${KEY}:b`)
  await expect(banner(page)).toBeVisible()
  const exposure = await waitForExposure(page, beacons, true)
  expect(exposure.variant).toBe('b')
})

test(`?sr_force=${KEY}:control hides the banner`, async ({ page }) => {
  const beacons = await captureBeacons(page)
  await page.goto(`/?sr_force=${KEY}:control`)
  await expect(page.getByRole('heading', { level: 1, name: homeContent.hero.headline })).toBeVisible()
  const exposure = await waitForExposure(page, beacons, true)
  expect(exposure.variant).toBe('control')
  await expect(banner(page)).toHaveCount(0)
})

test('a normal visit renders its assigned version, logs one exposure and keeps it on reload', async ({ page, context }) => {
  const beacons = await captureBeacons(page)
  const eventRequests: Request[] = []
  page.on('request', (r) => {
    if (r.url().includes('/experiments/events')) eventRequests.push(r)
  })

  await page.goto('/')
  const state = await page.evaluate(() => window.__SR_EXP__)
  expect(state, 'window.__SR_EXP__ injected by the site server').toBeTruthy()
  expect(state!.bot).toBe(false)
  const cookie = (await context.cookies()).find((c) => c.name === 'sr_vid')
  expect(cookie?.value, 'sr_vid cookie').toBe(state!.vid)

  const arm = state!.assignments[KEY]
  test.skip(!state!.tracked.includes(KEY), `${KEY} is not running (assignments: ${JSON.stringify(state!.assignments)})`)
  test.info().annotations.push({ type: 'arm', description: `${KEY}=${arm}` })

  await expect(page.getByRole('heading', { level: 1, name: homeContent.hero.headline })).toBeVisible()
  if (arm === 'b') await expect(banner(page)).toBeVisible()
  else await expect(banner(page)).toHaveCount(0)

  const exposure = await waitForExposure(page, beacons, false)
  expect(exposure.variant).toBe(arm)
  expect(beacons[0].vid).toBe(state!.vid)
  const pushed = await page.evaluate(() => (window.dataLayer ?? []).some((e) => (e as { event?: string }).event === 'experiment_exposure'))
  expect(pushed, 'experiment_exposure pushed to the dataLayer for GTM').toBe(true)

  // Sticky: same version after reload, and no second exposure (once per visitor).
  const before = beacons.flatMap((b) => b.events).filter((e) => e.type === 'exposure' && e.experiment === KEY).length
  await page.reload()
  const again = await page.evaluate(() => window.__SR_EXP__)
  expect(again!.vid).toBe(state!.vid)
  expect(again!.assignments[KEY]).toBe(arm)
  await page.waitForTimeout(1500)
  const after = beacons.flatMap((b) => b.events).filter((e) => e.type === 'exposure' && e.experiment === KEY).length
  expect(after).toBe(before)
})
