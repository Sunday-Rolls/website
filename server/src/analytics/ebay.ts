/**
 * eBay Sell APIs client: OAuth (refresh token → access token), Fulfillment getOrders and
 * Finances getTransactions. Read-only. Runbook: docs/EBAY_SYNC.md.
 *
 * Setup: a production keyset (App ID = client id, Cert ID = client secret) from
 * developer.ebay.com and a user refresh token for the Sunday Rolls seller account
 * (valid ~18 months), with the sell.fulfillment.readonly and sell.finances scopes.
 */
import type { EbayOrderDetail, EbayOrderLine } from './types.js'

export type EbayCredentials = {
  clientId: string
  clientSecret: string
  refreshToken: string
  /** Space-separated OAuth scopes; defaults to fulfillment (read) + finances. */
  scopes?: string
}

export const EBAY_SCOPES = [
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.finances',
]

/** Requested only at sign-in, so the connect page can show which eBay account was linked. */
export const EBAY_IDENTITY_SCOPE = 'https://api.ebay.com/oauth/api_scope/commerce.identity.readonly'

const API = 'https://api.ebay.com'
const FINANCES_API = 'https://apiz.ebay.com'
const MARKETPLACE = 'EBAY_US'

export function ebayMissingEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  const missing = ['EBAY_CLIENT_ID', 'EBAY_CLIENT_SECRET', 'EBAY_REFRESH_TOKEN'].filter((k) => !env[k]?.trim())
  return missing.length ? missing.join(', ') : null
}

export function loadEbayCredentialsFromEnv(env: NodeJS.ProcessEnv = process.env): EbayCredentials | null {
  if (ebayMissingEnv(env)) return null
  return {
    clientId: env.EBAY_CLIENT_ID!.trim(),
    clientSecret: env.EBAY_CLIENT_SECRET!.trim(),
    refreshToken: env.EBAY_REFRESH_TOKEN!.trim(),
    scopes: env.EBAY_SCOPES?.trim() || undefined,
  }
}

// --- Raw API shapes (only the fields we read) ---

export type EbayAmount = { value?: string | number | null; currency?: string | null }

export type EbayLineItemRaw = {
  lineItemId: string
  legacyItemId?: string | null
  sku?: string | null
  title?: string | null
  quantity?: number | null
  lineItemCost?: EbayAmount | null
  total?: EbayAmount | null
}

export type EbayOrderRaw = {
  orderId: string
  creationDate: string
  orderFulfillmentStatus?: string | null
  orderPaymentStatus?: string | null
  cancelStatus?: { cancelState?: string | null } | null
  pricingSummary?: {
    priceSubtotal?: EbayAmount | null
    deliveryCost?: EbayAmount | null
    priceDiscount?: EbayAmount | null
    tax?: EbayAmount | null
    total?: EbayAmount | null
  } | null
  totalMarketplaceFee?: EbayAmount | null
  paymentSummary?: { refunds?: Array<{ amount?: EbayAmount | null; refundStatus?: string | null }> | null } | null
  fulfillmentStartInstructions?: Array<{
    shippingStep?: { shipTo?: { contactAddress?: { stateOrProvince?: string | null; countryCode?: string | null } | null } | null } | null
  }> | null
  lineItems?: EbayLineItemRaw[] | null
}

export type EbayTransactionRaw = {
  transactionId?: string | null
  orderId?: string | null
  transactionType?: string | null
  bookingEntry?: string | null
  amount?: EbayAmount | null
  totalFeeAmount?: EbayAmount | null
  feeType?: string | null
  transactionDate?: string | null
  references?: Array<{ referenceId?: string | null; referenceType?: string | null }> | null
}

// --- Mapping ---

const round2 = (n: number) => Math.round(n * 100) / 100

export function ebayMoney(a: EbayAmount | null | undefined): number {
  const n = Number(a?.value)
  return Number.isFinite(n) ? round2(n) : 0
}

export function mapEbayLine(raw: EbayLineItemRaw): EbayOrderLine {
  const quantity = raw.quantity ?? 1
  const lineRevenue = ebayMoney(raw.lineItemCost)
  return {
    lineItemId: String(raw.lineItemId),
    itemId: raw.legacyItemId ? String(raw.legacyItemId) : null,
    title: (raw.title ?? '').trim() || 'eBay item',
    sku: raw.sku?.trim() || null,
    quantity,
    unitPrice: quantity > 0 ? round2(lineRevenue / quantity) : lineRevenue,
    lineRevenue,
  }
}

/** Per-order costs from the Finances API (null fields = nothing found for the order). */
export type EbayOrderCosts = { fees: number | null; label: number | null; ads: number | null }

