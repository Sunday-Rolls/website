import { beforeEach, describe, expect, it, vi } from 'vitest'

const product = { id: 'gid://shopify/Product/1', title: 'Retro Roller', price: '80.00' }

async function loadGtm(pixelId: string) {
  vi.resetModules()
  vi.stubEnv('VITE_META_PIXEL_ID', pixelId)
  vi.stubEnv('VITE_GTM_ID', 'GTM-TEST')
  delete window.fbq
  delete window._fbq
  window.dataLayer = []
  const gtm = await import('@/lib/gtm')
  gtm.initGtm()
  return gtm
}

describe('Meta Pixel', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
  })

  it('queues init and maps ecommerce events before fbevents.js loads', async () => {
    const gtm = await loadGtm('123')
    gtm.trackPageView('/shop')
    gtm.trackViewItem(product)
    gtm.trackAddToCart(product, 2)
    gtm.trackBeginCheckout([{ ...product, quantity: 2 }], '160.00')
    gtm.trackNewsletterSubscribe()

    const calls = window.fbq!.queue as unknown[][]
    expect(calls[0]).toEqual(['init', '123'])
    expect(calls.slice(1).map((call) => call[1])).toEqual([
      'PageView',
      'ViewContent',
      'AddToCart',
      'InitiateCheckout',
      'Lead',
    ])
    expect(calls[3][2]).toMatchObject({
      content_ids: ['gid://shopify/Product/1'],
      num_items: 2,
      value: 160,
      currency: 'USD',
    })
  })

  it('sends the transaction id as eventID so checkout and site purchases dedupe', async () => {
    const gtm = await loadGtm('123')
    gtm.trackPurchase({ transactionId: '5001', value: 85.5, items: [] })
    const purchase = (window.fbq!.queue as unknown[][]).find((call) => call[1] === 'Purchase')
    expect(purchase?.[3]).toEqual({ eventID: '5001' })
  })

  it('loads fbevents.js only when analytics boot', async () => {
    await loadGtm('123')
    expect(document.querySelector('script[src*="fbevents.js"]')).toBeNull()
    window.dispatchEvent(new Event('pointerdown'))
    expect(document.querySelector('script[src*="fbevents.js"]')).not.toBeNull()
  })

  it('loads analytics immediately when landing from an ad click', async () => {
    window.history.replaceState(null, '', '/shop?gclid=test-click')
    try {
      await loadGtm('123')
      expect(document.querySelector('script[src*="gtm.js"]')).not.toBeNull()
      expect(document.querySelector('script[src*="fbevents.js"]')).not.toBeNull()
    } finally {
      window.history.replaceState(null, '', '/')
    }
  })

  it('does nothing without a pixel id', async () => {
    const gtm = await loadGtm('')
    gtm.trackViewItem(product)
    expect(window.fbq).toBeUndefined()
  })
})

describe('dataLayer ecommerce', () => {
  it('pushes each ecommerce event once, after a bare clear', async () => {
    const gtm = await loadGtm('')
    gtm.trackAddToCart(product, 1)
    const pushes = (window.dataLayer as Record<string, unknown>[]).filter(
      (entry) => 'ecommerce' in entry,
    )
    expect(pushes).toEqual([
      { ecommerce: null },
      expect.objectContaining({ event: 'add_to_cart' }),
    ])
  })
})
