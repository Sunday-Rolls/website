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

  it('shows on any non-empty cart without the shirt, at any total', () => {
    expect(shouldShowApparelUpsell(['the-corduroy'], 1)).toBe(true)
    expect(shouldShowApparelUpsell([], 0)).toBe(false)
    expect(shouldShowApparelUpsell(['sr-tee-black'], 1)).toBe(false)
  })
})
