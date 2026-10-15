import { getSiteContent } from '@/lib/content'

const DEFAULT_DESCRIPTION = 'Premium vintage-inspired golf goods. Find your pace.'

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
  const normalized = path.startsWith('/') ? path : `/${path}`
  const origin = siteOrigin()
  return `${origin}${base}${normalized}`
}

export type PageMetaInput = {
  title: string
  description?: string
  path?: string
  image?: string
  type?: 'website' | 'product'
}

/** Sync document title + description, Open Graph, Twitter, and canonical. */
export function applyPageMeta({
  title,
  description,
  path,
  image,
  type = 'website',
}: PageMetaInput): void {
  if (typeof document === 'undefined') return

  const { brand } = getSiteContent()
  const desc = description?.trim() || brand.description || DEFAULT_DESCRIPTION
  const url = absoluteUrl(path ?? (typeof window !== 'undefined' ? window.location.pathname.replace(import.meta.env.BASE_URL.replace(/\/$/, ''), '') || '/' : '/'))
  const ogImage = image
    ? image.startsWith('http')
      ? image
      : absoluteUrl(image.startsWith('/') ? image : `/${image}`)
    : absoluteUrl('/assets/brand/favicon.png')

  document.title = title
  ensureMeta('name', 'description', desc)
  ensureLink('canonical', url)

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
}
