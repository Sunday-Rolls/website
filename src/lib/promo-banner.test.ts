import { describe, expect, it } from 'vitest'
import { isPromoActive } from '@/lib/promo-banner'
import siteContent from '@/content/site.json'

const promo = { startsAt: '2026-11-23T00:00:00-06:00', endsAt: '2026-12-01T00:00:00-06:00' }

describe('Black Friday banner window', () => {
  it('is off before Monday Nov 23 (Central)', () => {
    expect(isPromoActive(promo, new Date('2026-11-22T23:59:00-06:00'))).toBe(false)
  })

  it('is on from Monday Nov 23 through the end of Cyber Monday', () => {
    expect(isPromoActive(promo, new Date('2026-11-23T00:00:00-06:00'))).toBe(true)
    expect(isPromoActive(promo, new Date('2026-11-30T23:59:00-06:00'))).toBe(true)
  })

  it('is off from Tuesday Dec 1', () => {
    expect(isPromoActive(promo, new Date('2026-12-01T00:00:00-06:00'))).toBe(false)
  })

  it('can be previewed early with ?promo=1', () => {
    expect(isPromoActive(promo, new Date('2026-11-22T12:00:00-06:00'), '?promo=1')).toBe(true)
  })

  it('matches the dates in site.json', () => {
    expect(siteContent.promoBanner?.startsAt).toBe(promo.startsAt)
    expect(siteContent.promoBanner?.endsAt).toBe(promo.endsAt)
  })
})
