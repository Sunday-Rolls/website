import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import productContent from '@/content/pages/product.json'
import reviewsData from '@/data/reviews.json'
import { ProductPage } from '@/pages/ProductPage'
import { renderWithRouter } from '@/test/test-utils'

vi.mock('@/lib/shopify', async () => {
  const actual = await vi.importActual<typeof import('@/lib/shopify')>('@/lib/shopify')

  return {
    ...actual,
    fetchProductByHandle: vi.fn().mockResolvedValue(null),
  }
})

vi.mock('@/lib/gtm', () => ({
  trackViewItem: vi.fn(),
  trackAddToCart: vi.fn(),
  initGtm: vi.fn(),
  pushEvent: vi.fn(),
}))

vi.mock('@/lib/reviews-api', () => ({
  fetchProductReviews: vi.fn().mockResolvedValue([]),
  submitProductReview: vi.fn(),
}))

describe('ProductPage', () => {
  it('renders product details for a known handle', async () => {
    renderWithRouter(<ProductPage />, {
      route: '/products/retro-roller-grey',
      path: '/products/:handle',
    })

    expect(await screen.findByRole('heading', { level: 1, name: 'Retro Roller - Grey' })).toBeInTheDocument()
    expect(screen.getByText('$55.00')).toBeInTheDocument()
    expect(screen.getByText('Headcover')).toBeInTheDocument()
  })

  it('renders description, key features, and dimensions from catalog data', async () => {
    renderWithRouter(<ProductPage />, {
      route: '/products/retro-roller-grey',
      path: '/products/:handle',
    })

    await screen.findByRole('heading', { level: 1, name: 'Retro Roller - Grey' })

    expect(
      screen.getByText(/nostalgic gaming energy straight to the course/i),
    ).toBeInTheDocument()
    expect(screen.getByText(productContent.featuresHeading)).toBeInTheDocument()
    expect(screen.getByText(/Precision Fit:/i)).toBeInTheDocument()
    expect(screen.getByText(productContent.dimensionsHeading)).toBeInTheDocument()
    expect(screen.getByText(/4\.625 in\. \(Length\)/)).toBeInTheDocument()
  })

  it('renders reviews for headcovers', async () => {
    const greyReview = reviewsData.items.find((item) => item.productHandle === 'retro-roller-grey')
    expect(greyReview).toBeTruthy()

    renderWithRouter(<ProductPage />, {
      route: '/products/retro-roller-grey',
      path: '/products/:handle',
    })

    expect(
      await screen.findByRole('heading', { level: 2, name: productContent.reviews.heading }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: productContent.reviews.leaveCta })).toBeInTheDocument()
    expect(screen.getByText(greyReview!.author)).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 3, name: productContent.reviews.similar.heading }),
    ).toBeInTheDocument()
    expect(screen.getByText(productContent.reviews.similar.headcovers)).toBeInTheDocument()
  })

  it('opens the leave-a-review form from the QR query param', async () => {
    renderWithRouter(<ProductPage />, {
      route: '/products/retro-roller-grey?review=1',
      path: '/products/:handle',
    })

    expect(
      await screen.findByRole('heading', { level: 3, name: productContent.reviews.form.title }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(productContent.reviews.form.nameLabel)).toBeInTheDocument()
  })

  it('renders story section from product.json', async () => {
    renderWithRouter(<ProductPage />, {
      route: '/products/retro-roller-grey',
      path: '/products/:handle',
    })

    expect(
      await screen.findByRole('heading', { level: 2, name: productContent.story.title }),
    ).toBeInTheDocument()
    expect(screen.getByText(productContent.story.description)).toBeInTheDocument()
  })

  it('renders add to cart CTA from site content', async () => {
    renderWithRouter(<ProductPage />, {
      route: '/products/retro-roller-grey',
      path: '/products/:handle',
    })

    expect(await screen.findByRole('button', { name: 'Add to Cart' })).toBeInTheDocument()
  })

  it('renders a towel product page with reviews', async () => {
    renderWithRouter(<ProductPage />, {
      route: '/products/golf-towel-green-stripe',
      path: '/products/:handle',
    })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Golf Towel - Green Stripe' }),
    ).toBeInTheDocument()
    expect(screen.getByText('$30.00')).toBeInTheDocument()
    expect(screen.getByText('Towel')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Golf Towel - Green Stripe' })).toHaveAttribute(
      'src',
      '/assets/products/w800/golf-towel-green-stripe.jpg',
    )
    expect(
      await screen.findByRole('heading', { level: 2, name: productContent.reviews.heading }),
    ).toBeInTheDocument()
  })

  it('shows not found state for unknown handles', async () => {
    renderWithRouter(<ProductPage />, {
      route: '/products/unknown-product',
      path: '/products/:handle',
    })

    expect(
      await screen.findByRole('heading', { level: 1, name: productContent.notFound.title }),
    ).toBeInTheDocument()
    expect(screen.getByText(productContent.notFound.description)).toBeInTheDocument()
  })

  it('uses Figma gallery fallback when needed', async () => {
    renderWithRouter(<ProductPage />, {
      route: '/products/retro-roller-grey',
      path: '/products/:handle',
    })

    await waitFor(() => {
      const gallery = screen.getByRole('img', { name: 'Retro Roller - Grey' })
      expect(gallery).toHaveAttribute('src', '/assets/products/w800/retro-roller-grey.jpg')
    })
  })
})
