#!/usr/bin/env node
/**
 * Upload multi-image product photos to Shopify from MAPPING.json.
 *
 * Auth (first match wins) — same as port-catalog-to-shopify.mjs:
 * 1. SHOPIFY_ADMIN_ACCESS_TOKEN
 * 2. Client credentials
 * 3. Shopify CLI store auth (`shopify store auth --store …`)
 *
 * Usage:
 *   node scripts/upload-product-photos.mjs
 *   DRY_RUN=1 node scripts/upload-product-photos.mjs
 *   REPLACE=1 node scripts/upload-product-photos.mjs   # delete existing media first
 *   ONLY=sunny-side-up,the-doodle node scripts/upload-product-photos.mjs
 */

import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const API_VERSION = process.env.VITE_SHOPIFY_API_VERSION || process.env.SHOPIFY_API_VERSION || '2025-01'
const DRY_RUN = process.env.DRY_RUN === '1'
const REPLACE = process.env.REPLACE === '1'
const ONLY = new Set(
  (process.env.ONLY || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
)

const DEFAULT_MAPPING = join(
  root,
  'scripts/data/product-photo-mapping-sept-2026.json',
)
const MAPPING_PATH = process.env.MAPPING || DEFAULT_MAPPING

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
      ' --scopes write_products,write_files,read_products',
  )
}

function mimeFor(filePath) {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  throw new Error(`Unsupported image type: ${filePath}`)
}

const PRODUCT_BY_HANDLE = `#graphql
  query ProductByHandle($query: String!) {
    products(first: 1, query: $query) {
      nodes {
        id
        handle
        title
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

const STAGED_UPLOADS = `#graphql
  mutation StagedUploads($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters { name value }
      }
      userErrors { field message }
    }
  }
`

const CREATE_MEDIA = `#graphql
  mutation CreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
    productCreateMedia(productId: $productId, media: $media) {
      media {
        ... on MediaImage {
          id
          status
          image { url }
        }
      }
      mediaUserErrors { field message code }
      product { id }
    }
  }
`

const DELETE_MEDIA = `#graphql
  mutation DeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
    productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
      deletedMediaIds
      mediaUserErrors { field message code }
    }
  }
`

async function uploadFile(shop, token, absolutePath, alt) {
  const filename = basename(absolutePath)
  const mimeType = mimeFor(absolutePath)
  const fileSize = String(statSync(absolutePath).size)

  const staged = await adminGraphql(shop, token, STAGED_UPLOADS, {
    input: [
      {
        filename,
        mimeType,
        httpMethod: 'POST',
        resource: 'PRODUCT_IMAGE',
        fileSize,
      },
    ],
  })

  const errors = staged.stagedUploadsCreate?.userErrors ?? []
  if (errors.length) {
    throw new Error(`stagedUploadsCreate: ${errors.map((e) => e.message).join('; ')}`)
  }

  const target = staged.stagedUploadsCreate.stagedTargets[0]
  if (!target) throw new Error(`No staged target for ${filename}`)

  const form = new FormData()
  for (const param of target.parameters) {
    form.append(param.name, param.value)
  }
  const bytes = readFileSync(absolutePath)
  form.append('file', new Blob([bytes], { type: mimeType }), filename)

  const uploadRes = await fetch(target.url, { method: 'POST', body: form })
  if (!uploadRes.ok) {
    const body = await uploadRes.text()
    throw new Error(`Upload failed for ${filename}: ${uploadRes.status} ${body.slice(0, 200)}`)
  }

  return {
    originalSource: target.resourceUrl,
    alt,
    mediaContentType: 'IMAGE',
  }
}

async function processProduct(shop, token, sourceDir, handle, entry) {
  const files = entry.files.map((name) => join(sourceDir, name))
  for (const file of files) {
    if (!existsSync(file)) throw new Error(`Missing file: ${file}`)
  }

  console.log(`\n${handle} (${files.length} images)${REPLACE ? ' [replace]' : ''}`)

  if (DRY_RUN) {
    for (const file of files) console.log(`  dry  ${basename(file)}`)
    return { dry: true }
  }

  const productData = await adminGraphql(shop, token, PRODUCT_BY_HANDLE, {
    query: `handle:${handle}`,
  })
  const product = productData.products?.nodes?.[0]
  if (!product) {
    console.warn(`skip  ${handle} (not in Shopify)`)
    return { skipped: true }
  }

  if (REPLACE) {
    const existingIds = product.media.nodes.map((node) => node.id).filter(Boolean)
    if (existingIds.length) {
      const del = await adminGraphql(shop, token, DELETE_MEDIA, {
        productId: product.id,
        mediaIds: existingIds,
      })
      const delErrors = del.productDeleteMedia?.mediaUserErrors ?? []
      if (delErrors.length) {
        throw new Error(
          `${handle} delete: ${delErrors.map((e) => e.message).join('; ')}`,
        )
      }
      console.log(`  deleted ${existingIds.length} existing media`)
    }
  }

  const mediaInputs = []
  for (const [index, file] of files.entries()) {
    const alt =
      index === 0
        ? entry.title
        : `${entry.title} — view ${index + 1}`
    process.stdout.write(`  upload ${basename(file)} … `)
    const media = await uploadFile(shop, token, file, alt)
    mediaInputs.push(media)
    console.log('ok')
  }

  const created = await adminGraphql(shop, token, CREATE_MEDIA, {
    productId: product.id,
    media: mediaInputs,
  })
  const createErrors = created.productCreateMedia?.mediaUserErrors ?? []
  if (createErrors.length) {
    throw new Error(
      `${handle} createMedia: ${createErrors.map((e) => e.message).join('; ')}`,
    )
  }

  const mediaCount = created.productCreateMedia?.media?.length ?? 0
  console.log(`  attached ${mediaCount} media`)
  return { uploaded: mediaCount }
}

async function main() {
  loadDotEnv()
  if (!existsSync(MAPPING_PATH)) {
    throw new Error(`Mapping not found: ${MAPPING_PATH}`)
  }

  const mapping = JSON.parse(readFileSync(MAPPING_PATH, 'utf8'))
  const sourceDir = mapping.source
  const shop = shopDomain()

  console.log(`Shop: ${shop}`)
  console.log(`Source: ${sourceDir}`)
  console.log(`Mapping: ${MAPPING_PATH}`)
  console.log(`REPLACE=${REPLACE ? '1' : '0'} DRY_RUN=${DRY_RUN ? '1' : '0'}`)
  if (mapping.missing_from_shoot?.length) {
    console.log(`Note: no new photos for: ${mapping.missing_from_shoot.join(', ')}`)
  }

  const token = DRY_RUN ? null : await resolveAccessToken(shop)

  let uploaded = 0
  let skipped = 0
  for (const [handle, entry] of Object.entries(mapping.products)) {
    if (ONLY.size && !ONLY.has(handle)) continue
    const result = await processProduct(shop, token, sourceDir, handle, entry)
    if (result.skipped) skipped += 1
    else uploaded += 1
  }

  console.log(`\nDone. products=${uploaded} skipped=${skipped}`)
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
