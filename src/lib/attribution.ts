/**
 * Remembers which ad or link brought a visitor in, so the order can say so.
 *
 * On landing we read UTM tags and ad click IDs from the URL (or an outside referrer) and keep
 * the latest one for 30 days. The cart carries it to Shopify as hidden cart attributes
 * (`_sr_*`, not shown at checkout), and the dashboard reads them off the order to link
 * sales to Google Ads / Meta campaigns.
 */

export type Touch = {
  source: string
  medium: string
  campaign: string
  /** Which click ID was on the landing URL (gclid, fbclid, ...), not its value. */
  click: string
  /** ms since epoch */
  at: number
}

const STORAGE_KEY = 'sr_attribution'
const STAMPED_KEY = 'sr_attribution_cart'
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000

const CLICK_IDS: Record<string, { source: string; medium: string }> = {
  gclid: { source: 'google', medium: 'cpc' },
  gbraid: { source: 'google', medium: 'cpc' },
  wbraid: { source: 'google', medium: 'cpc' },
  fbclid: { source: 'facebook', medium: 'paid' },
}

/** Our own sites: moving between them is not a new visit source. */
const OWN_HOSTS = /(^|\.)sundayrollsgolf\.com$|\.myshopify\.com$|\.github\.io$|^localhost$|^127\.0\.0\.1$/

function clean(value: string | null | undefined): string {
  return (value ?? '').trim().slice(0, 200)
}

/** The touch this landing represents, or null for a direct / internal visit. */
export function touchFromLanding(search: string, referrer: string, now: number): Touch | null {
  const params = new URLSearchParams(search)
  const click = Object.keys(CLICK_IDS).find((k) => params.get(k)) ?? ''
  const utmSource = clean(params.get('utm_source'))
  if (utmSource || click) {
    return {
      source: utmSource || CLICK_IDS[click].source,
      medium: clean(params.get('utm_medium')) || (click ? CLICK_IDS[click].medium : ''),
      campaign: clean(params.get('utm_campaign')),
      click,
      at: now,
    }
  }
  if (!referrer) return null
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, '')
    if (!host || OWN_HOSTS.test(host)) return null
    return { source: host, medium: 'referral', campaign: '', click: '', at: now }
  } catch {
    return null
  }
}

function read(storage: Storage, now: number): Touch | null {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return null
    const touch = JSON.parse(raw) as Touch
    if (!touch?.source || typeof touch.at !== 'number' || now - touch.at > WINDOW_MS) return null
    return touch
  } catch {
    return null
  }
}

function isPaid(t: Touch): boolean {
  return Boolean(t.click) || /cpc|ppc|paid/i.test(t.medium)
}

/**
 * Record this landing. The latest ad click or tagged link wins; a plain referral never
 * replaces an ad click from the last 30 days.
 */
export function captureAttribution(
  location: Pick<Location, 'search'> = window.location,
  referrer: string = document.referrer,
  storage: Storage = window.localStorage,
  now = Date.now(),
): void {
  try {
    const touch = touchFromLanding(location.search, referrer, now)
    if (!touch) return
    const current = read(storage, now)
    if (current && isPaid(current) && !isPaid(touch) && touch.medium === 'referral') return
    storage.setItem(STORAGE_KEY, JSON.stringify(touch))
  } catch {
    // Storage blocked (private mode): attribution is best-effort.
  }
}

/** Shopify cart attributes for the stored touch (empty when there is none). */
export function cartAttributes(
  storage: Storage = window.localStorage,
  now = Date.now(),
): Array<{ key: string; value: string }> {
  const touch = read(storage, now)
  if (!touch) return []
  return [
    { key: '_sr_source', value: touch.source },
    { key: '_sr_medium', value: touch.medium },
    { key: '_sr_campaign', value: touch.campaign },
    { key: '_sr_click', value: touch.click },
  ].filter((a) => a.value)
}

/**
 * True when an existing cart hasn't been stamped with the current touch yet
 * (e.g. the cart is from an earlier visit and the visitor just came back from an ad).
 */
export function cartNeedsAttributes(
  cartId: string,
  storage: Storage = window.localStorage,
  now = Date.now(),
): boolean {
  const touch = read(storage, now)
  if (!touch) return false
  try {
    return storage.getItem(STAMPED_KEY) !== `${cartId}|${touch.at}`
  } catch {
    return false
  }
}

export function markCartAttributed(
  cartId: string,
  storage: Storage = window.localStorage,
  now = Date.now(),
): void {
  const touch = read(storage, now)
  if (!touch) return
  try {
    storage.setItem(STAMPED_KEY, `${cartId}|${touch.at}`)
  } catch {
    // ignore
  }
}
