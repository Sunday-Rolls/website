/**
 * Generate product review QR codes from Shopify products.
 *
 * Each QR links to the website product page with ?review=1 so the leave-a-review
 * form opens automatically. Writes PNGs, a print-ready HTML sheet (with Export PDF
 * button), and a multi-page PDF of every code.
 *
 * Auth (first match wins) — same pattern as port-catalog-to-shopify.mjs:
 * 1. SHOPIFY_ADMIN_ACCESS_TOKEN
 * 2. SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET
 * 3. Shopify CLI store auth
 * Fallback: Storefront API (VITE_SHOPIFY_STOREFRONT_TOKEN) or local catalog.
 *
 * Usage:
 *   npm run reviews:qr              # GitHub Pages target (default)
 *   npm run reviews:qr:pages        # https://sunday-rolls.github.io/website
 *   npm run reviews:qr:live         # https://www.sundayrollsgolf.com (after cutover)
 *   SITE_TARGET=live npm run reviews:qr
 *   SITE_URL=… SITE_BASE_PATH=… npm run reviews:qr   # custom override
 *   DRY_RUN=1 npm run reviews:qr
 *   HEADCOVERS_ONLY=1 npm run reviews:qr   # headcovers only (default: all products)
 */
import { createWriteStream, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { finished } from 'node:stream/promises'
import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

/** Presets for QR landing URLs — flip SITE_TARGET when the live site is up. */
const SITE_TARGETS = {
  pages: {
    label: 'GitHub Pages',
    url: 'https://sunday-rolls.github.io/website',
    basePath: '/website',
  },
  live: {
    label: 'Live site',
    url: 'https://www.sundayrollsgolf.com',
    basePath: '/',
  },
}

function inferBasePath(siteUrl) {
  try {
    const { pathname } = new URL(siteUrl)
    if (!pathname || pathname === '/') return '/'
    return pathname.replace(/\/$/, '') || '/'
  } catch {
    return '/'
  }
}

function loadDotEnv() {
  const path = join(root, '.env')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

function resolveSiteTarget() {
  const rawTarget = (process.env.SITE_TARGET || 'pages').toLowerCase()
  const preset = SITE_TARGETS[rawTarget]
  if (process.env.SITE_URL) {
    const url = process.env.SITE_URL.replace(/\/$/, '')
    return {
      target: rawTarget,
      label: preset?.label || 'Custom',
      url,
      basePath: process.env.SITE_BASE_PATH ?? inferBasePath(url),
    }
  }
  if (!preset) {
    throw new Error(
      `Unknown SITE_TARGET="${rawTarget}". Use: ${Object.keys(SITE_TARGETS).join(', ')}`,
    )
  }
  return {
    target: rawTarget,
    label: preset.label,
    url: preset.url.replace(/\/$/, ''),
    basePath: process.env.SITE_BASE_PATH ?? preset.basePath,
  }
}

loadDotEnv()

const API_VERSION = process.env.VITE_SHOPIFY_API_VERSION || process.env.SHOPIFY_API_VERSION || '2025-01'
const DRY_RUN = process.env.DRY_RUN === '1'
const HEADCOVERS_ONLY = process.env.HEADCOVERS_ONLY === '1'
const site = resolveSiteTarget()
const SITE_URL = site.url
const SITE_BASE_PATH = site.basePath
const OUT_DIR = process.env.QR_OUT_DIR
  ? resolve(process.env.QR_OUT_DIR)
  : join(root, 'output', 'product-review-qrs')
const PDF_FILE = 'sunday-rolls-review-qrs.pdf'

function shopDomain() {
  const shop = process.env.SHOPIFY_SHOP?.replace(/\.myshopify\.com$/, '')
  const domain = process.env.VITE_SHOPIFY_STORE_DOMAIN
  if (shop) return `${shop}.myshopify.com`
  if (domain) return domain.replace(/^https?:\/\//, '')
  throw new Error('Set SHOPIFY_SHOP or VITE_SHOPIFY_STORE_DOMAIN in .env')
}

async function tokenFromClientCredentials(shop) {
  const clientId = process.env.SHOPIFY_CLIENT_ID
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.access_token || null
}

function tokenFromCliStoreAuth(shop) {
  const configPath = join(
    homedir(),
    'Library/Preferences/shopify-cli-store-nodejs/config.json',
  )
  if (!existsSync(configPath)) return null
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'))
    const entry = config?.stores?.[shop] || config?.storeSessions?.[shop]
    return entry?.accessToken || entry?.token || null
  } catch {
    return null
  }
}

async function resolveAdminToken(shop) {
  if (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN) return process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
  const fromApp = await tokenFromClientCredentials(shop)
  if (fromApp) return fromApp
  return tokenFromCliStoreAuth(shop)
}

function buildReviewUrl(handle) {
  const origin = SITE_URL
  const base = SITE_BASE_PATH === '/' ? '' : SITE_BASE_PATH.replace(/\/$/, '')
  // Avoid doubling /website when SITE_URL already includes the base path.
  if (base && (origin.endsWith(base) || origin.endsWith(`${base}/`))) {
    return `${origin.replace(/\/$/, '')}/products/${encodeURIComponent(handle)}?review=1`
  }
  return `${origin}${base}/products/${encodeURIComponent(handle)}?review=1`
}

async function fetchProductsFromAdmin(shop, token) {
  const products = []
  let cursor = null

  for (;;) {
    const query = `#graphql
      query Products($cursor: String) {
        products(first: 50, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            handle
            title
            status
            productType
            tags
          }
        }
      }`

    const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ query, variables: { cursor } }),
    })

    if (!res.ok) {
      throw new Error(`Admin GraphQL HTTP ${res.status}`)
    }

    const json = await res.json()
    if (json.errors?.length) {
      throw new Error(json.errors.map((e) => e.message).join('; '))
    }

    const connection = json.data?.products
    for (const node of connection?.nodes ?? []) {
      if (node.status && node.status !== 'ACTIVE') continue
      products.push({
        handle: node.handle,
        title: node.title,
        id: node.id,
        productType: node.productType,
        tags: node.tags,
        category: inferCategory(node),
      })
    }

    if (!connection?.pageInfo?.hasNextPage) break
    cursor = connection.pageInfo.endCursor
  }

  return products
}

