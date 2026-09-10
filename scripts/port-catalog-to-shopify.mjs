#!/usr/bin/env node
/**
 * Port src/data/product-catalog.json into Shopify Admin.
 *
 * Auth (first match wins):
 * 1. SHOPIFY_ADMIN_ACCESS_TOKEN in .env
 * 2. Client credentials (SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET) — app must be installed
 * 3. Shopify CLI store auth from `shopify store auth --store …`
 *
 * Usage:
 *   node scripts/port-catalog-to-shopify.mjs
 *   DEFAULT_PRICE=80 node scripts/port-catalog-to-shopify.mjs
 *   DRY_RUN=1 node scripts/port-catalog-to-shopify.mjs
 */

import { homedir } from 'node:os'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const API_VERSION = process.env.VITE_SHOPIFY_API_VERSION || process.env.SHOPIFY_API_VERSION || '2025-01'
const DEFAULT_PRICE = process.env.DEFAULT_PRICE || '80.00'
const DRY_RUN = process.env.DRY_RUN === '1'
const IMAGE_BASE =
  process.env.SHOPIFY_IMAGE_BASE ||
  'https://sunday-rolls.github.io/website/assets/products'

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
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  for (const [key, value] of Object.entries(config)) {
    if (!key.endsWith(`::${shop}`)) continue
    const sessions = value?.sessionsByUserId || {}
    for (const session of Object.values(sessions)) {
      if (session?.accessToken) return session.accessToken
    }
  }
  return null
}

async function tokenWorks(shop, token) {
  try {
    await adminGraphql(shop, token, '{ shop { name } }')
    return true
  } catch {
    return false
  }
}

async function resolveAccessToken(shop) {
  const candidates = [
    ['SHOPIFY_ADMIN_ACCESS_TOKEN', process.env.SHOPIFY_ADMIN_ACCESS_TOKEN],
    ['client_credentials', await tokenFromClientCredentials(shop)],
    ['shopify_cli_store_auth', tokenFromCliStoreAuth(shop)],
  ]

  for (const [source, token] of candidates) {
    if (!token) continue
    if (await tokenWorks(shop, token)) {
      console.log(`Auth: ${source}`)
      return token
    }
    console.warn(`Auth skipped (${source}): token rejected`)
  }

  throw new Error(
    'No working Admin API token. Run: shopify store auth --store ' +
      shop +
      ' --scopes write_products,write_files,write_publications',
  )
}

async function adminGraphql(shop, token, query, variables) {
  const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) {
    throw new Error(JSON.stringify(json.errors || json, null, 2))
  }
  return json.data
}

