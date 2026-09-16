import { test, expect } from '@playwright/test'
import homeContent from '../src/content/pages/home.json' with { type: 'json' }

test.describe('Homepage', () => {
  test('displays hero, values, and product blocks', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveTitle(homeContent.meta.title)
    await expect(page.getByRole('heading', { level: 1, name: homeContent.hero.headline })).toBeVisible()
    await expect(page.getByText(homeContent.hero.subheadline)).toBeVisible()

    for (const item of homeContent.values.items) {
      await expect(page.getByText(item.label, { exact: true })).toBeVisible()
    }

    for (const block of homeContent.productBlocks) {
      await expect(page.getByRole('heading', { level: 2, name: block.title })).toBeVisible()
    }

    await expect(page.getByText('Retro Roller - Grey')).toBeVisible()
  })

  test('navigates to shop from hero CTA', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('link', { name: 'Shop Collection' }).first().click()
    await expect(page).toHaveURL(/\/shop$/)
  })

  test('loads hero video asset', async ({ page }) => {
    await page.goto('/')

    const videoRequest = page.waitForResponse(
      (response) =>
        response.url().includes('/assets/home/videos/hero-golf.mp4') && response.status() === 200,
    )

    await videoRequest
    await expect(page.locator('source[src="/assets/home/videos/hero-golf.mp4"]').first()).toBeAttached()
  })

  test('shows story banner without team section', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { level: 2, name: homeContent.story.title })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Meet the Team' })).toHaveCount(0)
  })
})
