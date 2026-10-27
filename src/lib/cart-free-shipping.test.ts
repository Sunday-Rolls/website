import { describe, expect, it } from 'vitest'
import { FREE_SHIPPING_THRESHOLD_USD, freeShippingProgress } from '@/lib/cart-free-shipping'

describe('freeShippingProgress', () => {
  it('reports remaining amount under the threshold', () => {
    expect(freeShippingProgress(25.5)).toEqual({
      threshold: FREE_SHIPPING_THRESHOLD_USD,
      subtotal: 25.5,
      remaining: 74.5,
      percent: 26,
      unlocked: false,
    })
  })

  it('unlocks at and above the threshold', () => {
    expect(freeShippingProgress(100).unlocked).toBe(true)
    expect(freeShippingProgress(100).remaining).toBe(0)
    expect(freeShippingProgress(100).percent).toBe(100)
    expect(freeShippingProgress(140).unlocked).toBe(true)
  })
})
