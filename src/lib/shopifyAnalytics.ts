/**
 * Shopify storefront analytics for the headless SPA.
 *
 * Shopify's "Recover abandoned cart" and "abandoned browse" automations, and the
 * Sessions / Conversion reports in Shopify Admin, only see visitors who send
 * Shopify's own storefront events. A Liquid theme sends them automatically. This
 * module does the same for the SPA, following Hydrogen's implementation:
 *
 * 1. Load Shopify's Customer Privacy API script (it owns the visitor tokens and consent).
 * 2. Call the Storefront API through our own domain (`/api/unstable/graphql.json`,
 *    proxied by `scripts/serve-spa.mjs`) so Shopify issues the visitor cookies.
 * 3. Send page view, product view and add-to-cart events with `sendShopifyAnalytics`.
 *
 * Loaded lazily after the page settles, the same way GTM is, so it stays out of
 * the critical path. Events fired before it's ready queue and flush once it is.
 */
import {
  AnalyticsEventName,
  AnalyticsPageType,
  ShopifySalesChannel,
  getClientBrowserParameters,
  getTrackingValues,
  sendShopifyAnalytics,
  SHOPIFY_UNIQUE_TOKEN_HEADER,
  SHOPIFY_VISIT_TOKEN_HEADER,
} from '@shopify/hydrogen-react'

const CONSENT_API =
  'https://cdn.shopify.com/shopifycloud/consent-tracking-api/v0.2/consent-tracking-api.js'
const CONSENT_MANAGEMENT_MARKER_HEADER = 'Shopify-Storefront-Consent-Management'

const env = import.meta.env
const storefrontAccessToken = env.VITE_SHOPIFY_STOREFRONT_TOKEN?.trim() ?? ''
/** Branded checkout host (the shop's primary domain). */
const checkoutDomain = env.VITE_SHOPIFY_CHECKOUT_DOMAIN?.trim() || 'shop.sundayrollsgolf.com'
const shopId = env.VITE_SHOPIFY_SHOP_ID?.trim() || 'gid://shopify/Shop/79365439646'
/** Headless channel storefront ID; '0' is Shopify's own default when unset. */
const storefrontId = env.VITE_SHOPIFY_STOREFRONT_ID?.trim() || '0'
const DEFAULT_VENDOR = 'Sunday Rolls'
const DEFAULT_VARIANT_TITLE = 'Default Title'
const PRIVACY_API_TIMEOUT_MS = 10_000

type CustomerPrivacy = {
  setTrackingConsent: (consent: Record<string, unknown>, callback?: (r?: unknown) => void) => void
  analyticsProcessingAllowed: () => boolean
  marketingAllowed: () => boolean
  saleOfDataAllowed: () => boolean
  cachedConsent?: string
}

type ShopifyGlobal = { customerPrivacy?: CustomerPrivacy | { backendConsentEnabled: true } }

export type ShopifyAnalyticsProduct = {
  /** Product GID */
  id: string
  title: string
  /** Unit price, e.g. "45.00" or "$45.00" */
  price: string
  variantId?: string
  variantTitle?: string
  vendor?: string
  quantity?: number
}

let started = false
let ready = false
const queue: Array<() => void> = []

function getCustomerPrivacy(): CustomerPrivacy | null {
  try {
    const cp = (window as unknown as { Shopify?: ShopifyGlobal }).Shopify?.customerPrivacy
    return cp && 'setTrackingConsent' in cp ? cp : null
  } catch {
    return null
  }
}

/** Shared parent of this host and checkout, e.g. "sundayrollsgolf.com". */
function commonAncestorDomain(): string | undefined {
  const checkout = checkoutDomain.split('.').reverse()
  const current = window.location.host.split('.').reverse()
  const shared: string[] = []
  checkout.forEach((part, index) => {
    if (part === current[index]) shared.push(part)
  })
  return shared.reverse().join('.') || undefined
}

/**
 * Hydrogen's hook into the Customer Privacy script: mark backend-managed consent
 * before the script runs, and inject our headless config into setTrackingConsent.
 * Resolves once the full Customer Privacy API is installed.
 */
function installCustomerPrivacyHooks(): Promise<void> {
  return new Promise((resolve) => {
    const ancestor = commonAncestorDomain()
    const config = {
      checkoutRootDomain: window.location.host,
      storefrontRootDomain: ancestor ? `.${ancestor}` : undefined,
      storefrontAccessToken,
    }
    const w = window as unknown as { Shopify?: ShopifyGlobal }
    let customShopify = w.Shopify
    let fullCustomerPrivacy: CustomerPrivacy | null = null

    Object.defineProperty(window, 'Shopify', {
      configurable: true,
      get: () => customShopify,
      set(value: ShopifyGlobal) {
        customShopify = value
        if (typeof value !== 'object' || value === null || Object.keys(value).length > 0) return
        const backendConsentStub = { backendConsentEnabled: true as const }
        Object.defineProperty(value, 'customerPrivacy', {
          configurable: true,
          get: () => fullCustomerPrivacy ?? backendConsentStub,
          set(next: CustomerPrivacy) {
            if (typeof next !== 'object' || next === null || !('setTrackingConsent' in next)) return
            const original = next.setTrackingConsent
            fullCustomerPrivacy = {
              ...next,
              setTrackingConsent: (consent, callback) =>
                original({ ...config, headlessStorefront: true, ...consent }, callback),
            }
            customShopify = { ...customShopify, customerPrivacy: fullCustomerPrivacy }
            resolve()
          },
        })
      },
    })
  })
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.async = true
    script.src = src
    script.id = 'customer-privacy-api'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(script)
  })
}

/**
 * The `ensureCookies` request from hydrogen-react's useShopifyCookies, outside React.
 * Same origin first (our proxy); the checkout domain is the fallback for hosts
 * without the proxy, such as GitHub Pages previews.
 */
