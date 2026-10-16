import { scheduleAfterLoad } from '@/lib/schedule'

declare global {
  interface Window {
    dataLayer: Record<string, unknown>[]
    gtag?: (...args: unknown[]) => void
  }
}

const gtmId = (import.meta.env.VITE_GTM_ID as string | undefined)?.trim()
/** Used when GTM is absent. When GTM is set, its GA4 tag loads gtag.js instead. */
const ga4MeasurementId = (import.meta.env.VITE_GA4_MEASUREMENT_ID as string | undefined)?.trim()
/**
 * GTM's GA4 tag already loads gtag.js. A second direct snippet downloads the
 * same library again, so direct gtag runs only when GTM is not configured.
 */
const sendDirect =
  !gtmId &&
  (import.meta.env.VITE_GA4_SEND_DIRECT as string | undefined)?.trim() !== 'false' &&
  Boolean(ga4MeasurementId)

const PENDING_CHECKOUT_KEY = 'sr_pending_checkout'

type EcommerceItem = {
  item_id: string
  item_name: string
  price?: number
  quantity?: number
  item_category?: string
}

type TrackableProduct = {
  id: string
  title: string
  price: string
  handle?: string
}

export type PendingCheckout = {
  value: number
  currency: string
  items: EcommerceItem[]
  savedAt: string
}

