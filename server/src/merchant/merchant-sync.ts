/**
 * Shopify → Google Merchant Center product sync.
 *
 * Why this exists: the storefront is headless. Shopify's primary domain
 * (shop.sundayrollsgolf.com) redirects to the React site at
 * www.sundayrollsgolf.com, so the official Google & YouTube app can't verify
 * or claim the domain, and its product links would not match the claimed
 * website. This sync reads products from the Shopify Admin API and pushes them
 * to a Merchant API data source with links on the real storefront domain.
 *
 * Runbook: docs/GOOGLE_MERCHANT_SYNC.md
 */
import { GoogleAuth } from 'google-auth-library'
import { createShopifyAccessToken, type ShopifyCredentials } from '../analytics/shopify.js'

const MERCHANT_API = 'https://merchantapi.googleapis.com'
const CONTENT_SCOPE = 'https://www.googleapis.com/auth/content'

export type MerchantSyncConfig = {
  merchantId: string
  /** Numeric data source ID, or full `accounts/{a}/dataSources/{id}` name. */
  dataSourceId: string
  siteOrigin: string
  feedLabel: string
  contentLanguage: string
  currency: string
  /** Prefix for offer IDs this sync owns (used to prune deleted products safely). */
  offerIdPrefix: string
  /** Only sync products published to the sales channel whose name contains this (empty = all active). */
  publicationMatch: string
}

export function loadMerchantConfigFromEnv(env: NodeJS.ProcessEnv = process.env): MerchantSyncConfig {
  return {
    merchantId: (env.MERCHANT_CENTER_ID || '').trim(),
    dataSourceId: (env.MERCHANT_DATA_SOURCE_ID || '').trim(),
    siteOrigin: (env.MERCHANT_SITE_ORIGIN || 'https://www.sundayrollsgolf.com').trim().replace(/\/+$/, ''),
    feedLabel: (env.MERCHANT_FEED_LABEL || 'US').trim(),
    contentLanguage: (env.MERCHANT_CONTENT_LANGUAGE || 'en').trim(),
    currency: (env.MERCHANT_CURRENCY || 'USD').trim(),
    offerIdPrefix: (env.MERCHANT_OFFER_ID_PREFIX || 'shopify_').trim(),
    publicationMatch: (env.MERCHANT_SHOPIFY_CHANNEL ?? 'Headless').trim(),
  }
}

// ---------------------------------------------------------------------------
// Shopify
// ---------------------------------------------------------------------------

export type ShopifyVariantNode = {
  id: string
  title: string
  sku: string | null
  barcode: string | null
  price: string
  compareAtPrice: string | null
  availableForSale: boolean
  media?: { nodes: Array<{ image?: { url: string } | null }> }
  selectedOptions: Array<{ name: string; value: string }>
}

export type ShopifyProductNode = {
  id: string
  handle: string
  title: string
  description: string
  vendor: string
  productType: string
  status: string
  publishedOnChannel?: boolean
  media: { nodes: Array<{ image?: { url: string } | null }> }
  variants: { nodes: ShopifyVariantNode[] }
}

