import { test, expect } from '@playwright/test'
import notFoundContent from '../src/content/pages/not-found.json' with { type: 'json' }

test.describe('Site links', () => {
  test('gallery is no longer a page or a footer link', async ({ page }) => {
    await page.goto('/gallery')

    await expect(page.getByText(notFoundContent.title, { exact: true })).toBeVisible()
    await expect(page.getByText(notFoundContent.code, { exact: true })).toBeVisible()
    await expect(page.locator('footer').getByRole('link', { name: 'Gallery' })).toHaveCount(0)
  })

  test('every footer section link lands on a section that exists', async ({ page }) => {
    await page.goto('/contact')

    const hrefs = await page
      .locator('footer a[href*="#"]')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))

    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) {
      const id = href.split('#')[1]
      await expect(page.locator(`[id="${id}"]`), `${href} target`).toHaveCount(1)
    }
  })
})
