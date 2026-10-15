import type { PeriodKey } from './types.js'

export type DateRange = {
  start: string
  end: string
  prevStart: string
  prevEnd: string
  label: string
}

/** Parse YYYY-MM-DD as UTC midnight. */
export function parseUtcDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new Error(`Invalid date: ${value}`)
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
}

export function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

export function resolveAsOf(asOf?: string, now = new Date()): string {
  if (asOf) return formatUtcDate(parseUtcDate(asOf))
  return formatUtcDate(now)
}

export function rangeForPeriod(period: PeriodKey, asOf?: string, now = new Date()): DateRange {
  const end = parseUtcDate(resolveAsOf(asOf, now))
  const days =
    period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : daysInYearToDate(end)

  const start = addUtcDays(end, -(days - 1))
  const prevEnd = addUtcDays(start, -1)
  const prevStart = addUtcDays(prevEnd, -(days - 1))

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const label = `${months[start.getUTCMonth()]} ${start.getUTCDate()} – ${months[end.getUTCMonth()]} ${end.getUTCDate()}, ${end.getUTCFullYear()}`

  return {
    start: formatUtcDate(start),
    end: formatUtcDate(end),
    prevStart: formatUtcDate(prevStart),
    prevEnd: formatUtcDate(prevEnd),
    label,
  }
}

function daysInYearToDate(end: Date): number {
  const start = new Date(Date.UTC(end.getUTCFullYear(), 0, 1))
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1
}

export function inRange(isoDateTime: string, start: string, end: string): boolean {
  const day = isoDateTime.slice(0, 10)
  return day >= start && day <= end
}

export function monthKey(isoDateTime: string): string {
  return isoDateTime.slice(0, 7)
}

/** Map Squarespace/Shopify into website for rollup charts after cutover. */
export function websiteChannelFor(
  channel: string,
  orderedAt: string,
  cutoverAt: string | null,
): 'squarespace' | 'shopify' | 'website' {
  if (channel !== 'squarespace' && channel !== 'shopify') return channel as never
  if (!cutoverAt) return 'website'
  return orderedAt.slice(0, 10) < cutoverAt.slice(0, 10)
    ? channel === 'squarespace'
      ? 'website'
      : 'website'
    : 'website'
}

export function isWebsiteChannel(channel: string): boolean {
  return channel === 'squarespace' || channel === 'shopify' || channel === 'website'
}
