import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import homeContent from '@/content/pages/home.json'
import { HomePage } from '@/pages/HomePage'
import { renderWithRouter } from '@/test/test-utils'

vi.mock('@/lib/shopify', async () => {
  const actual = await vi.importActual<typeof import('@/lib/shopify')>('@/lib/shopify')

  return {
    ...actual,
    fetchProducts: vi.fn().mockResolvedValue([]),
  }
})

vi.mock('@/lib/gtm', () => ({
  trackCtaClick: vi.fn(),
  initGtm: vi.fn(),
  pushEvent: vi.fn(),
}))

describe('HomePage', () => {
  it('renders hero content from home.json', () => {
    renderWithRouter(<HomePage />)

    expect(
      screen.getByRole('heading', { level: 1, name: homeContent.hero.headline }),
    ).toBeInTheDocument()
    expect(screen.getByText(homeContent.hero.subheadline)).toBeInTheDocument()
  })

  it('renders brand value strip labels', () => {
    renderWithRouter(<HomePage />)

    const valueStrip = screen.getByText('Built to Walk').closest('div')
    expect(valueStrip).not.toBeNull()

    for (const item of homeContent.values.items) {
      expect(within(valueStrip!).getByText(item.label, { exact: true })).toBeInTheDocument()
    }
  })

  it('renders featured collection section', () => {
    renderWithRouter(<HomePage />)

    expect(
      screen.getByRole('heading', { level: 2, name: homeContent.featured.title }),
    ).toBeInTheDocument()
    expect(screen.getByText(homeContent.featured.subtitle)).toBeInTheDocument()
  })

  it('renders four featured product cards from the catalog', () => {
    renderWithRouter(<HomePage />)

    expect(screen.getAllByRole('heading', { level: 3, name: 'Retro Roller - Grey' })).toHaveLength(1)
    expect(screen.getAllByRole('heading', { level: 3, name: 'Retro Roller - Purple' })).toHaveLength(1)
    expect(screen.getAllByRole('heading', { level: 3, name: 'Retro Roller - Yellow' })).toHaveLength(1)
    expect(screen.getAllByRole('heading', { level: 3, name: 'Flagstick Fuel' })).toHaveLength(1)
  })

  it('links hero CTA to the shop page', () => {
    renderWithRouter(<HomePage />)

    const heroSection = screen.getByRole('heading', { level: 1 }).closest('section')
    expect(heroSection).not.toBeNull()

    const shopLink = within(heroSection!).getByRole('link', { name: 'Shop Collection' })
    expect(shopLink).toHaveAttribute('href', '/shop')
  })

  it('uses Figma hero asset', () => {
    renderWithRouter(<HomePage />)

    const heroImages = Array.from(document.querySelectorAll('img[src="/assets/home/hero.png"]'))
    expect(heroImages.length).toBeGreaterThan(0)
  })
})
