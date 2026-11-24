import { describe, expect, it } from 'vitest'
import { listApparelUpsellOptions, shouldShowApparelUpsell } from '@/lib/cart-apparel-upsell'

describe('apparel cart add-on', () => {
  it('offers published apparel that is not in the cart', () => {
    const options = listApparelUpsellOptions(['the-corduroy'])
    expect(options.length).toBeGreaterThan(0)
    expect(options.every((product) => product.category === 'apparel')).toBe(true)
    expect(options.map((product) => product.handle)).toContain('sr-tee-black')
  })

  it('drops a shirt already in the cart', () => {
    expect(listApparelUpsellOptions(['sr-tee-black']).map((p) => p.handle)).not.toContain(
      'sr-tee-black',
    )
  })

  it('shows between $59 and under $100 when the shirt is not in the cart', () => {
    expect(shouldShowApparelUpsell(['the-corduroy'], 1, 80)).toBe(true)
    expect(shouldShowApparelUpsell(['the-corduroy'], 1, 59)).toBe(true)
    expect(shouldShowApparelUpsell(['the-corduroy'], 1, 99.99)).toBe(true)
    expect(shouldShowApparelUpsell(['the-corduroy'], 1, 58.99)).toBe(false)
    expect(shouldShowApparelUpsell(['the-corduroy'], 1, 100)).toBe(false)
    expect(shouldShowApparelUpsell([], 0, 80)).toBe(false)
    expect(shouldShowApparelUpsell(['sr-tee-black'], 1, 80)).toBe(false)
  })
})