function shopHost(shop: string): string {
  const trimmed = shop.trim().replace(/^https?:\/\//, '')
  return trimmed.includes('.') ? trimmed : `${trimmed}.myshopify.com`
}

async function shopifyGraphql<T>(
  creds: ShopifyCredentials,
  accessToken: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const version = creds.apiVersion || '2025-01'
  const res = await fetch(`https://${shopHost(creds.shop)}/admin/api/${version}/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const json = (await res.json()) as { data?: T; errors?: Array<{ message?: string }> }
  if (!res.ok || json.errors?.length) {
    throw new Error(json.errors?.[0]?.message || `Shopify GraphQL failed (${res.status})`)
  }
  return json.data as T
}

async function findPublicationId(
  creds: ShopifyCredentials,
  accessToken: string,
  match: string,
): Promise<string | null> {
  if (!match) return null
  const data = await shopifyGraphql<{
    publications: { nodes: Array<{ id: string; name: string; catalog: { title: string } | null }> }
  }>(creds, accessToken, `{ publications(first: 50) { nodes { id name catalog { title } } } }`)
  // Channel apps (e.g. the Headless storefront) have no catalog, so match on the publication name too.
  const hit = data.publications.nodes.find((p) =>
    [p.catalog?.title, p.name].some((t) => (t ?? '').toLowerCase().includes(match.toLowerCase())),
  )
  if (!hit) throw new Error(`No Shopify sales channel matching "${match}" (set MERCHANT_SHOPIFY_CHANNEL= to sync all)`)
  return hit.id
}

export async function fetchShopifyProductsForMerchant(
  creds: ShopifyCredentials,
  publicationMatch: string,
): Promise<ShopifyProductNode[]> {
  const { accessToken } = await createShopifyAccessToken(creds)
  const publicationId = await findPublicationId(creds, accessToken, publicationMatch)
  const channelField = publicationId ? 'publishedOnChannel: publishedOnPublication(publicationId: $pub)' : ''
  const query = `#graphql
    query MerchantProducts($cursor: String${publicationId ? ', $pub: ID!' : ''}) {
      products(first: 50, after: $cursor, query: "status:active") {
        pageInfo { hasNextPage endCursor }
        nodes {
          id handle title description vendor productType status
          ${channelField}
          media(first: 11) { nodes { ... on MediaImage { image { url } } } }
          variants(first: 100) {
            nodes {
              id title sku barcode price compareAtPrice availableForSale
              media(first: 1) { nodes { ... on MediaImage { image { url } } } }
              selectedOptions { name value }
            }
          }
        }
      }
    }`
  const out: ShopifyProductNode[] = []
  let cursor: string | null = null
  for (;;) {
    const data: {
      products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ShopifyProductNode[] }
    } = await shopifyGraphql(creds, accessToken, query, { cursor, ...(publicationId ? { pub: publicationId } : {}) })
    for (const p of data.products.nodes) {
      if (publicationId && !p.publishedOnChannel) continue
      out.push(p)
    }
    if (!data.products.pageInfo.hasNextPage) break
    cursor = data.products.pageInfo.endCursor
  }
  return out
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

export type MerchantPrice = { amountMicros: string; currencyCode: string }

export type MerchantProductInput = {
  offerId: string
  contentLanguage: string
  feedLabel: string
  productAttributes: {
    title: string
    description: string
    link: string
    imageLink?: string
    additionalImageLinks?: string[]
    availability: 'IN_STOCK' | 'OUT_OF_STOCK'
    condition: 'NEW'
    price: MerchantPrice
    salePrice?: MerchantPrice
    brand?: string
    gtins?: string[]
    mpn?: string
    identifierExists?: boolean
    itemGroupId?: string
    productTypes?: string[]
    color?: string
    size?: string
  }
}

export function gidNumber(gid: string): string {
  return gid.split('/').pop() ?? gid
}

export function toMicros(amount: string): string {
  const [whole, frac = ''] = amount.trim().split('.')
  const micros = BigInt(whole || '0') * 1_000_000n + BigInt((frac + '000000').slice(0, 6))
  return micros.toString()
}

function isValidGtin(code: string | null): code is string {
  return !!code && /^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(code.trim())
}

function cleanText(text: string, max: number): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, max)
}

export function shopifyProductToMerchantInputs(
  product: ShopifyProductNode,
  config: Pick<MerchantSyncConfig, 'siteOrigin' | 'feedLabel' | 'contentLanguage' | 'currency' | 'offerIdPrefix'>,
): MerchantProductInput[] {
  const productNum = gidNumber(product.id)
  const variants = product.variants.nodes
  const multi = variants.length > 1
  const productImages = product.media.nodes.flatMap((m) => (m.image?.url ? [m.image.url] : []))
  const baseLink = `${config.siteOrigin}/products/${product.handle}/`

  return variants.map((v) => {
    const variantNum = gidNumber(v.id)
    const options = v.selectedOptions.filter((o) => o.value !== 'Default Title')
    const optionLabel = options.map((o) => o.value).join(' / ')
    const title = multi && optionLabel ? `${product.title} - ${optionLabel}` : product.title

    const primaryImage = v.media?.nodes.find((m) => m.image?.url)?.image?.url ?? productImages[0]
    const additional = productImages.filter((u) => u !== primaryImage).slice(0, 10)

    const compareAt = v.compareAtPrice && Number(v.compareAtPrice) > Number(v.price) ? v.compareAtPrice : null
    const regular = compareAt ?? v.price

    const attrs: MerchantProductInput['productAttributes'] = {
      title: cleanText(title, 150),
      description: cleanText(product.description || product.title, 5000),
      link: multi ? `${baseLink}?variant=${variantNum}` : baseLink,
      availability: v.availableForSale ? 'IN_STOCK' : 'OUT_OF_STOCK',
      condition: 'NEW',
      price: { amountMicros: toMicros(regular), currencyCode: config.currency },
    }
    if (primaryImage) attrs.imageLink = primaryImage
    if (additional.length) attrs.additionalImageLinks = additional
    if (compareAt) attrs.salePrice = { amountMicros: toMicros(v.price), currencyCode: config.currency }
    if (product.vendor) attrs.brand = product.vendor
    if (product.productType) attrs.productTypes = [product.productType]
    if (multi) attrs.itemGroupId = `${config.offerIdPrefix}${productNum}`
    if (isValidGtin(v.barcode)) attrs.gtins = [v.barcode.trim()]
    if (v.sku) attrs.mpn = v.sku
    // Own-brand handmade goods: no manufacturer GTIN exists.
    if (!attrs.gtins && !v.sku) attrs.identifierExists = false
    for (const o of options) {
      const name = o.name.toLowerCase()
      if (name === 'color' || name === 'colour') attrs.color = o.value
      if (name === 'size') attrs.size = o.value
    }

    return {
      offerId: `${config.offerIdPrefix}${productNum}_${variantNum}`,
      contentLanguage: config.contentLanguage,
      feedLabel: config.feedLabel,
      productAttributes: attrs,
    }
  })
}

// ---------------------------------------------------------------------------
// Merchant API
// ---------------------------------------------------------------------------

export async function createMerchantAccessToken(serviceAccountJson: string): Promise<string> {
  const auth = new GoogleAuth({ credentials: JSON.parse(serviceAccountJson), scopes: [CONTENT_SCOPE] })
  const client = await auth.getClient()
  const token = await client.getAccessToken()
  if (!token.token) throw new Error('Failed to obtain Merchant API access token')
  return token.token
}

async function merchantFetch<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${MERCHANT_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  const json = text ? (JSON.parse(text) as T & { error?: { message?: string } }) : ({} as T)
  if (!res.ok) {
    const msg = (json as { error?: { message?: string } }).error?.message
    throw new Error(`Merchant API ${method} ${path} → ${res.status}: ${msg ?? text.slice(0, 300)}`)
  }
  return json
}

export function dataSourceName(merchantId: string, dataSourceId: string): string {
  return dataSourceId.startsWith('accounts/') ? dataSourceId : `accounts/${merchantId}/dataSources/${dataSourceId}`
}

/** One-time: link the service account's GCP project to the Merchant Center account. */
export async function registerGcp(token: string, merchantId: string, developerEmail: string) {
  return merchantFetch(token, 'POST', `/accounts/v1/accounts/${merchantId}/developerRegistration:registerGcp`, {
    developerEmail,
  })
}

/** One-time: create the API primary data source this sync writes into. */
export async function createApiDataSource(
  token: string,
  config: MerchantSyncConfig,
  displayName = 'Shopify (website sync)',
): Promise<{ name: string; dataSourceId: string }> {
  return merchantFetch(token, 'POST', `/datasources/v1/accounts/${config.merchantId}/dataSources`, {
    displayName,
    primaryProductDataSource: {
      contentLanguage: config.contentLanguage,
      feedLabel: config.feedLabel,
      countries: [config.feedLabel],
    },
  })
}

export async function insertProductInput(token: string, config: MerchantSyncConfig, input: MerchantProductInput) {
  const ds = encodeURIComponent(dataSourceName(config.merchantId, config.dataSourceId))
  return merchantFetch(
    token,
    'POST',
    `/products/v1/accounts/${config.merchantId}/productInputs:insert?dataSource=${ds}`,
    input,
  )
}

type MerchantProduct = { name: string; offerId: string; dataSource: string; contentLanguage: string; feedLabel: string }

async function listOwnedProducts(token: string, config: MerchantSyncConfig): Promise<MerchantProduct[]> {
  const ds = dataSourceName(config.merchantId, config.dataSourceId)
  const out: MerchantProduct[] = []
  let pageToken = ''
  for (;;) {
    const qs = new URLSearchParams({ pageSize: '1000' })
    if (pageToken) qs.set('pageToken', pageToken)
    const page = await merchantFetch<{ products?: MerchantProduct[]; nextPageToken?: string }>(
      token,
      'GET',
      `/products/v1/accounts/${config.merchantId}/products?${qs}`,
    )
    for (const p of page.products ?? []) {
      if (p.dataSource === ds && p.offerId.startsWith(config.offerIdPrefix)) out.push(p)
    }
    if (!page.nextPageToken) break
    pageToken = page.nextPageToken
  }
  return out
}

async function deleteProductInput(token: string, config: MerchantSyncConfig, p: MerchantProduct) {
  const id = `${p.contentLanguage}~${p.feedLabel}~${p.offerId}`
  const ds = encodeURIComponent(dataSourceName(config.merchantId, config.dataSourceId))
  return merchantFetch(
    token,
    'DELETE',
    `/products/v1/accounts/${config.merchantId}/productInputs/${encodeURIComponent(id)}?dataSource=${ds}`,
  )
}

export type SyncResult = {
  shopifyProducts: number
  offers: number
  inserted: number
  failed: Array<{ offerId: string; error: string }>
  pruned: string[]
  dryRun: boolean
}

export async function syncMerchant(options: {
  shopify: ShopifyCredentials
  serviceAccountJson: string
  config: MerchantSyncConfig
  dryRun?: boolean
  prune?: boolean
  log?: (msg: string) => void
}): Promise<SyncResult> {
  const { config, dryRun = false, prune = true, log = console.log } = options
  const products = await fetchShopifyProductsForMerchant(options.shopify, config.publicationMatch)
  const inputs = products.flatMap((p) => shopifyProductToMerchantInputs(p, config))
  const result: SyncResult = {
    shopifyProducts: products.length,
    offers: inputs.length,
    inserted: 0,
    failed: [],
    pruned: [],
    dryRun,
  }
  if (dryRun) {
    for (const i of inputs) {
      const a = i.productAttributes
      log(`[dry-run] ${i.offerId}  ${a.title}  $${Number(a.price.amountMicros) / 1e6}  ${a.availability}  ${a.link}`)
    }
    return result
  }

  const token = await createMerchantAccessToken(options.serviceAccountJson)
  for (const input of inputs) {
    try {
      await insertProductInput(token, config, input)
      result.inserted++
      log(`✓ ${input.offerId}  ${input.productAttributes.title}`)
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      result.failed.push({ offerId: input.offerId, error })
      log(`✗ ${input.offerId}  ${error}`)
    }
  }

  // Only prune when every insert succeeded, so a partial outage never wipes the feed.
  if (prune && result.failed.length === 0) {
    const current = new Set(inputs.map((i) => i.offerId))
    for (const p of await listOwnedProducts(token, config)) {
      if (current.has(p.offerId)) continue
      await deleteProductInput(token, config, p)
      result.pruned.push(p.offerId)
      log(`− removed ${p.offerId} (no longer active in Shopify)`)
    }
  }
  return result
}
