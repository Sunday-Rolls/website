import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import homeContent from '@/content/pages/home.json'
import siteContent from '@/content/site.json'
import reviewsData from '@/data/reviews.json'
import { fitsMarqueeCard } from '@/lib/marquee-reviews'
import { sitePath } from '@/lib/site-path'
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
        sitePath(block.shopAll.href),
      )
    }
  })

  it('renders center-shafted products in the first carousel block', () => {
    renderWithRouter(<HomePage />)

    expect(screen.getAllByRole('heading', { level: 3, name: 'Retro Roller - Grey' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('heading', { level: 3, name: 'Flagstick Fuel' }).length).toBeGreaterThan(0)
  })

  it('renders reviews, story banner, and newsletter section', () => {
    renderWithRouter(<HomePage />)

    expect(
      screen.getByRole('heading', { level: 2, name: homeContent.reviews.title }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: homeContent.story.title }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: homeContent.newsletter.title }),
    ).toBeInTheDocument()
    expect(screen.getByPlaceholderText(homeContent.newsletter.placeholder)).toBeInTheDocument()
    expect(screen.getByText(homeContent.newsletter.consent!)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: 'Meet the Team' })).not.toBeInTheDocument()
  })

  it('renders a socials banner with Facebook, Instagram, and Etsy links', () => {
    renderWithRouter(<HomePage />)

    const heading = screen.getByRole('heading', { level: 2, name: homeContent.socials.title })
    const banner = heading.closest('section')
    expect(banner).not.toBeNull()

    for (const [label, href] of Object.entries(siteContent.footer.social)) {
      const network = label.charAt(0).toUpperCase() + label.slice(1)
      expect(
        within(banner!).getByRole('link', { name: `Sunday Rolls on ${network}` }),
      ).toHaveAttribute('href', href)
    }
  })

  it('populates the reviews marquee from reviews that fit on two lines', () => {
    renderWithRouter(<HomePage />)

    const shown = reviewsData.items.find((review) => fitsMarqueeCard(review.text))
    const longest = [...reviewsData.items].sort((a, b) => b.text.length - a.text.length)[0]
    expect(shown).toBeDefined()
    expect(fitsMarqueeCard(longest.text)).toBe(false)
    expect(screen.getAllByText(`“${shown!.text}”`).length).toBeGreaterThan(0)
    expect(screen.queryByText(`“${longest.text}”`)).not.toBeInTheDocument()
  })

  it('renders carousel next controls for product blocks', () => {
    renderWithRouter(<HomePage />)

    expect(screen.getByRole('button', { name: 'Next Center Shafted Putter Covers' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous Center Shafted Putter Covers' })).toBeInTheDocument()
  })

  it('links hero CTA to the shop page', () => {
    renderWithRouter(<HomePage />)

    const heroSection = screen.getByRole('heading', { level: 1 }).closest('section')
    expect(heroSection).not.toBeNull()

    const shopLink = within(heroSection!).getByRole('link', { name: 'Shop Collection' })
    expect(shopLink).toHaveAttribute('href', '/shop/')
  })

  it('uses a prioritized hero poster before mounting video', () => {
    renderWithRouter(<HomePage />)

    const poster = document.querySelector(
      'img[src="/assets/home/videos/hero-poster.jpg"]',
    ) as HTMLImageElement | null
    expect(poster).not.toBeNull()
    expect(poster).toHaveAttribute('fetchPriority', 'high')
    expect(
      document.querySelector('source[type="image/webp"]')?.getAttribute('srcset'),
    ).toContain('/assets/home/videos/hero-poster-960.webp 960w')
  })
})
