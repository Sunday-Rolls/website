import { optimizedImageUrl } from '@/lib/responsive-image'

const pageLoaders = {
  home: () => import('@/pages/HomePage'),
  shop: () => import('@/pages/ShopPage'),
  product: () => import('@/pages/ProductPage'),
  about: () => import('@/pages/AboutPage'),
  contact: () => import('@/pages/ContactPage'),
  cart: () => import('@/pages/CartPage'),
  thankYou: () => import('@/pages/OrderThankYouPage'),
} as const

export const routeModules = pageLoaders

function normalizePath(to: string) {
  const path = to.split(/[?#]/)[0] ?? '/'
  if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1)
  return path || '/'
}

/** Start downloading a route chunk (and product data) before navigation. */
export function prefetchDestination(to: string) {
  const path = normalizePath(to)

  if (path === '/') {
    void pageLoaders.home()
    return
  }

  if (path === '/shop' || path.startsWith('/shop/')) {
    void pageLoaders.shop()
    return
  }

  if (path === '/about') {
    void pageLoaders.about()
    return
  }

  if (path === '/contact') {
    void pageLoaders.contact()
    return
  }

  if (path === '/cart') {
    void pageLoaders.cart()
    return
  }

  if (path === '/order/thank-you') {
    void pageLoaders.thankYou()
    return
  }

  if (path.startsWith('/products/')) {
    const handle = decodeURIComponent(path.slice('/products/'.length))
    void pageLoaders.product()
    if (!handle) return
    void import('@/lib/shopify').then(({ placeholderProducts, prefetchProductByHandle }) => {
      void prefetchProductByHandle(handle)
      const imageUrl = placeholderProducts.find((product) => product.handle === handle)?.imageUrl
      const src = optimizedImageUrl(imageUrl)
      if (!src || typeof Image === 'undefined') return
      const image = new Image()
      image.src = src
    })
  }
}

export function prefetchHandlers(to: string) {
  const start = () => prefetchDestination(to)
  return {
    onMouseEnter: start,
    onFocus: start,
    onTouchStart: start,
  }
}
