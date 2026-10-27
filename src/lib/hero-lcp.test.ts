import { afterEach, describe, expect, it } from 'vitest'
import { isHomePath, removeStaticHeroLcp } from '@/lib/hero-lcp'

describe('hero-lcp', () => {
  afterEach(() => {
    document.getElementById('hero-lcp')?.remove()
  })

  it('treats / as the homepage', () => {
    expect(isHomePath('/')).toBe(true)
    expect(isHomePath('')).toBe(true)
    expect(isHomePath('/shop')).toBe(false)
    expect(isHomePath('/products/foo')).toBe(false)
  })

  it('removes the static hero LCP image from the document', () => {
    const img = document.createElement('img')
    img.id = 'hero-lcp'
    document.body.appendChild(img)

    removeStaticHeroLcp()

    expect(document.getElementById('hero-lcp')).toBeNull()
  })
})