async function fetchTrackingValues(baseUrl = ''): Promise<void> {
  const { uniqueToken, visitToken } = getTrackingValues()
  const response = await fetch(`${baseUrl}/api/unstable/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': storefrontAccessToken,
      ...(baseUrl ? {} : { [CONSENT_MANAGEMENT_MARKER_HEADER]: '1' }),
      ...(visitToken || uniqueToken
        ? { [SHOPIFY_VISIT_TOKEN_HEADER]: visitToken, [SHOPIFY_UNIQUE_TOKEN_HEADER]: uniqueToken }
        : {}),
    },
    body: JSON.stringify({
      query:
        'query ensureCookies { consentManagement { cookies(visitorConsent:{}) { trackingConsentCookie cookieDomain shopifyUnique shopifyVisit } } }',
    }),
  })
  if (!response.ok) throw new Error(`ensureCookies ${response.status}`)
  // Read the body: Chrome records the resource timing entry (whose Server-Timing
  // carries the tokens the Customer Privacy script reads) only once it completes.
  await response.text()
}

/** Start Shopify analytics. Safe to call more than once. */
export async function initShopifyAnalytics(): Promise<void> {
  if (started || typeof window === 'undefined' || !storefrontAccessToken) return
  started = true

  const privacyReady = installCustomerPrivacyHooks()
  const cookiesReady = fetchTrackingValues()
    .catch(() => fetchTrackingValues(`https://${checkoutDomain}`))
    .catch((error) => console.warn('[shopify-analytics] tracking values unavailable', error))

  const privacyTimeout = new Promise<void>((resolve) => setTimeout(resolve, PRIVACY_API_TIMEOUT_MS))
  try {
    await Promise.all([
      loadScript(CONSENT_API).then(() => Promise.race([privacyReady, privacyTimeout])),
      cookiesReady,
    ])
  } catch (error) {
    console.warn('[shopify-analytics] Customer Privacy API unavailable', error)
    return
  }

  const customerPrivacy = getCustomerPrivacy()
  if (!customerPrivacy) {
    console.warn('[shopify-analytics] Customer Privacy API did not initialise')
    return
  }
  if (!customerPrivacy.cachedConsent) {
    const { consent } = getTrackingValues()
    if (consent) customerPrivacy.cachedConsent = consent
  }
  document.dispatchEvent(new CustomEvent('shopifyCustomerPrivacyApiLoaded'))

  ready = true
  for (const send of queue.splice(0)) send()
}

function whenReady(send: () => void): void {
  if (typeof window === 'undefined' || !storefrontAccessToken) return
  if (ready) send()
  else queue.push(send)
}

function basePayload() {
  const customerPrivacy = getCustomerPrivacy()
  if (!customerPrivacy) return null
  const analyticsAllowed = customerPrivacy.analyticsProcessingAllowed()
  const marketingAllowed = customerPrivacy.marketingAllowed()
  const saleOfDataAllowed = customerPrivacy.saleOfDataAllowed()
  return {
    shopifySalesChannel: ShopifySalesChannel.headless,
    shopId,
    storefrontId,
    currency: 'USD' as const,
    acceptedLanguage: 'EN' as const,
    hasUserConsent: analyticsAllowed,
    analyticsAllowed,
    marketingAllowed,
    saleOfDataAllowed,
    ccpaEnforced: !saleOfDataAllowed,
    gdprEnforced: !(marketingAllowed && analyticsAllowed),
    ...getClientBrowserParameters(),
  }
}

function parsePrice(price: string): string {
  const n = Number(String(price).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n.toFixed(2) : '0.00'
}

function formatProduct(product: ShopifyAnalyticsProduct) {
  return {
    productGid: product.id,
    variantGid: product.variantId ?? '',
    name: product.title,
    variantName: product.variantTitle ?? DEFAULT_VARIANT_TITLE,
    brand: product.vendor ?? DEFAULT_VENDOR,
    price: parsePrice(product.price),
    quantity: product.quantity ?? 1,
  }
}

export function shopifyPageView(): void {
  whenReady(() => {
    const payload = basePayload()
    if (!payload) return
    void sendShopifyAnalytics({
      eventName: AnalyticsEventName.PAGE_VIEW_2,
      payload,
    })
  })
}

export function shopifyProductView(product: ShopifyAnalyticsProduct): void {
  whenReady(() => {
    const payload = basePayload()
    if (!payload) return
    const formatted = formatProduct(product)
    void sendShopifyAnalytics({
      eventName: AnalyticsEventName.PRODUCT_VIEW,
      payload: {
        ...payload,
        pageType: AnalyticsPageType.product,
        resourceId: formatted.productGid,
        products: [formatted],
        totalValue: Number(formatted.price),
      },
    })
  })
}

export function shopifyAddToCart(cartId: string, product: ShopifyAnalyticsProduct): void {
  whenReady(() => {
    const payload = basePayload()
    if (!payload) return
    const formatted = formatProduct(product)
    void sendShopifyAnalytics({
      eventName: AnalyticsEventName.ADD_TO_CART,
      payload: {
        ...payload,
        cartId,
        products: [formatted],
        totalValue: Number(formatted.price) * formatted.quantity,
      },
    })
  })
}

/**
 * Headers that tie Storefront API cart requests to this visitor's Shopify session,
 * so checkout (and its abandoned-checkout email) continues the same visit.
 */
export function shopifyTrackingHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const { uniqueToken, visitToken } = getTrackingValues()
  if (!uniqueToken && !visitToken) return {}
  return { [SHOPIFY_UNIQUE_TOKEN_HEADER]: uniqueToken, [SHOPIFY_VISIT_TOKEN_HEADER]: visitToken }
}
