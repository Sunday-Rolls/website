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

  test('filters products by category', async ({ page }) => {
    await page.goto('/shop')

    await page.getByRole('button', { name: 'Bags' }).click()
    await expect(page).toHaveURL(/category=bags/)
    await expect(page.getByRole('heading', { level: 2, name: shopContent.emptyState.title })).toBeVisible()

    await page.getByRole('button', { name: 'Headcovers' }).click()
    await expect(page).toHaveURL(/category=headcovers/)
    await expect(page.getByRole('heading', { level: 3, name: 'Retro Roller - Grey' })).toBeVisible()
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
