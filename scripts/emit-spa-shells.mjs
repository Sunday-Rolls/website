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
import { productDisplayName, productFitLabel, productSeoTitle } from '../src/lib/product-seo.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = join(root, 'dist')
const catalogPath = join(root, 'src/data/product-catalog.json')
const collectionsPath = join(root, 'src/content/pages/collections.json')

const STATIC_ROUTES = ['shop', 'about', 'contact', 'cart', 'order/thank-you']
/** Routes worth indexing; cart and thank-you are per-visitor. */
const SITEMAP_ROUTES = ['shop', 'about', 'contact']

const ROUTE_META = {
  shop: {
    title: 'Shop Embroidered Putter Covers & Golf Towels | Sunday Rolls Golf',
    description:
      'Embroidered putter covers for L.A.B. DF3, Oz, Mezz and TaylorMade Spider putters, plus waffle golf towels. Designed in the USA.',
    preload: [
      {
        srcSet:
          'assets/shop/banner-640.webp 640w, assets/shop/banner-960.webp 960w, assets/shop/banner-1200.webp 1200w',
        sizes: '100vw',
        type: 'image/webp',
      },
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
  return html.replace(/\s*<link\b[^>]*hero-poster[^>]*\/?>\s*/gi, '\n')
}

function stripHeroLcp(html) {
  return html.replace(/\s*<img\b[^>]*id="hero-lcp"[^>]*>\s*/i, '\n')
}

function withTrailingSlash(path) {
  if (!path || path.endsWith('/')) return path
  return `${path}/`
}

function withBase(path, base) {
  return `${base}/${path}`.replace(/\/{2,}/g, '/').replace(':/', '://')
}

function prefixSrcSet(srcSet, base) {
  return srcSet
    .split(',')
    .map((part) => {
      const [url, ...descriptor] = part.trim().split(/\s+/)
      return [withBase(url, base), ...descriptor].join(' ')
    })
    .join(', ')
}

function displayProductSrcSet(imagePath, base) {
  const file = imagePath?.split('/').pop()?.replace(/\.(jpe?g|png|webp)$/i, '')
  if (!file) return null
  return [480, 640, 800]
    .map((width) => `${withBase(`assets/products/w${width}/${file}.webp`, base)} ${width}w`)
    .join(', ')
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function injectHead(
  html,
  { title, description, canonicalPath, image, type, headExtra = [], body, preload = [], modulePreload = [] },
) {
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
  // Social previews read the raw HTML, so keep og:/twitter: tags in step with the page.
  const setMeta = (attr, key, value) => {
    const pattern = new RegExp(`<meta\\s+${attr}="${key}"\\s+content="[^"]*"\\s*\\/?>`, 'i')
    const tag = `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`
    next = pattern.test(next) ? next.replace(pattern, tag) : next.replace('</head>', `    ${tag}\n  </head>`)
  }
  if (title) {
    setMeta('property', 'og:title', title)
    setMeta('name', 'twitter:title', title)
  }
  if (description) {
    setMeta('property', 'og:description', description)
    setMeta('name', 'twitter:description', description)
  }
  if (canonicalPath) {
    setMeta('property', 'og:url', canonicalPath)
  }
  if (image) {
    setMeta('property', 'og:image', image)
    setMeta('name', 'twitter:image', image)
  }
  if (type) {
    setMeta('property', 'og:type', type)
  }
  if (body) {
    next = next.replace(/<div id="root"><\/div>/, `<div id="root">${body}</div>`)
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
      if (asset.srcSet) {
        const sizesAttr = asset.sizes ? ` imagesizes="${asset.sizes}"` : ''
        return `<link rel="preload" as="image" imagesrcset="${asset.srcSet}"${sizesAttr}${typeAttr} fetchpriority="high" />`
      }
      return `<link rel="preload" as="image" href="${asset.href}"${typeAttr} fetchpriority="high" />`
    }),
    ...modulePreload.map((href) => `<link rel="modulepreload" href="${href}" />`),
    ...headExtra,
  ]
  if (links.length) {
    next = next.replace('</head>', `    ${links.join('\n    ')}\n  </head>`)
  }
  return next
}

/**
 * Crawlers that don't run JavaScript (most AI search bots, link previews) only
 * see the HTML we ship. React's createRoot replaces everything inside #root on
 * first render, so this copy is for them; it is visually hidden so people never
 * see it flash before the app loads, and it says only what the page itself says.
 */
const PRERENDER_STYLE =
  'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0'

function prerenderBlock(inner) {
  return `<div data-prerender style="${PRERENDER_STYLE}">${inner}</div>`
}

function absoluteFrom(siteOrigin, base, path) {
  if (!path) return undefined
  if (/^https?:\/\//i.test(path)) return path
  if (!siteOrigin) return undefined
  return `${siteOrigin}${withBase(path.replace(/^\//, ''), base)}`
}

function productLinks(products, base) {
  return products
    .map(
      (product) =>
        `<li><a href="${withBase(`products/${product.handle}/`, base)}">${escapeHtml(productSeoTitle(product).replace(/ \| Sunday Rolls Golf$/, ''))}</a></li>`,
    )
    .join('')
}

function productPrerender(product, base) {
  const name = productDisplayName(product.title)
  const fit = productFitLabel(product)
  const features = (product.keyFeatures ?? [])
    .map((feature) => `<li><strong>${escapeHtml(feature.label)}:</strong> ${escapeHtml(feature.text)}</li>`)
    .join('')
  const price = product.price ? `<p>Price: $${escapeHtml(product.price)} USD</p>` : ''
  const size = product.dimensionsDisplay ? `<p>Size: ${escapeHtml(product.dimensionsDisplay)}</p>` : ''
  return prerenderBlock(
    `<main><nav><a href="${withBase('', base)}">Sunday Rolls Golf</a> / <a href="${withBase('shop/', base)}">Shop</a></nav>` +
      `<h1>${escapeHtml(name)} — ${escapeHtml(fit)}</h1>` +
      `<p>By Sunday Rolls Golf</p>${price}` +
      (product.description ? `<p>${escapeHtml(product.description)}</p>` : '') +
      (features ? `<ul>${features}</ul>` : '') +
      size +
      `</main>`,
  )
}

/** Same shape as src/lib/product-structured-data.ts; the app replaces it (same id) with live price and stock. */
function productJsonLd(product, pageUrl, imageUrl) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    brand: { '@type': 'Brand', name: 'Sunday Rolls' },
    category: product.category === 'towels' ? 'Golf Towels' : 'Golf Putter Headcovers',
  }
  if (pageUrl) data.url = pageUrl
  if (product.description) data.description = product.description
  if (imageUrl) data.image = [imageUrl]
  const price = Number(product.price)
  if (Number.isFinite(price) && price > 0) {
    data.offers = {
      '@type': 'Offer',
      ...(pageUrl ? { url: pageUrl } : {}),
      price: price.toFixed(2),
      priceCurrency: 'USD',
      itemCondition: 'https://schema.org/NewCondition',
    }
  }
  // Keep "</script>" in descriptions from closing the tag early.
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  return `<script type="application/ld+json" id="product-jsonld">${json}</script>`
}