export function mapEbayOrder(raw: EbayOrderRaw, costs?: EbayOrderCosts | null): EbayOrderDetail {
  const p = raw.pricingSummary ?? {}
  const address = raw.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo?.contactAddress
  const country = (address?.countryCode ?? '').trim().toUpperCase()
  const refunded = round2(
    (raw.paymentSummary?.refunds ?? [])
      .filter((r) => !r.refundStatus || r.refundStatus.toUpperCase() !== 'FAILED')
      .reduce((s, r) => s + ebayMoney(r.amount), 0),
  )
  const orderFee = raw.totalMarketplaceFee ? ebayMoney(raw.totalMarketplaceFee) : null
  return {
    orderId: raw.orderId,
    orderedAt: new Date(raw.creationDate).toISOString(),
    fulfillmentStatus: (raw.orderFulfillmentStatus ?? '').trim().toLowerCase(),
    paymentStatus: (raw.orderPaymentStatus ?? '').trim().toLowerCase(),
    cancelState: (raw.cancelStatus?.cancelState ?? '').trim().toLowerCase(),
    state: country === 'US' || !country ? address?.stateOrProvince?.trim() || null : null,
    itemSubtotal: ebayMoney(p.priceSubtotal),
    shippingCharged: ebayMoney(p.deliveryCost),
    discount: Math.abs(ebayMoney(p.priceDiscount)),
    tax: ebayMoney(p.tax),
    total: ebayMoney(p.total),
    refunded,
    marketplaceFees: costs?.fees ?? orderFee,
    labelCost: costs?.label ?? null,
    adFees: costs?.ads ?? null,
    lines: (raw.lineItems ?? []).map(mapEbayLine),
  }
}

/** Cancelled and fully refunded orders are not sales. */
export function isCountedEbayOrder(o: Pick<EbayOrderDetail, 'cancelState' | 'paymentStatus'>): boolean {
  return o.cancelState !== 'canceled' && o.paymentStatus !== 'fully_refunded'
}

/** Revenue as the sheet counts it: items − discounts + shipping charged − refunds (eBay remits the tax). */
export function ebayRevenue(o: EbayOrderDetail): number {
  if (!isCountedEbayOrder(o)) return 0
  return round2(Math.max(0, o.itemSubtotal - o.discount + o.shippingCharged - o.refunded))
}

function transactionOrderId(t: EbayTransactionRaw): string | null {
  if (t.orderId) return String(t.orderId)
  const ref = (t.references ?? []).find((r) => (r.referenceType ?? '').toUpperCase() === 'ORDER_ID' && r.referenceId)
  return ref?.referenceId ? String(ref.referenceId) : null
}

/** Sale fees, label costs and Promoted Listings fees per order from Finances transactions. */
export function ebayCostsByOrder(transactions: EbayTransactionRaw[]): Map<string, EbayOrderCosts> {
  const out = new Map<string, EbayOrderCosts>()
  const add = (orderId: string, key: keyof EbayOrderCosts, amount: number) => {
    const c = out.get(orderId) ?? { fees: null, label: null, ads: null }
    c[key] = round2((c[key] ?? 0) + amount)
    out.set(orderId, c)
  }
  for (const t of transactions) {
    const orderId = transactionOrderId(t)
    if (!orderId) continue
    const type = (t.transactionType ?? '').toUpperCase()
    const sign = (t.bookingEntry ?? '').toUpperCase() === 'CREDIT' ? -1 : 1
    if (type === 'SALE') {
      if (t.totalFeeAmount) add(orderId, 'fees', ebayMoney(t.totalFeeAmount))
    } else if (type === 'SHIPPING_LABEL') {
      add(orderId, 'label', sign * Math.abs(ebayMoney(t.amount)))
    } else if (type === 'NON_SALE_CHARGE' && (t.feeType ?? '').toUpperCase().startsWith('AD_FEE')) {
      add(orderId, 'ads', sign * Math.abs(ebayMoney(t.amount)))
    }
  }
  return out
}

// --- HTTP ---

async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  try {
    const body = JSON.parse(text) as {
      error?: string
      error_description?: string
      errors?: Array<{ message?: string; longMessage?: string }>
    }
    return body.error_description || body.errors?.[0]?.longMessage || body.errors?.[0]?.message || body.error || text.slice(0, 200)
  } catch {
    return text.slice(0, 200)
  }
}

