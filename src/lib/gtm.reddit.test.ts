import { beforeEach, describe, expect, it, vi } from 'vitest'

const product = { id: 'gid://shopify/Product/1', title: 'Retro Roller', price: '80.00' }

async function loadGtm(pixelId: string) {
  vi.resetModules()
  vi.stubEnv('VITE_REDDIT_PIXEL_ID', pixelId)
  vi.stubEnv('VITE_META_PIXEL_ID', '')
  vi.stubEnv('VITE_GTM_ID', 'GTM-TEST')
  delete window.rdt
  window.dataLayer = []
  const gtm = await import('@/lib/gtm')
  gtm.initGtm()
  return gtm
}

describe('Reddit Pixel', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
  })

  it('queues init and maps events before pixel.js loads', async () => {
    const gtm = await loadGtm('a2_test')
    gtm.trackPageView('/shop')
    gtm.trackViewItem(product)
    gtm.trackAddToCart(product, 2)
    gtm.trackBeginCheckout([{ ...product, quantity: 2 }], '160.00')
    gtm.trackNewsletterSubscribe()
    gtm.trackContactSubmit()

    const calls = window.rdt!.callQueue
    expect(calls[0]).toEqual([
      'init',
      'a2_test',
      { optOut: false, useDecimalCurrencyValues: true },
    ])
    expect(calls.slice(1).map((call) => call[1])).toEqual([
      'PageVisit',
      'ViewContent',
      'AddToCart',
      'SignUp',
      'Lead',
    ])
    expect(calls[3][2]).toEqual({
      itemCount: 2,
      value: 160,
      currency: 'USD',
      products: [{ id: 'gid://shopify/Product/1', name: 'Retro Roller' }],
    })
  })

  it('leaves Purchase to the Shopify checkout pixel', async () => {
    const gtm = await loadGtm('a2_test')
    gtm.trackPurchase({ transactionId: '5001', value: 85.5, items: [] })
    expect(window.rdt!.callQueue.find((call) => call[1] === 'Purchase')).toBeUndefined()
  })

  it('loads pixel.js only when analytics boot', async () => {
    await loadGtm('a2_test')
    expect(document.querySelector('script[src*="redditstatic.com/ads/pixel.js"]')).toBeNull()
    window.dispatchEvent(new Event('pointerdown'))
    expect(document.querySelector('script[src*="redditstatic.com/ads/pixel.js"]')).not.toBeNull()
  })

  it('loads right away when landing from a Reddit ad click', async () => {
    window.history.replaceState(null, '', '/shop?rdt_cid=abc')
    try {
      await loadGtm('a2_test')
      expect(document.querySelector('script[src*="redditstatic.com/ads/pixel.js"]')).not.toBeNull()
    } finally {
      window.history.replaceState(null, '', '/')
    }
  })

  it('does nothing without a pixel id', async () => {
    const gtm = await loadGtm('')
    gtm.trackViewItem(product)
    expect(window.rdt).toBeUndefined()
  })
})
