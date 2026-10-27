/** Matches Shopify automatic discount “Order Over $100”. */
export const FREE_SHIPPING_THRESHOLD_USD = 100

export type FreeShippingProgress = {
  threshold: number
  subtotal: number
  remaining: number
  percent: number
  unlocked: boolean
}

export function freeShippingProgress(
  subtotalUsd: number,
  threshold = FREE_SHIPPING_THRESHOLD_USD,
): FreeShippingProgress {
  const subtotal = Math.max(0, Number.isFinite(subtotalUsd) ? subtotalUsd : 0)
  const remaining = Math.max(0, Math.round((threshold - subtotal) * 100) / 100)
  const percent = threshold <= 0 ? 100 : Math.min(100, Math.round((subtotal / threshold) * 100))
  return {
    threshold,
    subtotal,
    remaining,
    percent,
    unlocked: subtotal >= threshold,
  }
}
