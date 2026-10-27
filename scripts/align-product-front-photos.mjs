#!/usr/bin/env node
/**
 * Ops-only: make the single front-facing cream shot Shopify's featured media
 * (first in media order). Optionally refresh local placeholder JPGs from that
 * featured CDN URL so the SPA shell matches the store before Storefront loads.
 *
 * Mapping / front indexes live HERE — never in the frontend catalog.
 *
 * Usage:
 *   node scripts/align-product-front-photos.mjs
 *   DRY_RUN=1 node scripts/align-product-front-photos.mjs
 *   ONLY=flagstick-fuel,the-corduroy node scripts/align-product-front-photos.mjs
 *   SKIP_LOCAL=1 node scripts/align-product-front-photos.mjs
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const API_VERSION = process.env.VITE_SHOPIFY_API_VERSION || process.env.SHOPIFY_API_VERSION || '2025-01'
const DRY_RUN = process.env.DRY_RUN === '1'
const SKIP_LOCAL = process.env.SKIP_LOCAL === '1'
const ONLY = new Set(
  (process.env.ONLY || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
)

const PRODUCTS_DIR = join(root, 'public/assets/products')

/**
 * One-time ops table: Admin media index of the single front-facing shot
 * before reorder (Sept 2026 cream set). After a successful run, Shopify
 * featured/first is already front — leave empty or set new misordered handles.
 */
const FRONT_MEDIA_INDEX = {
  // Applied 2026-10-27 — featured is now front-facing for these handles.
  // 'flagstick-fuel': 1,
  // 'the-corduroy': 2,
  // 'mallet-retro-roller-white': 2,
  // 'mallet-retro-roller-grey': 1,
  // 'mallet-sunday-stripes': 2,
  // 'mallet-the-corduroy': 1,
  // 'coin-collector': 2,
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

async function resolveAccessToken(shop) {
  const fromClient = await tokenFromClientCredentials(shop)
  if (fromClient) return fromClient
  if (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN) return process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
  const fromCli = tokenFromCliStoreAuth(shop)
  if (fromCli) return fromCli
  throw new Error('No Shopify Admin token (client credentials / SHOPIFY_ADMIN_ACCESS_TOKEN / CLI)')
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
  if (json.errors?.length) {
    throw new Error(json.errors.map((error) => error.message).join('; '))
  }
  return json.data
}

const PRODUCT_BY_HANDLE = `#graphql
  query ProductByHandle($query: String!) {
    products(first: 1, query: $query) {
      nodes {
        id
        handle
        title
        featuredMedia {
          ... on MediaImage {
            id
            image { url }
          }
        }
        media(first: 50) {
          nodes {
            id
            ... on MediaImage {
              image { url }
            }
          }
        }
      }
    }
  }
`

const REORDER_MEDIA = `#graphql
  mutation ReorderMedia($id: ID!, $moves: [MoveInput!]!) {
    productReorderMedia(id: $id, moves: $moves) {
      job { id done }
      userErrors { field message }
    }
  }
`

async function sleep(ms) {
  await new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

async function fetchProduct(shop, token, handle) {
  const data = await adminGraphql(shop, token, PRODUCT_BY_HANDLE, {
    query: `handle:${handle}`,
  })
  return data.products?.nodes?.[0] ?? null
}

async function reorderFrontFirst(shop, token, handle, frontIndex) {
  const product = await fetchProduct(shop, token, handle)
  if (!product) {
    console.warn(`  skip — not in Shopify`)
    return null
  }

  const media = product.media.nodes.filter((node) => node?.id && node?.image?.url)
  if (!media.length) {
    console.warn(`  skip — no media`)
    return null
  }
  if (frontIndex <= 0) {
    console.log(`  already front-first (${media.length} media)`)
    return product
  }
  if (frontIndex >= media.length) {
    console.warn(`  skip — front index ${frontIndex} out of range (media=${media.length})`)
    return product
  }

  const reordered = [media[frontIndex], ...media.filter((_, index) => index !== frontIndex)]
  const moves = reordered.map((node, index) => ({
    id: node.id,
    newPosition: String(index),
  }))

  if (DRY_RUN) {
    console.log(`  dry reorder media[${frontIndex}] → 0`)
    return product
  }

  const result = await adminGraphql(shop, token, REORDER_MEDIA, {
    id: product.id,
    moves,
  })
  const errors = result.productReorderMedia?.userErrors ?? []
  if (errors.length) {
    throw new Error(`${handle}: ${errors.map((error) => error.message).join('; ')}`)
  }
  console.log(`  reordered media[${frontIndex}] → 0 (job ${result.productReorderMedia?.job?.id ?? '?'})`)

  // Reorder is async — brief wait then re-fetch featured URL for local sync.
  await sleep(1500)
  return fetchProduct(shop, token, handle)
}

async function syncLocalHero(handle, featuredUrl) {
  if (!featuredUrl) return
  mkdirSync(PRODUCTS_DIR, { recursive: true })
  const dest = join(PRODUCTS_DIR, `${handle}.jpg`)
  if (DRY_RUN) {
    console.log(`  dry local ← featured`)
    return
  }
  const buf = Buffer.from(await (await fetch(featuredUrl)).arrayBuffer())
  await sharp(buf).rotate().jpeg({ quality: 90, mozjpeg: true }).toFile(dest)
  console.log(`  local ${handle}.jpg ← Shopify featured`)
}

async function main() {
  loadDotEnv()
  const shop = shopDomain()
  const token = DRY_RUN ? await resolveAccessToken(shop).catch(() => null) : await resolveAccessToken(shop)

  console.log(`Shop: ${shop}`)
  console.log(`DRY_RUN=${DRY_RUN ? '1' : '0'} SKIP_LOCAL=${SKIP_LOCAL ? '1' : '0'}`)

  const handles = Object.keys(FRONT_MEDIA_INDEX).filter(
    (handle) => !ONLY.size || ONLY.has(handle),
  )
  if (!handles.length) {
    console.log('Nothing to do.')
    return
  }

  if (!DRY_RUN && !token) throw new Error('Missing Admin token')

  for (const handle of handles) {
    const frontIndex = FRONT_MEDIA_INDEX[handle]
    console.log(`\n${handle} (front media index ${frontIndex})`)
    if (DRY_RUN && !token) {
      console.log(`  dry (no token) would move media[${frontIndex}] → 0`)
      continue
    }
    const product = await reorderFrontFirst(shop, token, handle, frontIndex)
    if (!SKIP_LOCAL && product) {
      const featuredUrl =
        product.featuredMedia?.image?.url ?? product.media?.nodes?.[0]?.image?.url
      await syncLocalHero(handle, featuredUrl)
    }
  }

  if (!DRY_RUN && !SKIP_LOCAL) {
    console.log('\nNext: node scripts/resize-product-images.mjs')
  }
  console.log('\nDone.')
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
