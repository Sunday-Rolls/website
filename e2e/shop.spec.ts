import { test, expect } from '@playwright/test'
import shopContent from '../src/content/pages/shop.json' with { type: 'json' }

test.describe('Shop page', () => {
  test('displays collection header and full product grid', async ({ page }) => {
    await page.goto('/shop')

    await expect(page).toHaveTitle(shopContent.meta.title)
    await expect(
      page.getByRole('heading', { level: 1, name: shopContent.header.title }),
    ).toBeVisible()
    await expect(page.getByText(shopContent.header.subtitle)).toBeVisible()
    await expect(page.getByRole('heading', { level: 3, name: 'Retro Roller - Grey' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 3, name: 'The Doodle' })).toBeVisible()
  })

  test('shows a section per putter cover type and scrolls to the linked one', async ({ page }) => {
    await page.goto('/shop')

    for (const section of shopContent.sections) {
      await expect(page.getByRole('heading', { level: 2, name: section.title })).toBeVisible()
    }

    await page.goto('/shop?category=mallet')
    await expect(page.getByRole('heading', { level: 2, name: 'Mallet Putter Covers' })).toBeInViewport()
  })

  test('loads committed Figma shop banner asset', async ({ page }) => {
    await page.goto('/shop')

    await page.waitForResponse(
      (response) =>
        response.url().includes('/assets/shop/banner.jpg') && response.status() === 200,
    )

    await expect(page.locator('img[src="/assets/shop/banner.jpg"]').first()).toBeVisible()
  })
})
