import { describe, expect, it } from 'vitest'
import { friendlySource, productFromPath } from './ga4.js'

describe('ga4 helpers', () => {
  it('maps product paths to names', () => {
    expect(productFromPath('/shop/p/morning-dew')).toEqual({
      name: 'Morning Dew',
      category: 'Product page',
    })
    expect(productFromPath('/shop/p/retro-roller-mallet-grey?foo=1')).toEqual({
      name: 'Retro Roller Mallet Grey',
      category: 'Product page',
    })
    expect(productFromPath('/shop')).toBeNull()
  })

  it('normalizes common traffic sources', () => {
    expect(friendlySource('ig')).toBe('Instagram')
    expect(friendlySource('google')).toBe('Google')
    expect(friendlySource('(direct)')).toBe('Direct')
    expect(friendlySource('m.facebook.com')).toBe('Facebook')
  })
})
