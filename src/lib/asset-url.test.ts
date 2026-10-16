import { describe, expect, it } from 'vitest'
import { assetSrcSet, assetUrl } from '@/lib/asset-url'

describe('assetUrl', () => {
  it('prefixes paths with the Vite base URL', () => {
    expect(assetUrl('/assets/home/hero.jpg')).toBe(
      `${import.meta.env.BASE_URL}assets/home/hero.jpg`,
    )
  })
})

describe('assetSrcSet', () => {
  it('prefixes every candidate in a srcset', () => {
    expect(assetSrcSet('/assets/a.webp 720w, /assets/b.webp 1280w')).toBe(
      `${import.meta.env.BASE_URL}assets/a.webp 720w, ${import.meta.env.BASE_URL}assets/b.webp 1280w`,
    )
  })
})
