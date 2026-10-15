export type ShopifyCredentials = {
  shop: string
  clientId: string
  clientSecret: string
  apiVersion?: string
}

export type ShopifyOrderRaw = {
  id: number
  name: string
  created_at: string
  financial_status: string | null
  total_price: string
  total_discounts?: string
  subtotal_price?: string
  total_shipping_price_set?: { shop_money?: { amount?: string } }
  total_tax?: string
  email?: string | null
  customer?: { email?: string | null } | null
  shipping_address?: { province_code?: string | null; province?: string | null } | null
  line_items?: Array<{
    title?: string
    name?: string
    sku?: string | null
    quantity?: number
    price?: string
    product_id?: number | null
  }>
  note_attributes?: Array<{ name?: string; value?: string }>
  tags?: string
  source_name?: string | null
  referring_site?: string | null
  landing_site?: string | null
}

function shopHost(shop: string): string {
  const trimmed = shop.trim().replace(/^https?:\/\//, '')
  if (trimmed.includes('.')) return trimmed
  return `${trimmed}.myshopify.com`
}

export function loadShopifyCredentialsFromEnv(env: NodeJS.ProcessEnv = process.env): ShopifyCredentials | null {
  const shop = (env.SHOPIFY_STORE_DOMAIN || env.SHOPIFY_SHOP || env.VITE_SHOPIFY_STORE_DOMAIN || '').trim()
  const clientId = (env.SHOPIFY_CLIENT_ID || '').trim()
  const clientSecret = (env.SHOPIFY_CLIENT_SECRET || '').trim()
  if (!shop || !clientId || !clientSecret) return null
  return {
    shop,
    clientId,
    clientSecret,
    apiVersion: (env.SHOPIFY_API_VERSION || env.VITE_SHOPIFY_API_VERSION || '2025-01').trim(),
  }
}

/** Dev Dashboard / custom apps: mint a short-lived Admin API token. */
export async function createShopifyAccessToken(creds: ShopifyCredentials): Promise<{
  accessToken: string
  expiresIn: number
  scope: string
}> {
  const host = shopHost(creds.shop)
  const res = await fetch(`https://${host}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      grant_type: 'client_credentials',
    }),
  })
  const data = (await res.json()) as {
    access_token?: string
    expires_in?: number
    scope?: string
    errors?: unknown
  }
  if (!res.ok || !data.access_token) {
    throw new Error(
      typeof data.errors === 'string'
        ? data.errors
        : `Shopify token exchange failed (${res.status})`,
    )
  }
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in ?? 0,
    scope: data.scope ?? '',
  }
}

async function shopifyGet<T>(
  creds: ShopifyCredentials,
  accessToken: string,
  path: string,
): Promise<T> {
  const host = shopHost(creds.shop)
  const version = creds.apiVersion || '2025-01'
  const url = path.startsWith('http') ? path : `https://${host}/admin/api/${version}${path}`
  const res = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
  })
  const data = (await res.json()) as T & { errors?: unknown }
  if (!res.ok) {
    throw new Error(
      typeof data.errors === 'string' ? data.errors : `Shopify API ${res.status} for ${path}`,
    )
  }
  return data
}

export async function fetchShopifyOrders(
  creds: ShopifyCredentials,
  options?: { createdAtMin?: string; createdAtMax?: string; limit?: number },
): Promise<ShopifyOrderRaw[]> {
  const { accessToken } = await createShopifyAccessToken(creds)
  const orders: ShopifyOrderRaw[] = []
  const params = new URLSearchParams({
    status: 'any',
    limit: String(Math.max(1, Math.min(options?.limit ?? 250, 250))),
  })
  if (options?.createdAtMin) params.set('created_at_min', options.createdAtMin)
  if (options?.createdAtMax) params.set('created_at_max', options.createdAtMax)

  let path: string | null = `/orders.json?${params}`
  let pages = 0
  while (path && pages < 40) {
    pages += 1
    const host = shopHost(creds.shop)
    const version = creds.apiVersion || '2025-01'
    const res = await fetch(`https://${host}/admin/api/${version}${path}`, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    })
    const data = (await res.json()) as { orders?: ShopifyOrderRaw[]; errors?: unknown }
    if (!res.ok) {
      throw new Error(
        typeof data.errors === 'string' ? data.errors : `Shopify orders failed (${res.status})`,
      )
    }
    orders.push(...(data.orders ?? []))
    const link = res.headers.get('link') || res.headers.get('Link') || ''
    const next = /<([^>]+)>;\s*rel="next"/.exec(link)
    if (next) {
      // Absolute URL from Shopify pagination
      const nextUrl = next[1]
      const u = new URL(nextUrl)
      path = u.pathname.replace(`/admin/api/${version}`, '') + u.search
    } else {
      path = null
    }
  }
  return orders
}

export async function pingShopifyShop(creds: ShopifyCredentials): Promise<{
  name: string
  domain: string
  myshopifyDomain: string
}> {
  const { accessToken } = await createShopifyAccessToken(creds)
  const data = await shopifyGet<{ shop: { name: string; domain: string; myshopify_domain: string } }>(
    creds,
    accessToken,
    '/shop.json',
  )
  return {
    name: data.shop.name,
    domain: data.shop.domain,
    myshopifyDomain: data.shop.myshopify_domain,
  }
}
