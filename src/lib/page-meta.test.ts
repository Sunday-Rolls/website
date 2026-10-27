import { afterEach, describe, expect, it } from 'vitest'
import { applyPageMeta, buildProductJsonLd } from '@/lib/page-meta'

describe('applyPageMeta', () => {
  afterEach(() => {
    document.title = ''
    document.head.querySelectorAll('meta[name], meta[property], link[rel="canonical"]').forEach((el) => {
      el.remove()
    })
    document.head.querySelectorAll('script[data-page-json-ld]').forEach((el) => el.remove())
  })

  it('sets title, description, and canonical', () => {
    applyPageMeta({
      title: 'Our Collection — Sunday Rolls',
      description: 'Timeless golf goods built for the walk.',
      path: '/shop',
    })

    expect(document.title).toBe('Our Collection — Sunday Rolls')
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'Timeless golf goods built for the walk.',
    )
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toContain('/shop')
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe(
      'Our Collection — Sunday Rolls',
    )
  })

  it('defaults og:image to the hero poster, not the favicon', () => {
    applyPageMeta({
      title: 'Contact Us — Sunday Rolls',
      description: 'Get in touch.',
      path: '/contact',
    })

    expect(document.querySelector('meta[property="og:image"]')?.getAttribute('content')).toContain(
      'hero-poster-1280.webp',
    )
  })

  it('sets robots meta when requested', () => {
    applyPageMeta({
      title: 'Your Cart — Sunday Rolls',
      path: '/cart',
      robots: 'noindex, nofollow',
    })

    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex, nofollow',
    )
  })

  it('removes robots meta when not provided', () => {
    applyPageMeta({
      title: 'Cart',
      path: '/cart',
      robots: 'noindex, nofollow',
    })
    applyPageMeta({
      title: 'Shop',
      path: '/shop',
    })

    expect(document.querySelector('meta[name="robots"]')).toBeNull()
  })

  it('injects Product JSON-LD when provided', () => {
    applyPageMeta({
      title: 'Morning Dew — Sunday Rolls',
      path: '/products/morning-dew',
      type: 'product',
      jsonLd: buildProductJsonLd({
        name: 'Morning Dew',
        description: 'A putter cover.',
        image: '/assets/products/morning-dew.jpg',
        path: '/products/morning-dew',
        price: '$80.00',
      }),
    })

    const script = document.querySelector('script[data-page-json-ld]')
    expect(script).toBeTruthy()
    const data = JSON.parse(script!.textContent || '{}')
    expect(data['@type']).toBe('Product')
    expect(data.name).toBe('Morning Dew')
    expect(data.offers.price).toBe('80.00')
  })
})
