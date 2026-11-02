/**
 * 301 targets for the old Squarespace URLs that Google search results, ads,
 * Shopping feeds and bookmarks still point at.
 */
import { inferProductHandleFromListing } from './infer-product-handle.mjs'

const PAGE_ALIASES = {
  '/about-us': '/about/',
  '/our-story': '/about/',
  '/contact-us': '/contact/',
  '/contact-us-1': '/contact/#returns',
  '/home': '/',
}

/**
 * @param {string} url request URL (path + query)
 * @param {Set<string>} handles current product handles
 * @returns {string | null} absolute-path redirect target, or null to serve normally
 */
export function legacyRedirect(url, handles) {
  const queryStart = url.indexOf('?')
  const path = (queryStart === -1 ? url : url.slice(0, queryStart)).replace(/\/+$/, '') || '/'
  // Keep gclid / srsltid / utm_* so ad and Shopping clicks stay attributed.
  const query = queryStart === -1 ? '' : url.slice(queryStart)

  const target = targetFor(path.toLowerCase(), handles)
  if (!target) return null
  const [targetPath, hash] = target.split('#')
  return targetPath + query + (hash ? `#${hash}` : '')
}

function targetFor(path, handles) {
  if (PAGE_ALIASES[path]) return PAGE_ALIASES[path]

  const product = /^\/shop\/p\/([^/]+)$/.exec(path)
  if (product) {
    const slug = decodeURIComponent(product[1])
    if (handles.has(slug)) return `/products/${slug}/`
    const reordered = sameWords(slug, handles)
    if (reordered) return `/products/${reordered}/`
    const inferred = inferProductHandleFromListing(slug.replace(/-/g, ' '))
    return inferred && handles.has(inferred) ? `/products/${inferred}/` : '/shop/'
  }

  // Squarespace category and tag listings: /shop/headcovers, /shop?category=…
  if (path.startsWith('/shop/')) return '/shop/'

  return null
}

/**
 * Squarespace slugs reorder and inflect words: `sunday-stripes-mallet` is
 * `mallet-sunday-stripes`, `golf-towel-striped-green` is `golf-towel-green-stripe`.
 */
function sameWords(slug, handles) {
  const key = wordKey(slug)
  for (const handle of handles) if (wordKey(handle) === key) return handle
  return null
}

function wordKey(slug) {
  return slug
    .split('-')
    .filter((word) => word && word !== 'the')
    .map((word) => (word === 'striped' || word === 'stripes' ? 'stripe' : word))
    .sort()
    .join('-')
}
