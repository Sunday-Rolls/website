import { describe, expect, it } from 'vitest'
import { assetUrl } from '@/lib/asset-url'

describe('assetUrl', () => {
  it('prefixes paths with the Vite base URL', () => {
    expect(assetUrl('/assets/home/hero.jpg')).toBe(
      `${import.meta.env.BASE_URL}assets/home/hero.jpg`,
    )
  })
})
