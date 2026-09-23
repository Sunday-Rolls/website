declare global {
  interface Window {
    dataLayer: Record<string, unknown>[]
  }
}

const gtmId = import.meta.env.VITE_GTM_ID

type EcommerceItem = {
  item_id: string
  item_name: string
  price?: string | number
  quantity?: number
  item_category?: string
}

type TrackableProduct = {
  id: string
  title: string
  price: string
  handle?: string
}

export function initGtm(): void {
  if (!gtmId || typeof window === 'undefined') return

  window.dataLayer = window.dataLayer ?? []
  window.dataLayer.push({
    'gtm.start': Date.now(),
    event: 'gtm.js',
  })

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtm.js?id=${gtmId}`
  document.head.appendChild(script)
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
    price: product.price,
    quantity,
  }
}

/** Clear previous ecommerce object before a new ecommerce event (GA4 recommended). */
function pushEcommerce(event: string, ecommerce: Record<string, unknown>): void {
  pushEvent(event, { ecommerce: null })
  pushEvent(event, { ecommerce })
}

export function trackPageView(path: string, title?: string): void {
  pushEvent('page_view', {
    page_path: path,
    page_title: title ?? (typeof document !== 'undefined' ? document.title : path),
  })
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
  pushEcommerce('view_item', {
    items: [toItem(product)],
  })
}

export function trackAddToCart(product: TrackableProduct, quantity = 1): void {
  pushEcommerce('add_to_cart', {
    items: [toItem(product, quantity)],
  })
}

export function trackViewCart(
  products: Array<TrackableProduct & { quantity?: number }>,
  value?: string,
): void {
  pushEcommerce('view_cart', {
    currency: 'USD',
    value,
    items: products.map((product) => toItem(product, product.quantity ?? 1)),
  })
}

export function trackBeginCheckout(
  products: Array<TrackableProduct & { quantity?: number }>,
  value?: string,
): void {
  pushEcommerce('begin_checkout', {
    currency: 'USD',
    value,
    items: products.map((product) => toItem(product, product.quantity ?? 1)),
  })
}

export function trackNewsletterSubscribe(method = 'shopify_storefront'): void {
  pushEvent('newsletter_subscribe', { method })
}

export function trackContactSubmit(method = 'contact_api'): void {
  pushEvent('contact_submit', { method })
}
