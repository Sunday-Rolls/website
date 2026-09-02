declare global {
  interface Window {
    dataLayer: Record<string, unknown>[]
  }
}

const gtmId = import.meta.env.VITE_GTM_ID

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

export function trackCtaClick(name: string, location: string): void {
  pushEvent('cta_click', { cta_name: name, cta_location: location })
}

export function trackViewItem(product: {
  id: string
  title: string
  price: string
}): void {
  pushEvent('view_item', {
    ecommerce: {
      items: [
        {
          item_id: product.id,
          item_name: product.title,
          price: product.price,
        },
      ],
    },
  })
}

export function trackAddToCart(product: {
  id: string
  title: string
  price: string
}): void {
  pushEvent('add_to_cart', {
    ecommerce: {
      items: [
        {
          item_id: product.id,
          item_name: product.title,
          price: product.price,
        },
      ],
    },
  })
}
