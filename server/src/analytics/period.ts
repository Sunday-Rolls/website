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

/** Sunday Rolls' Shopify store timezone. Dashboard days and months are calendar days here. */
export const STORE_TIME_ZONE = 'America/Chicago'

const storeDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: STORE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Calendar day (YYYY-MM-DD) in the store timezone for an instant. */
export function storeDateOf(date: Date): string {
  return storeDateFormat.format(date)
}

/**
 * Store-timezone day for an order timestamp. Date-only values, and the exact UTC
 * midnights that Sales Tracker / workbook imports store for them, already name the
 * day and are kept as-is; converting them would push every one back a day.
 */
export function storeDay(isoDateTime: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoDateTime)) return isoDateTime
  if (/^\d{4}-\d{2}-\d{2}T00:00:00(\.0+)?(Z|\+00:00)$/.test(isoDateTime)) return isoDateTime.slice(0, 10)
  const date = new Date(isoDateTime)
  return Number.isNaN(date.getTime()) ? isoDateTime.slice(0, 10) : storeDateOf(date)
}

/** UTC instant of 00:00 on `day` in the store timezone (handles DST), as ISO. */
export function storeMidnightUtc(day: string): string {
  const guess = parseUtcDate(day).getTime()
  // Offset = how far the store's wall clock is from UTC at that instant.
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: STORE_TIME_ZONE,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(new Date(guess))
      .map((p) => [p.type, p.value]),
  )
  const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute)
  return new Date(guess - (wall - guess)).toISOString()
}

export function resolveAsOf(asOf?: string, now = new Date()): string {
  if (asOf) return formatUtcDate(parseUtcDate(asOf))
  return storeDateOf(now)
}

export function rangeForPeriod(period: PeriodKey, asOf?: string, now = new Date()): DateRange {
  const end = parseUtcDate(resolveAsOf(asOf, now))
  const days =
    period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : daysInYearToDate(end)

  const start = addUtcDays(end, -(days - 1))
  return rangeFromBounds(start, end)
}

/** Custom inclusive UTC date range with a matching previous period for deltas. */
export function rangeForCustom(startIso: string, endIso: string): DateRange {
  const start = parseUtcDate(startIso)
  const end = parseUtcDate(endIso)
  if (end.getTime() < start.getTime()) {
    throw new Error('End date must be on or after start date')
  }
  return rangeFromBounds(start, end)
}

function rangeFromBounds(start: Date, end: Date): DateRange {
  const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1
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
  const day = storeDay(isoDateTime)
  return day >= start && day <= end
}

export function monthKey(isoDateTime: string): string {
  return storeDay(isoDateTime).slice(0, 7)
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
