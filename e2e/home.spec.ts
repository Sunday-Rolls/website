import { test, expect } from '@playwright/test'
import homeContent from '../src/content/pages/home.json' with { type: 'json' }

test.describe('Homepage', () => {
  test('displays hero, values, and featured collection', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveTitle(homeContent.meta.title)
    await expect(page.getByRole('heading', { level: 1, name: homeContent.hero.headline })).toBeVisible()
    await expect(page.getByText(homeContent.hero.subheadline)).toBeVisible()

    for (const item of homeContent.values.items) {
      await expect(page.getByText(item.label, { exact: true })).toBeVisible()
    }

    await expect(
      page.getByRole('heading', { level: 2, name: homeContent.featured.title }),
    ).toBeVisible()
    await expect(page.getByText('Retro Roller - Grey')).toBeVisible()
  })

  test('navigates to shop from hero CTA', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('link', { name: 'Shop Collection' }).first().click()
    await expect(page).toHaveURL(/\/shop$/)
  })

  test('loads committed Figma hero asset', async ({ page }) => {
    await page.goto('/')

    const heroRequest = page.waitForResponse(
      (response) =>
        response.url().includes('/assets/home/hero.png') && response.status() === 200,
    )

    await heroRequest
    await expect(page.locator('img[src="/assets/home/hero.png"]').first()).toBeVisible()
  })
})
