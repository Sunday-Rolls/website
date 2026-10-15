#!/usr/bin/env node
/**
 * Copy the Vite SPA shell into known route folders so GitHub Pages serves
 * HTTP 200 (no 404 → redirect) for deep links like /shop and /products/:handle.
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

function injectHead(html, { title, description, canonicalPath, preload = [] }) {
  let next = html
  if (title) {
    next = next.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
  }
  if (description) {
    next = next.replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="description" content="${description}" />`,
    )
    if (!next.includes(`content="${description}"`)) {
      next = next.replace(
        /<meta[\s\S]*?name="description"[\s\S]*?content="[^"]*"[\s\S]*?\/?>/i,
        `<meta name="description" content="${description}" />`,
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
  if (preload.length) {
    const links = preload.map((asset) => {
      const typeAttr = asset.type ? ` type="${asset.type}"` : ''
      return `<link rel="preload" as="image" href="${asset.href}"${typeAttr} fetchpriority="high" />`
    })
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
  const target = join(distDir, relativePath, 'index.html')
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, html)
}

async function main() {
  const html = await readFile(join(distDir, 'index.html'), 'utf8')
  const base = process.env.VITE_BASE_PATH?.replace(/\/$/, '') || baseFromHtml(html)
  const siteOrigin = (process.env.VITE_SITE_ORIGIN || '').replace(/\/$/, '')

  for (const route of STATIC_ROUTES) {
    const meta = ROUTE_META[route] ?? {}
    const canonicalPath = siteOrigin
      ? `${siteOrigin}${base}/${route}`
      : undefined
    const preload = (meta.preload ?? []).map((asset) => ({
      ...asset,
      href: `${base}/${asset.href}`.replace(/\/{2,}/g, '/').replace(':/', '://'),
    }))
    const shell = injectHead(html, {
      title: meta.title,
      description: meta.description,
      canonicalPath,
      preload,
    })
    await writeShell(route, shell)
  }

  let handles = []
  try {
    const catalog = JSON.parse(await readFile(catalogPath, 'utf8'))
    handles = (Array.isArray(catalog) ? catalog : catalog.products ?? [])
      .map((product) => product.handle)
      .filter(Boolean)
  } catch {
    // Catalog optional for local experiments
  }

  for (const handle of handles) {
    const route = `products/${handle}`
    const canonicalPath = siteOrigin
      ? `${siteOrigin}${base}/${route}`
      : undefined
    const shell = injectHead(html, {
      title: `${handle.replace(/-/g, ' ')} — Sunday Rolls`,
      canonicalPath,
    })
    await writeShell(route, shell)
  }

  console.log(
    `Emitted SPA shells for ${STATIC_ROUTES.length} routes and ${handles.length} products`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