function inferCategory(product) {
  if (product.category === 'headcovers' || product.category === 'towels') {
    return product.category
  }
  const type = String(product.productType || '').toLowerCase()
  const tags = Array.isArray(product.tags)
    ? product.tags.map((tag) => String(tag).toLowerCase())
    : []
  const haystack = [type, ...tags, String(product.handle || '').toLowerCase()].join(' ')
  if (haystack.includes('towel')) return 'towels'
  return 'headcovers'
}

async function fetchProductsFromStorefront(shop) {
  const token = process.env.VITE_SHOPIFY_STOREFRONT_TOKEN
  if (!token) return null

  const products = []
  let cursor = null

  for (;;) {
    const query = `#graphql
      query Products($cursor: String) {
        products(first: 50, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes { id handle title }
        }
      }`

    const res = await fetch(`https://${shop}/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': token,
      },
      body: JSON.stringify({ query, variables: { cursor } }),
    })

    if (!res.ok) {
      throw new Error(`Storefront GraphQL HTTP ${res.status}`)
    }

    const json = await res.json()
    if (json.errors?.length) {
      throw new Error(json.errors.map((e) => e.message).join('; '))
    }

    const connection = json.data?.products
    for (const node of connection?.nodes ?? []) {
      products.push({
        handle: node.handle,
        title: node.title,
        id: node.id,
        category: inferCategory(node),
      })
    }

    if (!connection?.pageInfo?.hasNextPage) break
    cursor = connection.pageInfo.endCursor
  }

  return products
}

function productsFromCatalog() {
  const catalogPath = join(root, 'src/data/product-catalog.json')
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
  const items = Array.isArray(catalog) ? catalog : catalog.products ?? []
  return items
    .filter((item) => item.status !== 'draft' && item.handle)
    .map((item) => ({
      handle: item.handle,
      title: item.title,
      id: item.handle,
      category: item.category || inferCategory(item),
    }))
}

function catalogCategoryByHandle() {
  try {
    const catalogPath = join(root, 'src/data/product-catalog.json')
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
    const items = Array.isArray(catalog) ? catalog : catalog.products ?? []
    return new Map(
      items
        .filter((item) => item.handle)
        .map((item) => [item.handle, item.category || inferCategory(item)]),
    )
  } catch {
    return new Map()
  }
}

function filterReviewProducts(products) {
  if (!HEADCOVERS_ONLY) return products
  const categories = catalogCategoryByHandle()
  return products.filter((product) => {
    const fromCatalog = categories.get(product.handle)
    if (fromCatalog) return fromCatalog === 'headcovers'
    return inferCategory(product) === 'headcovers'
  })
}

async function loadProducts(shop) {
  const adminToken = await resolveAdminToken(shop)
  if (adminToken) {
    try {
      const products = await fetchProductsFromAdmin(shop, adminToken)
      console.log('Source: Shopify Admin API')
      return filterReviewProducts(products)
    } catch (error) {
      console.warn('Admin fetch failed:', error.message)
    }
  }

  try {
    const storefront = await fetchProductsFromStorefront(shop)
    if (storefront?.length) {
      console.log('Source: Shopify Storefront API')
      return filterReviewProducts(storefront)
    }
  } catch (error) {
    console.warn('Storefront fetch failed:', error.message)
  }

  console.log('Source: local product-catalog.json (Shopify unavailable)')
  return filterReviewProducts(productsFromCatalog())
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function writePrintSheet(manifest) {
  const cards = manifest
    .map(
      (item) => `
      <article class="card">
        <img src="${escapeHtml(item.file)}" alt="QR code for ${escapeHtml(item.title)}" width="180" height="180" />
        <h2>${escapeHtml(item.title)}</h2>
        <p class="handle">${escapeHtml(item.handle)}</p>
        <p class="cta">Scan to leave a review</p>
      </article>`,
    )
    .join('\n')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sunday Rolls — Product review QR codes</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #1a1a1a;
      --green: #1b3a2f;
      --sand: #ede3cb;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      color: var(--ink);
      background: #fff;
    }
    header {
      padding: 24px 32px 8px;
      border-bottom: 1px solid var(--sand);
    }
    header h1 {
      margin: 0;
      font-size: 1.5rem;
      color: var(--green);
    }
    header p {
      margin: 8px 0 0;
      font-family: system-ui, sans-serif;
      font-size: 0.875rem;
      color: #555;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      padding: 12px 32px 0;
      font-family: system-ui, sans-serif;
    }
    .actions a,
    .actions button {
      appearance: none;
      border: 1px solid var(--green);
      background: var(--green);
      color: #fff;
      padding: 10px 16px;
      font: inherit;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
    }
    .actions button.secondary,
    .actions a.secondary {
      background: #fff;
      color: var(--green);
    }
    .sheet {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 18px;
      padding: 24px 32px 40px;
    }
    .card {
      break-inside: avoid;
      border: 1px dashed #c9bfa8;
      padding: 16px 12px 18px;
      text-align: center;
    }
    .card img {
      width: 180px;
      height: 180px;
      display: block;
      margin: 0 auto 12px;
    }
    .card h2 {
      margin: 0;
      font-size: 1rem;
      line-height: 1.3;
      color: var(--green);
    }
    .card .handle {
      margin: 6px 0 0;
      font-family: system-ui, sans-serif;
      font-size: 0.75rem;
      color: #666;
    }
    .card .cta {
      margin: 10px 0 0;
      font-family: system-ui, sans-serif;
      font-size: 0.8rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--ink);
    }
    @media print {
      .actions { display: none; }
      header { border: 0; padding-bottom: 0; }
      .sheet { padding-top: 12px; }
      .card { border-color: #bbb; }
      @page { size: letter; margin: 0.5in; }
    }
    @media (max-width: 800px) {
      .sheet { grid-template-columns: repeat(2, 1fr); padding: 16px; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Sunday Rolls — Review QR codes</h1>
    <p>Target: <strong>${escapeHtml(site.label)}</strong> · ${escapeHtml(SITE_URL)} · ${manifest.length} products. Each code opens the product page with the review form ready.</p>
  </header>
  <div class="actions">
    <a href="${escapeHtml(PDF_FILE)}" download="${escapeHtml(PDF_FILE)}">Export PDF</a>
    <button type="button" class="secondary" onclick="window.print()">Print HTML sheet</button>
  </div>
  <main class="sheet">
    ${cards}
  </main>
</body>
</html>
`

  writeFileSync(join(OUT_DIR, 'print-sheet.html'), html)
}

async function writePdf(manifest) {
  const pdfPath = join(OUT_DIR, PDF_FILE)
  const doc = new PDFDocument({
    size: 'LETTER',
    margin: 36,
    info: {
      Title: 'Sunday Rolls — Product review QR codes',
      Author: 'Sunday Rolls',
      Subject: `Review QR codes for ${site.label} (${SITE_URL})`,
    },
  })
  const stream = createWriteStream(pdfPath)
  doc.pipe(stream)

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right
  const cols = 3
  const gap = 16
  const cellWidth = (pageWidth - gap * (cols - 1)) / cols
  const qrSize = Math.min(140, cellWidth - 16)
  const cellHeight = qrSize + 72
  let x = doc.page.margins.left
  let y = doc.page.margins.top

  doc
    .fillColor('#1b3a2f')
    .font('Times-Bold')
    .fontSize(18)
    .text('Sunday Rolls — Review QR codes', { width: pageWidth })
  doc
    .fillColor('#555555')
    .font('Helvetica')
    .fontSize(9)
    .text(`${site.label} · ${SITE_URL}`, { width: pageWidth })
  doc
    .fontSize(8)
    .text('Scan to open the product page with the leave-a-review form. Cut along the dashed boxes.', {
      width: pageWidth,
    })
  y = doc.y + 16

  for (let index = 0; index < manifest.length; index += 1) {
    const item = manifest[index]
    const col = index % cols

    if (col === 0 && index > 0) {
      y += cellHeight + gap
    }
    if (y + cellHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage()
      y = doc.page.margins.top
    }

    x = doc.page.margins.left + col * (cellWidth + gap)

    doc
      .save()
      .lineWidth(0.75)
      .dash(3, { space: 2 })
      .strokeColor('#c9bfa8')
      .rect(x, y, cellWidth, cellHeight)
      .stroke()
      .undash()
      .restore()

    const imgX = x + (cellWidth - qrSize) / 2
    const imgY = y + 10
    doc.image(join(OUT_DIR, item.file), imgX, imgY, { width: qrSize, height: qrSize })

    const textTop = imgY + qrSize + 8
    doc
      .fillColor('#1b3a2f')
      .font('Times-Bold')
      .fontSize(9)
      .text(item.title, x + 6, textTop, { width: cellWidth - 12, align: 'center', height: 28, ellipsis: true })
    doc
      .fillColor('#666666')
      .font('Helvetica')
      .fontSize(7)
      .text(item.handle, x + 6, textTop + 30, { width: cellWidth - 12, align: 'center' })
  }

  doc.end()
  await finished(stream)
  return pdfPath
}

async function main() {
  const shop = shopDomain()
  const products = await loadProducts(shop)

  if (!products.length) {
    throw new Error('No products found')
  }

  console.log(`QR target: ${site.label} (${SITE_URL}, base ${SITE_BASE_PATH || '/'})`)

  mkdirSync(OUT_DIR, { recursive: true })

  const manifest = []
  for (const product of products) {
    const url = buildReviewUrl(product.handle)
    const fileName = `${product.handle}.png`
    const filePath = join(OUT_DIR, fileName)

    manifest.push({
      handle: product.handle,
      title: product.title,
      url,
      file: fileName,
    })

    if (DRY_RUN) {
      console.log(`${product.handle} → ${url}`)
      continue
    }

    await QRCode.toFile(filePath, url, {
      type: 'png',
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'M',
    })
    console.log(`Wrote ${fileName}`)
  }

  const manifestPath = join(OUT_DIR, 'manifest.json')
  if (!DRY_RUN) {
    writeFileSync(
      manifestPath,
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          siteTarget: site.target,
          siteLabel: site.label,
          siteUrl: SITE_URL,
          siteBasePath: SITE_BASE_PATH,
          shop,
          headcoversOnly: HEADCOVERS_ONLY,
          pdf: PDF_FILE,
          count: manifest.length,
          products: manifest,
        },
        null,
        2,
      )}\n`,
    )
    writePrintSheet(manifest)
    const pdfPath = await writePdf(manifest)
    console.log(`Wrote ${PDF_FILE}`)
    console.log(
      `Generated ${manifest.length} QR codes → ${OUT_DIR}\nPrint sheet: ${join(OUT_DIR, 'print-sheet.html')}\nPDF: ${pdfPath}`,
    )
  } else {
    console.log(`Dry run: ${manifest.length} QR URLs for ${shop}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
