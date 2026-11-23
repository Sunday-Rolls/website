import type { PromoBannerContent } from '@/types/content'

export const PROMO_PREVIEW_PARAM = 'promo'

/** True while the sale runs, or when `?promo=1` forces it on to preview before launch. */
export function isPromoActive(
  promo: Pick<PromoBannerContent, 'startsAt' | 'endsAt'> | undefined,
  now: Date = new Date(),
  search = '',
): boolean {
  if (!promo) return false
  if (new URLSearchParams(search).get(PROMO_PREVIEW_PARAM) === '1') return true
  const start = Date.parse(promo.startsAt)
  const end = Date.parse(promo.endsAt)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false
  const t = now.getTime()
  return t >= start && t < end
}
