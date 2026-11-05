/**
 * Same-origin Storefront API proxy for Shopify analytics.
 *
 * Shopify stopped setting `_shopify_y` / `_shopify_s` in the browser (April 2026).
 * Headless sites now get visitor and session tokens by calling the Storefront API
 * through their own domain: Shopify answers with HTTP-only cookies and
 * `Server-Timing` values that its Customer Privacy script reads. This mirrors
 * Hydrogen's `storefront.forward()` for our zero-dependency server.
 * https://shopify.dev/docs/storefronts/headless/legacy/hydrogen/migrate/cookies-custom-setup
 */

export const STOREFRONT_API_PATH = /^\/api\/(unstable|2\d{3}-\d{2})\/graphql\.json$/

/** Only these request headers go to Shopify, as in Hydrogen (others can cause 403s). */
const FORWARDED_REQUEST_HEADERS = [
  'accept',
  'accept-language',
  'access-control-request-headers',
  'access-control-request-method',
  'content-type',
  'cookie',
  'origin',
  'referer',
  'user-agent',
  'x-shopify-storefront-access-token',
  'x-shopify-uniquetoken',
  'x-shopify-visittoken',
]

/** Hop-by-hop or body-encoding headers that must not be copied from Shopify's response. */
const DROPPED_RESPONSE_HEADERS = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'keep-alive',
  'transfer-encoding',
])

export function storefrontApiVersion(urlPath) {
  const pathname = (urlPath || '/').split('?')[0]
  return pathname.match(STOREFRONT_API_PATH)?.[1] ?? null
}

/** First address in X-Forwarded-For, so Shopify geolocates the shopper, not Railway. */
export function buyerIp(headers, socketAddress) {
  const forwarded = String(headers['x-forwarded-for'] ?? '').split(',')[0].trim()
  return forwarded || socketAddress || ''
}

/**
 * Shopify scopes its cookies to the bare host it was called on. Widen them to the
 * shared parent domain (e.g. `.sundayrollsgolf.com`) so checkout on `shop.` sees the
 * same visitor as `www.`. Cookies are left alone when the hosts share no parent.
 */
export function sharedCookieDomain(requestHost, upstreamHost) {
  const req = String(requestHost || '').split(':')[0].toLowerCase().split('.').reverse()
  const up = String(upstreamHost || '').toLowerCase().split('.').reverse()
  const shared = []
  for (let i = 0; i < Math.min(req.length, up.length); i++) {
    if (req[i] !== up[i]) break
    shared.push(req[i])
  }
  // Need at least "name.tld"; a bare TLD is never a valid cookie domain.
  return shared.length >= 2 ? shared.reverse().join('.') : null
}

export function rewriteSetCookie(value, domain) {
  if (!domain || /;\s*domain=/i.test(value)) return value
  return `${value}; Domain=${domain}`
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/**
 * Forward one request to `https://<upstreamHost>/api/<version>/graphql.json`.
 * `upstreamHost` should be the shop's primary domain (shop.sundayrollsgolf.com) so
 * Shopify issues cookies for our registrable domain.
 */
export async function proxyStorefrontApi(req, res, { upstreamHost, fetchImpl = fetch }) {
  const version = storefrontApiVersion(req.url)
  if (!version || !upstreamHost) {
    res.writeHead(404).end('Not Found')
    return
  }

  const headers = new Headers()
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = req.headers[name]
    if (value) headers.set(name, Array.isArray(value) ? value.join(', ') : value)
  }
  const ip = buyerIp(req.headers, req.socket?.remoteAddress)
  if (ip) headers.set('x-forwarded-for', ip)

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
  let upstream
  try {
    upstream = await fetchImpl(`https://${upstreamHost}/api/${version}/graphql.json`, {
      method: req.method,
      headers,
      body: hasBody ? await readBody(req) : undefined,
    })
  } catch (error) {
    console.error('Storefront API proxy failed', error)
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ errors: [{ message: 'Storefront API unavailable' }] }))
    return
  }

  const cookieDomain = sharedCookieDomain(req.headers.host, upstreamHost)
  const outHeaders = {}
  upstream.headers.forEach((value, name) => {
    if (DROPPED_RESPONSE_HEADERS.has(name) || name === 'set-cookie') return
    outHeaders[name] = value
  })
  const setCookies = upstream.headers.getSetCookie?.() ?? []
  if (setCookies.length) {
    outHeaders['set-cookie'] = setCookies.map((value) => rewriteSetCookie(value, cookieDomain))
  }
  outHeaders['cache-control'] = 'no-store'

  const body = Buffer.from(await upstream.arrayBuffer())
  outHeaders['content-length'] = String(body.length)
  res.writeHead(upstream.status, outHeaders)
  res.end(req.method === 'HEAD' ? undefined : body)
}