/** eBay's sign-in link for the one-time connect step. `ruName` is the redirect_uri eBay expects. */
export function ebayAuthorizeUrl(clientId: string, ruName: string, state: string, scopes: string[] = [...EBAY_SCOPES, EBAY_IDENTITY_SCOPE]): string {
  const url = new URL('https://auth.ebay.com/oauth2/authorize')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', ruName)
  url.searchParams.set('scope', scopes.join(' '))
  url.searchParams.set('state', state)
  return url.toString()
}

/** Swap the code eBay sends back for tokens (codes last ~5 minutes and work once). */
export async function exchangeEbayCode(
  clientId: string,
  clientSecret: string,
  code: string,
  ruName: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ accessToken: string; refreshToken: string; refreshExpiresInSec: number | null }> {
  const res = await fetchImpl(`${API}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: ruName }).toString(),
  })
  if (!res.ok) throw new Error(`eBay sign-in failed (${res.status}): ${await readError(res)}`)
  const data = (await res.json()) as { access_token?: string; refresh_token?: string; refresh_token_expires_in?: number }
  if (!data.access_token || !data.refresh_token) throw new Error('eBay returned no refresh token.')
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    refreshExpiresInSec: typeof data.refresh_token_expires_in === 'number' ? data.refresh_token_expires_in : null,
  }
}

/** The eBay username behind a user access token (needs the commerce.identity.readonly scope). */
export async function fetchEbayUsername(token: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const data = await getJson<{ username?: string }>(`${FINANCES_API}/commerce/identity/v1/user/`, token, fetchImpl)
  return data.username?.trim() || null
}

/** Mint a short-lived user access token from the refresh token. */
export async function getEbayAccessToken(creds: EbayCredentials, fetchImpl: typeof fetch = fetch): Promise<string> {
  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64')
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: creds.refreshToken,
    scope: creds.scopes || EBAY_SCOPES.join(' '),
  })
  const res = await fetchImpl(`${API}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) throw new Error(`eBay token ${res.status}: ${await readError(res)}`)
  const data = (await res.json()) as { access_token?: string }
  if (!data.access_token) throw new Error('eBay token response had no access_token')
  return data.access_token
}

async function getJson<T>(url: string, token: string, fetchImpl: typeof fetch): Promise<T> {
  const res = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'X-EBAY-C-MARKETPLACE-ID': MARKETPLACE },
  })
  if (!res.ok) throw new Error(`eBay ${res.status}: ${await readError(res)}`)
  return (await res.json()) as T
}

const isoMs = (ms: number) => new Date(ms).toISOString()

/** Orders created at or after `fromMs` (getOrders allows up to two years back), oldest page first. */
export async function fetchEbayOrders(
  token: string,
  options: { fromMs: number; fetchImpl?: typeof fetch },
): Promise<EbayOrderRaw[]> {
  const fetchImpl = options.fetchImpl ?? fetch
  const limit = 200
  const filter = encodeURIComponent(`creationdate:[${isoMs(options.fromMs)}..]`)
  const out: EbayOrderRaw[] = []
  for (let offset = 0; offset < 50_000; offset += limit) {
    const page = await getJson<{ orders?: EbayOrderRaw[]; total?: number }>(
      `${API}/sell/fulfillment/v1/order?filter=${filter}&limit=${limit}&offset=${offset}`,
      token,
      fetchImpl,
    )
    const orders = page.orders ?? []
    out.push(...orders)
    if (!orders.length || offset + limit >= (page.total ?? 0)) break
  }
  return out
}

const WINDOW_MS = 90 * 86_400_000

/** Finances transactions between `fromMs` and `toMs`, read in 90-day windows. */
export async function fetchEbayTransactions(
  token: string,
  options: { fromMs: number; toMs: number; fetchImpl?: typeof fetch },
): Promise<EbayTransactionRaw[]> {
  const fetchImpl = options.fetchImpl ?? fetch
  const limit = 1000
  const out: EbayTransactionRaw[] = []
  for (let start = options.fromMs; start < options.toMs; start += WINDOW_MS) {
    const end = Math.min(options.toMs, start + WINDOW_MS)
    const filter = encodeURIComponent(`transactionDate:[${isoMs(start)}..${isoMs(end)}]`)
    for (let offset = 0; offset < 100_000; offset += limit) {
      const page = await getJson<{ transactions?: EbayTransactionRaw[]; total?: number }>(
        `${FINANCES_API}/sell/finances/v1/transaction?filter=${filter}&limit=${limit}&offset=${offset}`,
        token,
        fetchImpl,
      )
      const rows = page.transactions ?? []
      out.push(...rows)
      if (!rows.length || offset + limit >= (page.total ?? 0)) break
    }
  }
  return out
}
