/**
 * Generate product review QR codes from Shopify products.
 *
 * Each QR links to the website product page with ?review=1 so the leave-a-review
 * form opens automatically.
 *
 * Auth (first match wins) — same pattern as port-catalog-to-shopify.mjs:
 * 1. SHOPIFY_ADMIN_ACCESS_TOKEN
 * 2. SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET
 * 3. Shopify CLI store auth
 * Fallback: Storefront API (VITE_SHOPIFY_STOREFRONT_TOKEN) or local catalog.
 *
 * Usage:
 *   npm run reviews:qr
 *   SITE_URL=https://sunday-rolls.github.io/website SITE_BASE_PATH=/website npm run reviews:qr
 *   DRY_RUN=1 npm run reviews:qr
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import QRCode from 'qrcode'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const API_VERSION = process.env.VITE_SHOPIFY_API_VERSION || process.env.SHOPIFY_API_VERSION || '2025-01'
const DRY_RUN = process.env.DRY_RUN === '1'
const SITE_URL = (process.env.SITE_URL || 'https://sunday-rolls.github.io/website').replace(/\/$/, '')
const SITE_BASE_PATH = process.env.SITE_BASE_PATH ?? inferBasePath(SITE_URL)
const OUT_DIR = process.env.QR_OUT_DIR
  ? resolve(process.env.QR_OUT_DIR)
  : join(root, 'output', 'product-review-qrs')

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
          nodes { id handle title status }
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
      products.push({ handle: node.handle, title: node.title, id: node.id })
    }

    if (!connection?.pageInfo?.hasNextPage) break
    cursor = connection.pageInfo.endCursor
  }

  return products
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
      products.push({ handle: node.handle, title: node.title, id: node.id })
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
    }))
}

async function loadProducts(shop) {
  const adminToken = await resolveAdminToken(shop)
  if (adminToken) {
    try {
      const products = await fetchProductsFromAdmin(shop, adminToken)
      console.log('Source: Shopify Admin API')
      return products
    } catch (error) {
      console.warn('Admin fetch failed:', error.message)
    }
  }

  try {
    const storefront = await fetchProductsFromStorefront(shop)
    if (storefront?.length) {
      console.log('Source: Shopify Storefront API')
      return storefront
    }
  } catch (error) {
    console.warn('Storefront fetch failed:', error.message)
  }

  console.log('Source: local product-catalog.json (Shopify unavailable)')
  return productsFromCatalog()
}

async function main() {
  loadDotEnv()
  const shop = shopDomain()
  const products = await loadProducts(shop)

  if (!products.length) {
    throw new Error('No products found')
  }

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
          siteUrl: SITE_URL,
          siteBasePath: SITE_BASE_PATH,
          shop,
          count: manifest.length,
          products: manifest,
        },
        null,
        2,
      )}\n`,
    )
  }

  console.log(
    DRY_RUN
      ? `Dry run: ${manifest.length} QR URLs for ${shop}`
      : `Generated ${manifest.length} QR codes → ${OUT_DIR}`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
