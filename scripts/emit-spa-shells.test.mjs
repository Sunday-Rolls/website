import { describe, expect, it } from 'vitest'
import {
  PRODUCTION_ORIGIN,
  buildProductJsonLd,
  buildRobotsTxt,
  buildSitemapXml,
  injectHead,
  resolveSeoIndexable,
  withTrailingSlash,
} from './emit-spa-shells.mjs'

describe('emit-spa-shells SEO helpers', () => {
  it('indexes only the production www origin by default', () => {
    expect(resolveSeoIndexable(PRODUCTION_ORIGIN, undefined)).toBe(true)
    expect(resolveSeoIndexable('https://sunday-rolls.github.io', undefined)).toBe(false)
    expect(resolveSeoIndexable(PRODUCTION_ORIGIN, 'false')).toBe(false)
    expect(resolveSeoIndexable('https://sunday-rolls.github.io', 'true')).toBe(true)
  })

  it('builds an allow robots.txt with sitemap for production', () => {
    const txt = buildRobotsTxt({
      siteOrigin: PRODUCTION_ORIGIN,
      base: '',
      indexable: true,
    })
    expect(txt).toContain('Allow: /')
    expect(txt).toContain(`Sitemap: ${PRODUCTION_ORIGIN}/sitemap.xml`)
    expect(txt).not.toContain('Disallow: /')
  })

  it('disallows all crawlers when not indexable', () => {
    const txt = buildRobotsTxt({
      siteOrigin: 'https://sunday-rolls.github.io',
      base: '/website',
      indexable: false,
    })
    expect(txt).toContain('Disallow: /')
    expect(txt).not.toContain('Sitemap:')
  })

  it('includes marketing routes and product handles with trailing slashes', () => {
    const xml = buildSitemapXml({
      siteOrigin: PRODUCTION_ORIGIN,
      base: '',
      productHandles: ['morning-dew', 'golf-towel-green-stripe'],
    })
    expect(xml).toContain(`${PRODUCTION_ORIGIN}/`)
    expect(xml).toContain(`${PRODUCTION_ORIGIN}/shop/`)
    expect(xml).toContain(`${PRODUCTION_ORIGIN}/about/`)
    expect(xml).toContain(`${PRODUCTION_ORIGIN}/contact/`)
    expect(xml).toContain(`${PRODUCTION_ORIGIN}/products/morning-dew/`)
    expect(xml).toContain(`${PRODUCTION_ORIGIN}/products/golf-towel-green-stripe/`)
    expect(xml).not.toContain('/cart')
    expect(xml).not.toContain('thank-you')
  })

  it('prefixes base path on Pages-style hosts', () => {
    const xml = buildSitemapXml({
      siteOrigin: 'https://sunday-rolls.github.io',
      base: '/website',
      productHandles: ['the-doodle'],
    })
    expect(xml).toContain('https://sunday-rolls.github.io/website/products/the-doodle/')
  })

  it('injects og tags, robots, and product json-ld into head', () => {
    const html = `<!doctype html><html><head>
      <title>Old</title>
      <meta name="description" content="old" />
      <link rel="canonical" href="https://example.com/" />
      <meta property="og:title" content="old" />
      <meta property="og:description" content="old" />
      <meta property="og:type" content="website" />
      <meta property="og:url" content="https://example.com/" />
      <meta property="og:image" content="https://example.com/old.png" />
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content="old" />
      <meta name="twitter:description" content="old" />
      <meta name="twitter:image" content="https://example.com/old.png" />
    </head><body></body></html>`

    const canonical = withTrailingSlash(`${PRODUCTION_ORIGIN}/products/morning-dew`)
    const jsonLd = buildProductJsonLd({
      siteOrigin: PRODUCTION_ORIGIN,
      handle: 'morning-dew',
      title: 'Morning Dew',
      description: 'A cover.',
      image: `${PRODUCTION_ORIGIN}/assets/products/morning-dew.jpg`,
      price: '80.00',
    })
    const next = injectHead(html, {
      title: 'Morning Dew — Sunday Rolls',
      description: 'A cover.',
      canonicalPath: canonical,
      image: `${PRODUCTION_ORIGIN}/assets/products/morning-dew.jpg`,
      type: 'product',
      robots: 'noindex, nofollow',
      jsonLd,
    })

    expect(next).toContain('<title>Morning Dew — Sunday Rolls</title>')
    expect(next).toContain(`href="${canonical}"`)
    expect(next).toContain('property="og:type" content="product"')
    expect(next).toContain('name="robots" content="noindex, nofollow"')
    expect(next).toContain('"@type": "Product"')
    expect(next).toContain('"price": "80.00"')
  })
})
