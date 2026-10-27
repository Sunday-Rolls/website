import { getSiteContent } from '@/lib/content'
import { sitePath } from '@/lib/site-path'

const DEFAULT_DESCRIPTION = 'Premium vintage-inspired golf goods. Find your pace.'
const DEFAULT_OG_IMAGE = '/assets/home/videos/hero-poster-1280.webp'

function ensureMeta(attr: 'name' | 'property', key: string, content: string): void {
  if (typeof document === 'undefined') return
  const selector = `meta[${attr}="${key}"]`
  let el = document.head.querySelector(selector) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.content = content
}

function ensureLink(rel: string, href: string): void {
  if (typeof document === 'undefined') return
  let el = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null
  if (!el) {
    el = document.createElement('link')
    el.rel = rel
    document.head.appendChild(el)
  }
  el.href = href
}

function siteOrigin(): string {
  const fromEnv = (import.meta.env.VITE_SITE_ORIGIN as string | undefined)?.replace(/\/$/, '')
  if (fromEnv) return fromEnv
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}

function absoluteUrl(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  const raw = path.startsWith('/') ? path : `/${path}`
  const looksLikeFile = /\.[a-z0-9]+$/i.test(raw.split(/[?#]/)[0] ?? raw)
  const normalized = looksLikeFile ? raw : sitePath(raw)
  const origin = siteOrigin()
  return `${origin}${base}${normalized}`
}

function seoIndexDisabled(): boolean {
  return import.meta.env.VITE_SEO_INDEX === 'false'
}

export type PageMetaInput = {
  title: string
  description?: string
  path?: string
  image?: string
  type?: 'website' | 'product'
  /** e.g. "noindex, nofollow". Staging builds force noindex when VITE_SEO_INDEX=false. */
  robots?: string
  /** When set, replaces any existing application/ld+json Product (or appends one). */
  jsonLd?: Record<string, unknown> | null
}

const JSON_LD_ATTR = 'data-page-json-ld'

function ensureJsonLd(data: Record<string, unknown> | null | undefined): void {
  if (typeof document === 'undefined') return
  let el = document.head.querySelector(`script[${JSON_LD_ATTR}]`) as HTMLScriptElement | null
  if (data == null) {
    el?.remove()
    return
  }
  if (!el) {
    el = document.createElement('script')
    el.type = 'application/ld+json'
    el.setAttribute(JSON_LD_ATTR, 'true')
    document.head.appendChild(el)
  }
  el.textContent = JSON.stringify(data)
}

export function buildProductJsonLd(input: {
  name: string
  description?: string
  image?: string
  path: string
  price?: string | number | null
}): Record<string, unknown> {
  const url = absoluteUrl(input.path)
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: input.name,
    brand: { '@type': 'Brand', name: 'Sunday Rolls' },
    url,
  }
  if (input.description) data.description = input.description
  if (input.image) {
    data.image = [input.image.startsWith('http') ? input.image : absoluteUrl(input.image)]
  }
  if (input.price != null && String(input.price).trim() !== '') {
    data.offers = {
      '@type': 'Offer',
      url,
      priceCurrency: 'USD',
      price: String(input.price).replace(/^\$/, ''),
      availability: 'https://schema.org/InStock',
    }
  }
  return data
}

/** Sync document title + description, Open Graph, Twitter, and canonical. */
export function applyPageMeta({
  title,
  description,
  path,
  image,
  type = 'website',
  robots,
  jsonLd,
}: PageMetaInput): void {
  if (typeof document === 'undefined') return

  const { brand } = getSiteContent()
  const desc = description?.trim() || brand.description || DEFAULT_DESCRIPTION
  const url = absoluteUrl(
    path ??
      (typeof window !== 'undefined'
        ? window.location.pathname.replace(import.meta.env.BASE_URL.replace(/\/$/, ''), '') || '/'
        : '/'),
  )
  const ogImage = image
    ? image.startsWith('http')
      ? image
      : absoluteUrl(image.startsWith('/') ? image : `/${image}`)
    : absoluteUrl(DEFAULT_OG_IMAGE)

  const robotsContent = seoIndexDisabled() ? 'noindex, nofollow' : robots

  document.title = title
  ensureMeta('name', 'description', desc)
  ensureLink('canonical', url)

  if (robotsContent) {
    ensureMeta('name', 'robots', robotsContent)
  } else {
    document.head.querySelector('meta[name="robots"]')?.remove()
  }

  ensureMeta('property', 'og:title', title)
  ensureMeta('property', 'og:description', desc)
  ensureMeta('property', 'og:type', type)
  ensureMeta('property', 'og:url', url)
  ensureMeta('property', 'og:image', ogImage)
  ensureMeta('property', 'og:site_name', brand.name)

  ensureMeta('name', 'twitter:card', 'summary_large_image')
  ensureMeta('name', 'twitter:title', title)
  ensureMeta('name', 'twitter:description', desc)
  ensureMeta('name', 'twitter:image', ogImage)

  if (jsonLd !== undefined) {
    ensureJsonLd(jsonLd)
  }
}
