import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import shopContent from '@/content/pages/shop.json'
import { ShopPage } from '@/pages/ShopPage'
import { renderWithRouter } from '@/test/test-utils'

vi.mock('@/lib/shopify', async () => {
  const actual = await vi.importActual<typeof import('@/lib/shopify')>('@/lib/shopify')

  return {
    ...actual,
    fetchProducts: vi.fn().mockResolvedValue([]),
  }
})

describe('ShopPage', () => {
  it('renders collection header from shop.json', () => {
    renderWithRouter(<ShopPage />)

    expect(
      screen.getByRole('heading', { level: 1, name: shopContent.header.title }),
    ).toBeInTheDocument()
    expect(screen.getByText(shopContent.header.subtitle)).toBeInTheDocument()
  })

  it('renders all catalog products by default', () => {
    renderWithRouter(<ShopPage />)

    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(15)
  })

  it('renders category filters from content', () => {
    renderWithRouter(<ShopPage />)

    for (const option of shopContent.filters.options) {
      expect(screen.getByRole('button', { name: option.label })).toBeInTheDocument()
    }
  })

  it('filters products when a category is selected', async () => {
    const user = userEvent.setup()
    renderWithRouter(<ShopPage />)

    await user.click(screen.getByRole('button', { name: 'Headcovers' }))

    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(15)
  })

  it('shows empty state for categories not in the catalog', async () => {
    const user = userEvent.setup()
    renderWithRouter(<ShopPage />)

    await user.click(screen.getByRole('button', { name: 'Bags' }))

    expect(
      screen.getByRole('heading', { level: 2, name: shopContent.emptyState.title }),
    ).toBeInTheDocument()
  })

  it('uses the Figma shop header banner asset', () => {
    renderWithRouter(<ShopPage />)

    const banner = document.querySelector('img[src="/assets/shop/banner.jpg"]')
    expect(banner).not.toBeNull()
  })

  it('shows empty state when no products match the filter', async () => {
    const user = userEvent.setup()
    renderWithRouter(<ShopPage />, { route: '/shop?category=nonexistent' })

    expect(
      screen.getByRole('heading', { level: 2, name: shopContent.emptyState.title }),
    ).toBeInTheDocument()
    expect(screen.getByText(shopContent.emptyState.description)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'All Products' }))
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(15)
  })
})
