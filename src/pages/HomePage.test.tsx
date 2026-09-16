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

  it('renders product category blocks with shop all links', () => {
    renderWithRouter(<HomePage />)

    for (const block of homeContent.productBlocks) {
      const heading = screen.getByRole('heading', { level: 2, name: block.title })
      const section = heading.closest('section')
      expect(section).not.toBeNull()
      expect(within(section!).getByRole('link', { name: block.shopAll.label })).toHaveAttribute(
        'href',
        block.shopAll.href,
      )
    }
  })

  it('renders center-shafted products in the first carousel block', () => {
    renderWithRouter(<HomePage />)

    expect(screen.getAllByRole('heading', { level: 3, name: 'Retro Roller - Grey' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('heading', { level: 3, name: 'Flagstick Fuel' }).length).toBeGreaterThan(0)
  })

  it('renders reviews, story banner, and team section', () => {
    renderWithRouter(<HomePage />)

    expect(
      screen.getByRole('heading', { level: 2, name: homeContent.reviews.title }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: homeContent.story.title }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: homeContent.team.title }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: homeContent.team.cta.label })).toHaveAttribute(
      'href',
      '/about',
    )
  })

  it('links hero CTA to the shop page', () => {
    renderWithRouter(<HomePage />)

    const heroSection = screen.getByRole('heading', { level: 1 }).closest('section')
    expect(heroSection).not.toBeNull()

    const shopLink = within(heroSection!).getByRole('link', { name: 'Shop Collection' })
    expect(shopLink).toHaveAttribute('href', '/shop')
  })

  it('uses hero video with poster fallback', () => {
    renderWithRouter(<HomePage />)

    const video = document.querySelector('video source[src="/assets/home/videos/hero-golf.mp4"]')
    expect(video).not.toBeNull()
  })
})