function descriptionHtml(product) {
  const parts = [`<p>${escapeHtml(product.description)}</p>`]
  if (product.keyFeatures?.length) {
    parts.push('<ul>')
    for (const feature of product.keyFeatures) {
      parts.push(
        `<li><strong>${escapeHtml(feature.label)}:</strong> ${escapeHtml(feature.text)}</li>`,
      )
    }
    parts.push('</ul>')
  }
  if (product.dimensionsDisplay) {
    parts.push(`<p><em>Dimensions:</em> ${escapeHtml(product.dimensionsDisplay)}</p>`)
  }
  return parts.join('\n')
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function productTags(product) {
  const tags = [product.category, product.productToken].filter(Boolean)
  if (product.subcategory) tags.push(product.subcategory)
  return tags
}

function imageUrl(product) {
  const relative = product.images?.[0]
  if (!relative) return null
  const file = relative.split('/').pop()
  return `${IMAGE_BASE}/${file}`
}

const PRODUCT_CREATE = `#graphql
  mutation ProductCreate($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
    productCreate(product: $product, media: $media) {
      product {
        id
        handle
        variants(first: 1) {
          nodes { id }
        }
      }
      userErrors { field message }
    }
  }
`

const VARIANT_UPDATE = `#graphql
  mutation VariantPrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id price }
      userErrors { field message }
    }
  }
`

const PUBLICATIONS = `#graphql
  query Publications {
    publications(first: 20) {
      nodes { id name }
    }
  }
`

const PUBLISH = `#graphql
  mutation Publish($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) {
      userErrors { field message }
    }
  }
`

const EXISTING = `#graphql
  query Existing($query: String!) {
    products(first: 1, query: $query) {
      nodes { id handle }
    }
  }
`

const DELETE_PRODUCT = `#graphql
  mutation DeleteProduct($input: ProductDeleteInput!) {
    productDelete(input: $input) {
      deletedProductId
      userErrors { field message }
    }
  }
`

async function ensurePublicationIds(shop, token) {
  const data = await adminGraphql(shop, token, PUBLICATIONS)
  const nodes = data.publications?.nodes ?? []
  const preferred = nodes.filter((node) =>
    /online store|headless|shop/i.test(node.name),
  )
  const chosen = preferred.length ? preferred : nodes
  return chosen.map((node) => node.id)
}

async function deleteTestProduct(shop, token) {
  const data = await adminGraphql(shop, token, EXISTING, {
    query: 'handle:test-sync-delete-me',
  })
  const product = data.products?.nodes?.[0]
  if (!product) return
  await adminGraphql(shop, token, DELETE_PRODUCT, {
    input: { id: product.id },
  })
  console.log('Deleted leftover test product')
}

async function upsertProduct(shop, token, product, publicationIds) {
  const existing = await adminGraphql(shop, token, EXISTING, {
    query: `handle:${product.handle}`,
  })
  if (existing.products?.nodes?.length) {
    console.log(`skip  ${product.handle} (already exists)`)
    return { skipped: true }
  }

  const mediaSrc = imageUrl(product)
  const media = mediaSrc
    ? [
        {
          originalSource: mediaSrc,
          alt: product.title,
          mediaContentType: 'IMAGE',
        },
      ]
    : undefined

  const createData = await adminGraphql(shop, token, PRODUCT_CREATE, {
    product: {
      title: product.title,
      handle: product.handle,
      descriptionHtml: descriptionHtml(product),
      productType: product.productType || 'Sporting Accessories',
      vendor: 'Sunday Rolls',
      status: product.status === 'Published' ? 'ACTIVE' : 'DRAFT',
      tags: productTags(product),
    },
    media,
  })

  const errors = createData.productCreate?.userErrors ?? []
  if (errors.length) {
    throw new Error(`${product.handle}: ${errors.map((e) => e.message).join('; ')}`)
  }

  const created = createData.productCreate.product
  const variantId = created.variants.nodes[0]?.id
  if (variantId) {
    const priceData = await adminGraphql(shop, token, VARIANT_UPDATE, {
      productId: created.id,
      variants: [{ id: variantId, price: DEFAULT_PRICE }],
    })
    const priceErrors = priceData.productVariantsBulkUpdate?.userErrors ?? []
    if (priceErrors.length) {
      throw new Error(
        `${product.handle} price: ${priceErrors.map((e) => e.message).join('; ')}`,
      )
    }
  }

  if (publicationIds.length) {
    const publishData = await adminGraphql(shop, token, PUBLISH, {
      id: created.id,
      input: publicationIds.map((publicationId) => ({ publicationId })),
    })
    const publishErrors = publishData.publishablePublish?.userErrors ?? []
    if (publishErrors.length) {
      console.warn(
        `warn  ${product.handle} publish: ${publishErrors.map((e) => e.message).join('; ')}`,
      )
    }
  }

  console.log(`ok    ${product.handle} @ $${DEFAULT_PRICE}`)
  return { created: true, id: created.id }
}

async function main() {
  loadDotEnv()
  const shop = shopDomain()
  const catalog = JSON.parse(
    readFileSync(join(root, 'src/data/product-catalog.json'), 'utf8'),
  )

  console.log(`Shop: ${shop}`)
  console.log(`Products: ${catalog.length}`)
  console.log(`Price: $${DEFAULT_PRICE}`)
  console.log(`Images: ${IMAGE_BASE}/…`)

  if (DRY_RUN) {
    for (const product of catalog) {
      console.log(`dry   ${product.handle} → ${imageUrl(product)}`)
    }
    return
  }

  const token = await resolveAccessToken(shop)
  await deleteTestProduct(shop, token)
  const publicationIds = await ensurePublicationIds(shop, token)

  let created = 0
  let skipped = 0
  for (const product of catalog) {
    const result = await upsertProduct(shop, token, product, publicationIds)
    if (result.skipped) skipped += 1
    else created += 1
  }

  console.log(`Done. created=${created} skipped=${skipped}`)
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
