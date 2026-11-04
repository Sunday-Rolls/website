import { describe, expect, it } from 'vitest'
import {
  captureAttribution,
  cartAttributes,
  cartNeedsAttributes,
  markCartAttributed,
  touchFromLanding,
} from './attribution'

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v)),
  }
}

const DAY = 24 * 60 * 60 * 1000

describe('touchFromLanding', () => {
  it('reads UTM tags and notes the click id type', () => {
    expect(touchFromLanding('?utm_source=google&utm_medium=cpc&utm_campaign=PMax&gclid=abc', '', 1)).toEqual({
      source: 'google', medium: 'cpc', campaign: 'PMax', click: 'gclid', at: 1,
    })
  })
  it('maps a bare click id to its network', () => {
    expect(touchFromLanding('?fbclid=x', '', 1)).toMatchObject({ source: 'facebook', medium: 'paid', click: 'fbclid' })
    expect(touchFromLanding('?gbraid=x', '', 1)).toMatchObject({ source: 'google', medium: 'cpc' })
  })
  it('uses an outside referrer, but not our own sites or a direct visit', () => {
    expect(touchFromLanding('', 'https://www.pluggedingolf.com/a', 1)).toMatchObject({ source: 'pluggedingolf.com', medium: 'referral' })
    expect(touchFromLanding('', 'https://shop.sundayrollsgolf.com/cart', 1)).toBeNull()
    expect(touchFromLanding('', '', 1)).toBeNull()
  })
})

describe('captureAttribution + cartAttributes', () => {
  it('stores the touch and turns it into hidden cart attributes', () => {
    const storage = memoryStorage()
    captureAttribution({ search: '?gclid=abc' }, '', storage, 1000)
    expect(cartAttributes(storage, 2000)).toEqual([
      { key: '_sr_source', value: 'google' },
      { key: '_sr_medium', value: 'cpc' },
      { key: '_sr_click', value: 'gclid' },
    ])
  })
  it('keeps an ad click over a later plain referral, and expires after 30 days', () => {
    const storage = memoryStorage()
    captureAttribution({ search: '?gclid=abc' }, '', storage, 0)
    captureAttribution({ search: '' }, 'https://reddit.com/r/golf', storage, DAY)
    expect(cartAttributes(storage, DAY)[0]).toEqual({ key: '_sr_source', value: 'google' })
    expect(cartAttributes(storage, 31 * DAY)).toEqual([])
  })
  it('lets a newer ad click replace an older one', () => {
    const storage = memoryStorage()
    captureAttribution({ search: '?gclid=abc' }, '', storage, 0)
    captureAttribution({ search: '?utm_source=ig&utm_medium=paid' }, '', storage, DAY)
    expect(cartAttributes(storage, DAY)[0]).toEqual({ key: '_sr_source', value: 'ig' })
  })
})

describe('cartNeedsAttributes', () => {
  it('asks once per cart and touch', () => {
    const storage = memoryStorage()
    expect(cartNeedsAttributes('cart-1', storage, 0)).toBe(false)
    captureAttribution({ search: '?gclid=abc' }, '', storage, 0)
    expect(cartNeedsAttributes('cart-1', storage, 0)).toBe(true)
    markCartAttributed('cart-1', storage, 0)
    expect(cartNeedsAttributes('cart-1', storage, 0)).toBe(false)
    captureAttribution({ search: '?fbclid=x' }, '', storage, DAY)
    expect(cartNeedsAttributes('cart-1', storage, DAY)).toBe(true)
  })
})
