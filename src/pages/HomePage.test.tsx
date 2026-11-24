import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import homeContent from '@/content/pages/home.json'
import { __resetExperimentsForTests, bootExperiments, experimentString } from '@/lib/experiments'
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

vi.mock('@/lib/reviews-api', () => ({
  fetchAllReviews: vi.fn().mockRejectedValue(new Error('offline')),
  fetchProductReviews: vi.fn().mockRejectedValue(new Error('offline')),
  submitProductReview: vi.fn(),
}))

function bootHomeBanner(arm: 'control' | 'b') {
  window.__SR_EXP__ = {
    vid: 'AbCdEfGhIjKlMnOpQrStUv',
    assignments: { 'home-banner': arm },
    tracked: ['home-banner'],
    bot: false,
  }
  bootExperiments({ search: '', fetchConfig: false })
}

describe('HomePage', () => {
  beforeEach(() => {
    __resetExperimentsForTests()
    localStorage.clear()
    sessionStorage.clear()
    delete window.__SR_EXP__
    Object.defineProperty(navigator, 'sendBeacon', { value: vi.fn(() => true), configurable: true })
  })

  it('hides the Retro Roller banner for the home-banner control arm', () => {
    bootHomeBanner('control')
    renderWithRouter(<HomePage />)

    expect(screen.queryByRole('heading', { level: 2, name: homeContent.featured.title })).toBeNull()
    expect(experimentString()).toBe('home-banner:control')
  })

  it('renders the featured Retro Roller banner with its colorways', () => {
    bootHomeBanner('b')
    renderWithRouter(<HomePage />)
    expect(experimentString()).toBe('home-banner:b')

    const featured = homeContent.featured
    const heading = screen.getByRole('heading', { level: 2, name: featured.title })
    const section = heading.closest('section') as HTMLElement
    for (const fit of featured.fits) {
      expect(within(section).getByRole('button', { name: fit.label })).toBeInTheDocument()
    }
    for (const colorway of featured.fits[0].colorways) {
      expect(within(section).getByRole('button', { name: colorway.label })).toBeInTheDocument()
    }
    expect(within(section).getByRole('img', { name: /retro roller center-shafted putter cover in grey/i })).toBeInTheDocument()
    expect(within(section).getByRole('link', { name: /shop the retro roller/i })).toHaveAttribute(
      'href',
      expect.stringContaining('/products/retro-roller-grey'),
    )
  })

  it('switches the featured banner to mallet colourways and links', async () => {
    bootHomeBanner('b')
    const user = userEvent.setup()
    renderWithRouter(<HomePage />)

    const heading = screen.getByRole('heading', { level: 2, name: homeContent.featured.title })
    const section = heading.closest('section') as HTMLElement
    await user.click(within(section).getByRole('button', { name: 'Mallet' }))

    expect(within(section).getByRole('button', { name: 'White' })).toBeInTheDocument()
    expect(within(section).queryByRole('button', { name: 'Purple' })).not.toBeInTheDocument()
    expect(within(section).getByRole('img', { name: /mallet putter cover in white/i })).toBeInTheDocument()
    expect(within(section).getByRole('link', { name: /shop the retro roller/i })).toHaveAttribute(
      'href',
      expect.stringContaining('/products/mallet-retro-roller-white'),
    )
  })

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

  describe('home-dew-banner', () => {
    const dew = homeContent.dew

    function bootDew(assignments: Record<string, string>, tracked: string[]) {
      window.__SR_EXP__ = { vid: 'AbCdEfGhIjKlMnOpQrStUv', assignments, tracked, bot: false }
      bootExperiments({ search: '', fetchConfig: false })
    }

    it('while it is a draft, leaves the running home-banner test exactly as it was', () => {
      bootDew({ 'home-banner': 'b' }, ['home-banner'])
      renderWithRouter(<HomePage />)

      expect(screen.getByRole('heading', { level: 2, name: homeContent.featured.title })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { level: 2, name: /fresh dew/i })).toBeNull()
      expect(experimentString()).toBe('home-banner:b')
    })

    it('renders the Morning Dew banner in place of the Retro Roller for arm b, with a shop link', async () => {
      bootDew({ 'home-banner': 'b', 'home-dew-banner': 'b' }, ['home-dew-banner'])
      renderWithRouter(<HomePage />)

      const heading = await screen.findByRole('heading', { level: 2, name: /first tee\.\s*fresh dew/i })
      expect(screen.queryByRole('heading', { level: 2, name: homeContent.featured.title })).toBeNull()
      expect(experimentString()).toBe('home-dew-banner:b')

      const section = heading.closest('section') as HTMLElement
      expect(within(section).getByText(dew.subtitle)).toBeInTheDocument()
      expect(within(section).getByRole('img', { name: /morning dew center-shafted putter cover/i })).toBeInTheDocument()
      expect(within(section).getByRole('link', { name: /shop morning dew/i })).toHaveAttribute(
        'href',
        expect.stringContaining(dew.href),
      )
    })
  })
})