function collectionPrerender(collection, products, others, base) {
  const faq = collection.faq
    .map((item) => `<h3>${escapeHtml(item.question)}</h3><p>${escapeHtml(item.answer)}</p>`)
    .join('')
  const otherLinks = others
    .map((item) => `<li><a href="${withBase(`putter-covers/${item.slug}/`, base)}">${escapeHtml(item.header.title)}</a></li>`)
    .join('')
  return prerenderBlock(
    `<main><nav><a href="${withBase('', base)}">Sunday Rolls Golf</a> / <a href="${withBase('shop/', base)}">Shop</a></nav>` +
      `<h1>${escapeHtml(collection.header.title)}</h1><p>${escapeHtml(collection.header.subtitle)}</p>` +
      collection.intro.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('') +
      `<ul>${productLinks(products, base)}</ul>` +
      `<h2>Questions about fit</h2>${faq}` +
      `<h2>Other fits</h2><ul>${otherLinks}</ul></main>`,
  )
}

function collectionJsonLd(collection, products, pageUrl, siteOrigin, base) {
  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: collection.faq.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  }
  const list = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: collection.header.title,
    description: collection.meta.description,
    ...(pageUrl ? { url: pageUrl } : {}),
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: products.map((product, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: product.title,
        ...(siteOrigin
          ? { url: `${siteOrigin}${withBase(`products/${product.handle}/`, base)}` }
          : {}),
      })),
    },
  }
  return [faq, list].map(
    (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`,
  )
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
  const html = stripHeroLcp(stripHeroPosterPreload(await readFile(join(distDir, 'index.html'), 'utf8')))
  const base = process.env.VITE_BASE_PATH?.replace(/\/$/, '') || baseFromHtml(html)
  const siteOrigin = (process.env.VITE_SITE_ORIGIN || '').replace(/\/$/, '')
  let manifest = null
  try {
    manifest = JSON.parse(await readFile(join(distDir, '.vite/manifest.json'), 'utf8'))
  } catch {
    manifest = null
  }

function modulePreloadFor(sourceSuffix) {
  if (!manifest) return []
  const entry = Object.entries(manifest).find(([key]) => key.endsWith(sourceSuffix))?.[1]
  if (!entry?.file) return []
  return [`${base}/${entry.file}`.replace(/\/{2,}/g, '/').replace(':/', '://')]
}

  let products = []
  let shopContent = null
  try {
    const catalog = JSON.parse(await readFile(catalogPath, 'utf8'))
    products = (Array.isArray(catalog) ? catalog : catalog.products ?? []).filter(
      (product) => product.handle,
    )
  } catch {
    products = []
  }
  try {
    shopContent = JSON.parse(await readFile(join(root, 'src/content/pages/shop.json'), 'utf8'))
  } catch {
    shopContent = null
  }

  const headcoverSections = new Set(['center-shafted', 'mallet', 'oz-mezz'])
  const firstSection = shopContent?.sections?.[0]
  const firstShopProduct = firstSection
    ? products.find((product) =>
        headcoverSections.has(firstSection.id)
          ? product.subcategory === firstSection.id
          : product.category === firstSection.id,
      )
    : undefined
  const firstShopSrcSet = firstShopProduct
    ? displayProductSrcSet(firstShopProduct.images?.[0], base)
    : null

  for (const route of STATIC_ROUTES) {
    const meta = ROUTE_META[route] ?? {}
    const canonicalPath = siteOrigin ? withTrailingSlash(`${siteOrigin}${base}/${route}`) : undefined
    const preload = (meta.preload ?? []).map((asset) => {
      if (asset.srcSet) {
        return { ...asset, srcSet: prefixSrcSet(asset.srcSet, base) }
      }
      return {
        ...asset,
        href: withBase(asset.href, base),
      }
    })
    if (route === 'shop' && firstShopSrcSet) {
      preload.unshift({
        srcSet: firstShopSrcSet,
        sizes: '(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw',
        type: 'image/webp',
      })
    }
    const shell = injectHead(html, {
      title: meta.title,
      description: meta.description,
      canonicalPath,
      body:
        route === 'shop'
          ? prerenderBlock(
              `<main><h1>Shop Sunday Rolls Golf</h1><p>${escapeHtml(meta.description)}</p><ul>${productLinks(products, base)}</ul></main>`,
            )
          : undefined,
      preload,
      modulePreload: modulePreloadFor(ROUTE_CHUNKS[route]),
    })
    await writeShell(route, shell)
  }

  for (const product of products) {
    const route = `products/${product.handle}`
    const canonicalPath = siteOrigin ? withTrailingSlash(`${siteOrigin}${base}/${route}`) : undefined
    const imageSrcSet = displayProductSrcSet(product.images?.[0], base)
    const imageUrl = absoluteFrom(siteOrigin, base, product.images?.[0])
    const shell = injectHead(html, {
      title: productSeoTitle(product),
      description: product.description,
      canonicalPath,
      image: imageUrl,
      type: 'product',
      headExtra: [productJsonLd(product, canonicalPath, imageUrl)],
      body: productPrerender(product, base),
      preload: imageSrcSet
        ? [{ srcSet: imageSrcSet, sizes: '(min-width: 1024px) 50vw, 100vw', type: 'image/webp' }]
        : [],
      modulePreload: modulePreloadFor('src/pages/ProductPage.tsx'),
    })
    await writeShell(route, shell)
  }

  let collections = []
  try {
    collections = JSON.parse(await readFile(collectionsPath, 'utf8')).collections ?? []
  } catch {
    collections = []
  }
  for (const collection of collections) {
    const route = `putter-covers/${collection.slug}`
    const canonicalPath = siteOrigin ? withTrailingSlash(`${siteOrigin}${base}/${route}`) : undefined
    const collectionProducts = products.filter((product) => product.subcategory === collection.sectionId)
    const shell = injectHead(html, {
      title: collection.meta.title,
      description: collection.meta.description,
      canonicalPath,
      image: absoluteFrom(siteOrigin, base, collectionProducts[0]?.images?.[0]),
      headExtra: collectionJsonLd(collection, collectionProducts, canonicalPath, siteOrigin, base),
      body: collectionPrerender(
        collection,
        collectionProducts,
        collections.filter((item) => item.slug !== collection.slug),
        base,
      ),
      modulePreload: modulePreloadFor('src/pages/CollectionPage.tsx'),
    })
    await writeShell(route, shell)
  }

  const homeChunk = modulePreloadFor('src/pages/HomePage.tsx')
  {
    const homeHtml = await readFile(join(distDir, 'index.html'), 'utf8')
    await writeFile(
      join(distDir, 'index.html'),
      injectHead(homeHtml, {
        modulePreload: homeChunk,
        body: prerenderBlock(
          `<main><h1>Sunday Rolls Golf — Embroidered Putter Covers &amp; Golf Towels</h1>` +
            `<p>Premium, vintage-inspired embroidered putter covers for L.A.B. DF3, L.A.B. Oz and Mezz, and TaylorMade Spider putters, plus waffle golf towels.</p>` +
            `<p><a href="${withBase('shop/', base)}">Shop all products</a></p><ul>${collections.map((c) => `<li><a href="${withBase(`putter-covers/${c.slug}/`, base)}">${escapeHtml(c.header.title)}</a></li>`).join('')}</ul><ul>${productLinks(products, base)}</ul></main>`,
        ),
      }),
    )
  }

  // The checked-in public/ copies only list the main pages; this one adds every product.
  if (siteOrigin) {
    const sitemapRoutes = [
      '',
      ...SITEMAP_ROUTES,
      ...collections.map((collection) => `putter-covers/${collection.slug}`),
      ...products.map((product) => `products/${product.handle}`),
    ]
    const urls = sitemapRoutes
      .map((route) => `  <url><loc>${withTrailingSlash(`${siteOrigin}${base}/${route}`)}</loc></url>`)
      .join('\n')
    await writeFile(
      join(distDir, 'sitemap.xml'),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    )
    await writeFile(
      join(distDir, 'robots.txt'),
      `User-agent: *\nAllow: /\n\nSitemap: ${siteOrigin}${base}/sitemap.xml\n`,
    )
  }

  console.log(
    `Emitted SPA shells for ${STATIC_ROUTES.length} routes, ${collections.length} collections and ${products.length} products`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
