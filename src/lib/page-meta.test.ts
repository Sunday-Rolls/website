import { afterEach, describe, expect, it } from 'vitest'
import { applyPageMeta } from '@/lib/page-meta'

describe('applyPageMeta', () => {
  afterEach(() => {
    document.title = ''
    document.head.querySelectorAll('meta[name], meta[property], link[rel="canonical"]').forEach((el) => {
      el.remove()
    })
  })

  it('sets title, description, and canonical', () => {
    applyPageMeta({
      title: 'Our Collection — Sunday Rolls',
      description: 'Timeless golf goods built for the walk.',
      path: '/shop',
    })

    expect(document.title).toBe('Our Collection — Sunday Rolls')
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'Timeless golf goods built for the walk.',
    )
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toContain('/shop')
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe(
      'Our Collection — Sunday Rolls',
    )
  })
})
