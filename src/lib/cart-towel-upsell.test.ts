import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TOWEL_UPSELL_HANDLE,
  listTowelUpsellOptions,
  selectTowelUpsell,
  shouldShowTowelUpsell,
  towelColorLabel,
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

describe('towelColorLabel', () => {
  it('strips the product prefix', () => {
    expect(towelColorLabel('Golf Towel - Green Stripe')).toBe('Green Stripe')
    expect(towelColorLabel('Golf Towel - Red & Blue Stripe')).toBe('Red & Blue Stripe')
  })
})

describe('listTowelUpsellOptions', () => {
  it('puts the preferred towel first and skips cart items', () => {
    const options = listTowelUpsellOptions([DEFAULT_TOWEL_UPSELL_HANDLE])
    expect(options.map((option) => option.handle)).not.toContain(DEFAULT_TOWEL_UPSELL_HANDLE)
    expect(options[0]?.handle).toBe('golf-towel-blue-stripe')
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
