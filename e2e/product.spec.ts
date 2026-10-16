import { test, expect } from '@playwright/test'
import productContent from '../src/content/pages/product.json' with { type: 'json' }

test.describe('Product page', () => {
  test('displays product details and story section', async ({ page }) => {
    await page.goto('/products/retro-roller-grey')

    await expect(page.getByRole('heading', { level: 1, name: 'Retro Roller - Grey' })).toBeVisible()
    await expect(page.getByText('$55.00')).toBeVisible()
    await expect(page.getByText(/Precision Fit:/i)).toBeVisible()
    await expect(
      page.getByRole('heading', { level: 2, name: productContent.reviews.heading }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { level: 2, name: productContent.story.title }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add to Cart' })).toBeVisible()

    const thumbs = page.getByRole('button', { name: /Show image/ })
    await expect(thumbs.first()).toBeVisible()
    const sources = await thumbs.locator('img').evaluateAll((images) =>
      images.map((image) => (image as HTMLImageElement).currentSrc || image.getAttribute('src') || ''),
    )
    const otherCovers = [
      'retro-roller-purple',
      'retro-roller-yellow',
      'flagstick-fuel',
      'the-corduroy',
      'sunday-stripes',
    ]
    expect(sources.some((src) => otherCovers.some((name) => src.includes(name)))).toBe(false)
  })

  test('navigates from shop to product detail', async ({ page }) => {
    await page.goto('/shop')

    await page.getByRole('heading', { level: 3, name: 'The Birdie Machine' }).click()
    await expect(page).toHaveURL(/\/products\/the-birdie-machine\/?$/)
    await expect(page.getByRole('heading', { level: 1, name: 'The Birdie Machine' })).toBeVisible()

    const thumbs = page.getByRole('button', { name: /Show image/ })
    await expect(thumbs.first()).toBeVisible()
    const sources = await thumbs.locator('img').evaluateAll((images) =>
      images.map((image) => (image as HTMLImageElement).currentSrc || image.getAttribute('src') || ''),
    )
    expect(sources.some((src) => src.includes('retro-roller') || src.includes('flagstick-fuel'))).toBe(
      false,
    )
  })

  test('shows not found state for unknown products', async ({ page }) => {
    await page.goto('/products/does-not-exist')

    await expect(
      page.getByRole('heading', { level: 1, name: productContent.notFound.title }),
    ).toBeVisible()
  })
})
