/**
 * Hands the visitor's GA4 IDs to Shopify checkout so purchases keep their traffic source.
 *
 * Checkout's custom web pixel runs in a sandbox that can't read this site's `_ga` cookies,
 * so without help GA4 records every purchase under a brand-new visitor with no source
 * (Direct / "(not set)"), and organic search never gets credit for a sale. At the
 * checkout click we copy the client ID and session ID onto the cart as hidden attributes
 * (`_sr_ga_cid`, `_sr_ga_sid`); the pixel reads them back and sends `purchase` under the
 * same visitor and session. See docs/SHOPIFY_WEB_PIXEL.md.
 */

export type GaIds = { clientId: string; sessionId: string }

function cookieMap(cookie: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const part of cookie.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    const name = part.slice(0, eq).trim()
    if (!name) continue
    try {
      map.set(name, decodeURIComponent(part.slice(eq + 1).trim()))
    } catch {
      map.set(name, part.slice(eq + 1).trim())
    }
  }
  return map
}

/** `GA1.1.123456789.1700000000` → `123456789.1700000000`. */
export function clientIdFromCookie(value: string | undefined): string {
  const match = /^GA\d\.\d+\.(\d+\.\d+)$/.exec(value?.trim() ?? '')
  return match ? match[1] : ''
}

/**
 * Session ID from the `_ga_<container>` cookie, in either format:
 * `GS1.1.1700000000.3.1...` (older) or `GS2.1.s1700000000$o3$g1...` (current).
 */
export function sessionIdFromCookie(value: string | undefined): string {
  const v = value?.trim() ?? ''
  const gs2 = /^GS2\.\d+\.s(\d+)/.exec(v)
  if (gs2) return gs2[1]
  const gs1 = /^GS1\.\d+\.(\d+)\./.exec(v)
  return gs1 ? gs1[1] : ''
}

/**
 * Read the GA4 IDs from a cookie string. `measurementId` (e.g. `G-YK0BB0TPM4`) picks the
 * session cookie; without it, the first `_ga_*` cookie is used.
 */
export function readGaIds(cookie: string, measurementId?: string): GaIds {
  const cookies = cookieMap(cookie)
  const clientId = clientIdFromCookie(cookies.get('_ga'))
  const wanted = measurementId ? `_ga_${measurementId.replace(/^G-/, '')}` : ''
  let session = wanted ? cookies.get(wanted) : undefined
  if (!session) {
    for (const [name, value] of cookies) {
      if (name.startsWith('_ga_')) {
        session = value
        break
      }
    }
  }
  return { clientId, sessionId: sessionIdFromCookie(session) }
}

/** Hidden cart attributes carrying the GA4 IDs (empty when GA hasn't set its cookies). */
export function gaCartAttributes(
  cookie: string = typeof document === 'undefined' ? '' : document.cookie,
  measurementId: string | undefined = (
    import.meta.env.VITE_GA4_MEASUREMENT_ID as string | undefined
  )?.trim(),
): Array<{ key: string; value: string }> {
  const { clientId, sessionId } = readGaIds(cookie, measurementId)
  return [
    { key: '_sr_ga_cid', value: clientId },
    { key: '_sr_ga_sid', value: sessionId },
  ].filter((a) => a.value)
}