function parseMoney(value: string | number | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (!value) return 0
  const n = Number(String(value).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

let analyticsBooted = false

function loadAnalyticsScripts(): void {
  if (analyticsBooted || typeof window === 'undefined') return
  analyticsBooted = true

  window.dataLayer = window.dataLayer ?? []

  if (gtmId) {
    window.dataLayer.push({
      'gtm.start': Date.now(),
      event: 'gtm.js',
    })
    const script = document.createElement('script')
    script.async = true
    script.src = `https://www.googletagmanager.com/gtm.js?id=${gtmId}`
    document.head.appendChild(script)
  }

  if (sendDirect && ga4MeasurementId) {
    window.gtag = function gtag(...args: unknown[]) {
      // GA4 expects the Arguments-like object pushed onto dataLayer
      window.dataLayer.push(args as unknown as Record<string, unknown>)
    }
    window.gtag('js', new Date())
    window.gtag('config', ga4MeasurementId, { send_page_view: false })
    const script = document.createElement('script')
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${ga4MeasurementId}`
    document.head.appendChild(script)
  }
}

/**
 * Defer GTM/gtag until the visitor interacts, or well after load.
 * Loading them during the initial trace adds seconds of main-thread work.
 * Events pushed before the script arrives stay queued on dataLayer.
 */
export function initGtm(): void {
  if (typeof window === 'undefined') return

  window.dataLayer = window.dataLayer ?? []

  const boot = () => loadAnalyticsScripts()
  const cancelDelay = scheduleAfterLoad(boot, 15_000)

  const onInteract = () => {
    cancelDelay()
    boot()
  }
  for (const event of ['pointerdown', 'keydown', 'touchstart'] as const) {
    window.addEventListener(event, onInteract, { once: true, passive: true })
  }
}

export function pushEvent(
  event: string,
  payload: Record<string, unknown> = {},
): void {
  if (typeof window === 'undefined') return

  window.dataLayer = window.dataLayer ?? []
  window.dataLayer.push({ event, ...payload })
}

function toItem(product: TrackableProduct, quantity = 1): EcommerceItem {
  return {
    item_id: product.id,
    item_name: product.title,
    price: parseMoney(product.price),
    quantity,
  }
}

function sendGa4Ecommerce(event: string, ecommerce: Record<string, unknown>): void {
  if (!sendDirect || !window.gtag || !ga4MeasurementId) return
  window.gtag('event', event, {
    send_to: ga4MeasurementId,
    ...ecommerce,
  })
}

/** Clear previous ecommerce object before a new ecommerce event (GA4 recommended). */
function pushEcommerce(event: string, ecommerce: Record<string, unknown>): void {
  pushEvent(event, { ecommerce: null })
  pushEvent(event, { ecommerce })
  sendGa4Ecommerce(event, ecommerce)
}

export function trackPageView(path: string, title?: string): void {
  pushEvent('page_view', {
    page_path: path,
    page_title: title ?? (typeof document !== 'undefined' ? document.title : path),
  })
  if (sendDirect && window.gtag && ga4MeasurementId) {
    window.gtag('event', 'page_view', {
      send_to: ga4MeasurementId,
      page_path: path,
      page_title: title ?? document.title,
    })
  }
}

export function trackCtaClick(name: string, location: string): void {
  pushEvent('cta_click', { cta_name: name, cta_location: location })
}

export function trackViewItemList(
  listId: string,
  listName: string,
  products: TrackableProduct[],
): void {
  pushEcommerce('view_item_list', {
    item_list_id: listId,
    item_list_name: listName,
    items: products.map((product) => toItem(product)),
  })
}

export function trackSelectItem(
  product: TrackableProduct,
  listId?: string,
  listName?: string,
): void {
  pushEcommerce('select_item', {
    item_list_id: listId,
    item_list_name: listName,
    items: [toItem(product)],
  })
}

export function trackViewItem(product: TrackableProduct): void {
  const price = parseMoney(product.price)
  pushEcommerce('view_item', {
    currency: 'USD',
    value: price,
    items: [toItem(product)],
  })
}

export function trackAddToCart(product: TrackableProduct, quantity = 1): void {
  const item = toItem(product, quantity)
  pushEcommerce('add_to_cart', {
    currency: 'USD',
    value: (item.price ?? 0) * quantity,
    items: [item],
  })
}

export function trackViewCart(
  products: Array<TrackableProduct & { quantity?: number }>,
  value?: string,
): void {
  const items = products.map((product) => toItem(product, product.quantity ?? 1))
  pushEcommerce('view_cart', {
    currency: 'USD',
    value: parseMoney(value) || items.reduce((s, i) => s + (i.price ?? 0) * (i.quantity ?? 1), 0),
    items,
  })
}

export function trackBeginCheckout(
  products: Array<TrackableProduct & { quantity?: number }>,
  value?: string,
): void {
  const items = products.map((product) => toItem(product, product.quantity ?? 1))
  const total =
    parseMoney(value) || items.reduce((s, i) => s + (i.price ?? 0) * (i.quantity ?? 1), 0)
  const ecommerce = {
    currency: 'USD',
    value: total,
    items,
  }
  pushEcommerce('begin_checkout', ecommerce)
  savePendingCheckout({
    value: total,
    currency: 'USD',
    items,
    savedAt: new Date().toISOString(),
  })
}

export function trackPurchase(input: {
  transactionId: string
  value: number
  currency?: string
  items: EcommerceItem[]
}): void {
  pushEcommerce('purchase', {
    transaction_id: input.transactionId,
    currency: input.currency ?? 'USD',
    value: input.value,
    items: input.items,
  })
}

export function savePendingCheckout(pending: PendingCheckout): void {
  try {
    sessionStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify(pending))
  } catch {
    /* ignore quota / private mode */
  }
}

export function readPendingCheckout(): PendingCheckout | null {
  try {
    const raw = sessionStorage.getItem(PENDING_CHECKOUT_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PendingCheckout
  } catch {
    return null
  }
}

export function clearPendingCheckout(): void {
  try {
    sessionStorage.removeItem(PENDING_CHECKOUT_KEY)
  } catch {
    /* ignore */
  }
}

export function trackNewsletterSubscribe(method = 'shopify_storefront'): void {
  pushEvent('newsletter_subscribe', { method })
}

export function trackContactSubmit(method = 'contact_api'): void {
  pushEvent('contact_submit', { method })
}

export const analyticsConfig = {
  gtmId: gtmId || null,
  ga4MeasurementId: ga4MeasurementId || null,
  sendDirect,
}
