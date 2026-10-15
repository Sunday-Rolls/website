import { screen, within } from '@testing-library/react'
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

function sectionFor(title: string) {
  const section = screen.getByRole('heading', { level: 2, name: title }).closest('section')
  expect(section).not.toBeNull()
  return section!
}

describe('ShopPage', () => {
  it('renders collection header from shop.json', () => {
    renderWithRouter(<ShopPage />)

    expect(
      screen.getByRole('heading', { level: 1, name: shopContent.header.title }),
    ).toBeInTheDocument()
    expect(screen.getByText(shopContent.header.subtitle)).toBeInTheDocument()
  })

  it('renders a section per putter cover type, in home page order, with its subtitle', () => {
    renderWithRouter(<ShopPage />)

    const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
    expect(headings).toEqual(shopContent.sections.map((section) => section.title))

    for (const section of shopContent.sections) {
      expect(within(sectionFor(section.title)).getByText(section.subtitle)).toBeInTheDocument()
    }
  })

  it('groups every catalog product under its putter type', () => {
    renderWithRouter(<ShopPage />)

    const [towels, centerShafted, mallet, ozMezz] = shopContent.sections.map((section) =>
      sectionFor(section.title),
    )

    expect(within(towels).getAllByRole('heading', { level: 3 })).toHaveLength(7)
    expect(within(towels).getByText('New!')).toBeInTheDocument()
    expect(within(towels).getByRole('heading', { name: 'Golf Towel - Green Stripe' })).toBeInTheDocument()
    expect(within(centerShafted).getAllByRole('heading', { level: 3 })).toHaveLength(10)
    expect(within(centerShafted).getByRole('heading', { name: 'Morning Dew' })).toBeInTheDocument()
    expect(within(centerShafted).getByRole('heading', { name: 'The Doodle' })).toBeInTheDocument()
    expect(within(mallet).getAllByRole('heading', { level: 3 })).toHaveLength(4)
    expect(within(ozMezz).getAllByRole('heading', { level: 3 })).toHaveLength(2)
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(23)
  })

  it('does not render filter buttons', () => {
    renderWithRouter(<ShopPage />)

    expect(screen.queryByRole('button', { name: 'All Products' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Headcovers' })).not.toBeInTheDocument()
  })

  it('scrolls to the section named in ?category= for Shop All links', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView

    renderWithRouter(<ShopPage />, { route: '/shop?category=mallet' })

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.contexts[0]).toBe(sectionFor('Mallet Putter Covers'))
  })

  it('uses the Figma shop header banner asset', () => {
    renderWithRouter(<ShopPage />)

    const banner = document.querySelector('img[src="/assets/shop/banner.jpg"]')
    expect(banner).not.toBeNull()
    expect(document.querySelector('source[type="image/webp"]')).not.toBeNull()
    expect(banner).toHaveAttribute('fetchPriority', 'high')
    expect(banner).toHaveAttribute('width', '1200')
    expect(banner).toHaveAttribute('height', '800')
  })
})
