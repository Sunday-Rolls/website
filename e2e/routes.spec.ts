import { test, expect } from '@playwright/test'
import notFoundContent from '../src/content/pages/not-found.json' with { type: 'json' }

test.describe('Removed routes', () => {
  test('gallery is no longer a page or a footer link', async ({ page }) => {
    await page.goto('/gallery')

    await expect(page.getByText(notFoundContent.title, { exact: true })).toBeVisible()
    await expect(page.getByText(notFoundContent.code, { exact: true })).toBeVisible()
    await expect(page.locator('footer').getByRole('link', { name: 'Gallery' })).toHaveCount(0)
  })
})
