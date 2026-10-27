import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TOWEL_UPSELL_HANDLE,
  selectTowelUpsell,
  shouldShowTowelUpsell,
} from '@/lib/cart-towel-upsell'

describe('shouldShowTowelUpsell', () => {
  it('shows between $70 and under $100', () => {
    expect(shouldShowTowelUpsell(69.99)).toBe(false)
    expect(shouldShowTowelUpsell(70)).toBe(true)
    expect(shouldShowTowelUpsell(85)).toBe(true)
    expect(shouldShowTowelUpsell(99.99)).toBe(true)
    expect(shouldShowTowelUpsell(100)).toBe(false)
  })
})

describe('selectTowelUpsell', () => {
  it('prefers the green stripe towel when it is not in the cart', () => {
    expect(selectTowelUpsell([])?.handle).toBe(DEFAULT_TOWEL_UPSELL_HANDLE)
  })

  it('skips towels already in the cart', () => {
    const next = selectTowelUpsell([DEFAULT_TOWEL_UPSELL_HANDLE])
    expect(next?.handle).toBeTruthy()
    expect(next?.handle).not.toBe(DEFAULT_TOWEL_UPSELL_HANDLE)
  })

  it('returns null when every towel is already in the cart', () => {
    const handles = [
      'golf-towel-green-stripe',
      'golf-towel-blue-stripe',
      'golf-towel-red-stripe',
      'golf-towel-black-stripe',
      'golf-towel-red-blue-stripe',
      'golf-towel-solid-blue',
      'golf-towel-solid-black',
    ]
    expect(selectTowelUpsell(handles)).toBeNull()
  })
})
