#!/usr/bin/env node
/**
 * Copy the Vite SPA shell onto each route so GitHub Pages returns HTTP 200
 * for deep links like /shop and /products/:handle.
 *
 * A folder index (/shop/index.html) is what /shop/ serves. GitHub Pages 301s
 * /shop to /shop/ when that is the only file, and Lighthouse treats that
 * redirect as a failed load. A sibling /shop.html is served at /shop with no
 * redirect, so both forms load directly.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = join(root, 'dist')
const catalogPath = join(root, 'src/data/product-catalog.json')

const STATIC_ROUTES = ['shop', 'about', 'contact', 'cart', 'order/thank-you']

const ROUTE_META = {
  shop: {
    title: 'Our Collection — Sunday Rolls',
    description: 'Timeless golf goods built for the walk.',
    preload: [
      { href: 'assets/shop/banner.webp', type: 'image/webp' },
      { href: 'assets/shop/banner.jpg', type: 'image/jpeg' },
    ],
  },
  about: {
    title: 'Our Story — Sunday Rolls',
    description:
      'Built by friends, for the good times. Premium golf goods with timeless style and modern performance.',
  },
  contact: {
    title: 'Contact Us — Sunday Rolls',
    description: 'Get in touch with the Sunday Rolls crew.',
  },
  cart: {
    title: 'Your Cart — Sunday Rolls',
    description: 'Review your Sunday Rolls cart.',
  },
}

function stripHeroPosterPreload(html) {
  return html.replace(/\s*<link\b[^>]*hero-poster\.webp[^>]*\/?>\s*/gi, '\n')
}

function withTrailingSlash(path) {
  if (!path || path.endsWith('/')) return path
  return `${path}/`
}

function displayProductImage(imagePath, base) {
  const file = imagePath?.split('/').pop()
  if (!file || !/\.(jpe?g|png)$/i.test(file)) return null
  return `${base}/assets/products/w800/${file}`.replace(/\/{2,}/g, '/').replace(':/', '://')
}

function manifestChunk(manifest, sourceSuffix) {
  if (!manifest) return null
  const entry = Object.entries(manifest).find(([key]) => key.endsWith(sourceSuffix))
  return entry?.[1]?.file ?? null
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function injectHead(html, { title, description, canonicalPath, preload = [], modulePreload = [] }) {
  let next = html
  if (title) {
    next = next.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`)
  }
  if (description) {
    const safeDescription = escapeHtml(description)
    next = next.replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="description" content="${safeDescription}" />`,
    )
    if (!next.includes(`content="${safeDescription}"`)) {
      next = next.replace(
        /<meta[\s\S]*?name="description"[\s\S]*?content="[^"]*"[\s\S]*?\/?>/i,
        `<meta name="description" content="${safeDescription}" />`,
      )
    }
  }
  if (canonicalPath) {
    if (/<link\s+rel="canonical"/i.test(next)) {
      next = next.replace(
        /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
        `<link rel="canonical" href="${canonicalPath}" />`,
      )
    } else {
      next = next.replace(
        '</head>',
        `    <link rel="canonical" href="${canonicalPath}" />\n  </head>`,
      )
    }
  }
  const links = [
    ...preload.map((asset) => {
      const typeAttr = asset.type ? ` type="${asset.type}"` : ''
      return `<link rel="preload" as="image" href="${asset.href}"${typeAttr} fetchpriority="high" />`
    }),
    ...modulePreload.map((href) => `<link rel="modulepreload" href="${href}" />`),
  ]
  if (links.length) {
    next = next.replace('</head>', `    ${links.join('\n    ')}\n  </head>`)
  }
  return next
}

function baseFromHtml(html) {
  const match = html.match(/<base\s+href="([^"]+)"/i)
  if (match) return match[1].replace(/\/$/, '')
  // Vite injects asset URLs with the configured base; fall back to relative.
  const script = html.match(/src="(\/?[^"]*assets\/[^"]+\.js)"/)
  if (script?.[1]?.startsWith('/')) {
    const parts = script[1].split('/')
    const assetsIdx = parts.indexOf('assets')
    if (assetsIdx > 1) return '/' + parts.slice(1, assetsIdx).join('/')
  }
  return ''
}

async function writeShell(relativePath, html) {
  const indexTarget = join(distDir, relativePath, 'index.html')
  const extensionTarget = join(distDir, `${relativePath}.html`)
  await mkdir(dirname(indexTarget), { recursive: true })
  await mkdir(dirname(extensionTarget), { recursive: true })
  await writeFile(indexTarget, html)
  await writeFile(extensionTarget, html)
}

const ROUTE_CHUNKS = {
  shop: 'src/pages/ShopPage.tsx',
  about: 'src/pages/AboutPage.tsx',
  contact: 'src/pages/ContactPage.tsx',
  cart: 'src/pages/CartPage.tsx',
  'order/thank-you': 'src/pages/OrderThankYouPage.tsx',
}

async function main() {
  const html = stripHeroPosterPreload(await readFile(join(distDir, 'index.html'), 'utf8'))
  const base = process.env.VITE_BASE_PATH?.replace(/\/$/, '') || baseFromHtml(html)
  const siteOrigin = (process.env.VITE_SITE_ORIGIN || '').replace(/\/$/, '')
  let manifest = null
  try {
    manifest = JSON.parse(await readFile(join(distDir, '.vite/manifest.json'), 'utf8'))
  } catch {
    manifest = null
  }

  function modulePreloadFor(sourceSuffix) {
    const file = manifestChunk(manifest, sourceSuffix)
    if (!file) return []
    return [`${base}/${file}`.replace(/\/{2,}/g, '/').replace(':/', '://')]
  }

  for (const route of STATIC_ROUTES) {
    const meta = ROUTE_META[route] ?? {}
    const canonicalPath = siteOrigin ? withTrailingSlash(`${siteOrigin}${base}/${route}`) : undefined
    const preload = (meta.preload ?? []).map((asset) => ({
      ...asset,
      href: `${base}/${asset.href}`.replace(/\/{2,}/g, '/').replace(':/', '://'),
    }))
    const shell = injectHead(html, {
      title: meta.title,
      description: meta.description,
      canonicalPath,
      preload,
      modulePreload: modulePreloadFor(ROUTE_CHUNKS[route]),
    })
    await writeShell(route, shell)
  }

  let products = []
  try {
    const catalog = JSON.parse(await readFile(catalogPath, 'utf8'))
    products = (Array.isArray(catalog) ? catalog : catalog.products ?? []).filter(
      (product) => product.handle,
    )
  } catch {
    // Catalog optional for local experiments
  }

  for (const product of products) {
    const route = `products/${product.handle}`
    const canonicalPath = siteOrigin ? withTrailingSlash(`${siteOrigin}${base}/${route}`) : undefined
    const imageHref = displayProductImage(product.images?.[0], base)
    const shell = injectHead(html, {
      title: `${product.title ?? product.handle.replace(/-/g, ' ')} — Sunday Rolls`,
      description: product.description,
      canonicalPath,
      preload: imageHref ? [{ href: imageHref, type: 'image/jpeg' }] : [],
      modulePreload: modulePreloadFor('src/pages/ProductPage.tsx'),
    })
    await writeShell(route, shell)
  }

  const homeChunk = modulePreloadFor('src/pages/HomePage.tsx')
  if (homeChunk.length) {
    const homeHtml = await readFile(join(distDir, 'index.html'), 'utf8')
    await writeFile(
      join(distDir, 'index.html'),
      injectHead(homeHtml, { modulePreload: homeChunk }),
    )
  }

  console.log(
    `Emitted SPA shells for ${STATIC_ROUTES.length} routes and ${products.length} products`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
