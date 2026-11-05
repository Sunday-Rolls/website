import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from 'node:test'
import {
  buyerIp,
  proxyStorefrontApi,
  rewriteSetCookie,
  sharedCookieDomain,
  storefrontApiVersion,
} from './storefront-proxy.mjs'

test('matches only Storefront API GraphQL paths', () => {
  assert.equal(storefrontApiVersion('/api/unstable/graphql.json'), 'unstable')
  assert.equal(storefrontApiVersion('/api/2025-01/graphql.json?x=1'), '2025-01')
  assert.equal(storefrontApiVersion('/api/2025-01/graphql'), null)
  assert.equal(storefrontApiVersion('/products/api/unstable/graphql.json'), null)
  assert.equal(storefrontApiVersion('/'), null)
})

test('shares cookies across www and the checkout subdomain only', () => {
  assert.equal(sharedCookieDomain('www.sundayrollsgolf.com', 'shop.sundayrollsgolf.com'), 'sundayrollsgolf.com')
  assert.equal(sharedCookieDomain('sundayrollsgolf.com:443', 'shop.sundayrollsgolf.com'), 'sundayrollsgolf.com')
  assert.equal(sharedCookieDomain('website-production.up.railway.app', 'shop.sundayrollsgolf.com'), null)
  assert.equal(sharedCookieDomain('localhost:8080', 'shop.sundayrollsgolf.com'), null)
})

test('adds a Domain only when Shopify did not set one', () => {
  const cookie = '_shopify_analytics=abc; Max-Age=31536000; Path=/; HttpOnly; Secure; SameSite=Lax'
  assert.equal(rewriteSetCookie(cookie, 'sundayrollsgolf.com'), `${cookie}; Domain=sundayrollsgolf.com`)
  assert.equal(rewriteSetCookie(cookie, null), cookie)
  assert.equal(rewriteSetCookie('a=b; Domain=x.com', 'sundayrollsgolf.com'), 'a=b; Domain=x.com')
})

test('uses the first X-Forwarded-For address as the buyer IP', () => {
  assert.equal(buyerIp({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }, '10.0.0.2'), '203.0.113.9')
  assert.equal(buyerIp({}, '10.0.0.2'), '10.0.0.2')
})

function fakeRequest({ url, method = 'POST', headers = {}, body = '' }) {
  const req = new EventEmitter()
  Object.assign(req, { url, method, headers, socket: { remoteAddress: '10.0.0.2' } })
  process.nextTick(() => {
    if (body) req.emit('data', Buffer.from(body))
    req.emit('end')
  })
  return req
}

function fakeResponse() {
  return {
    status: 0,
    headers: {},
    body: undefined,
    writeHead(status, headers = {}) {
      this.status = status
      this.headers = headers
      return this
    },
    end(body) {
      this.body = body
    },
  }
}

test('forwards allowed headers and widens Shopify cookies', async () => {
  let seen
  const fetchImpl = async (url, init) => {
    seen = { url, init }
    const headers = new Headers({ 'content-type': 'application/json', 'server-timing': '_y;desc="u1"' })
    headers.append('set-cookie', '_shopify_analytics=a; Path=/; HttpOnly')
    headers.append('set-cookie', '_shopify_marketing=m; Path=/; HttpOnly')
    return new Response('{"data":{}}', { status: 200, headers })
  }
  const req = fakeRequest({
    url: '/api/unstable/graphql.json',
    headers: {
      host: 'www.sundayrollsgolf.com',
      'content-type': 'application/json',
      'x-shopify-storefront-access-token': 'public-token',
      'x-forwarded-for': '203.0.113.9',
      authorization: 'should-not-forward',
    },
    body: '{"query":"{ shop { id } }"}',
  })
  const res = fakeResponse()

  await proxyStorefrontApi(req, res, { upstreamHost: 'shop.sundayrollsgolf.com', fetchImpl })

  assert.equal(seen.url, 'https://shop.sundayrollsgolf.com/api/unstable/graphql.json')
  assert.equal(seen.init.headers.get('x-shopify-storefront-access-token'), 'public-token')
  assert.equal(seen.init.headers.get('x-forwarded-for'), '203.0.113.9')
  assert.equal(seen.init.headers.get('authorization'), null)
  assert.equal(String(seen.init.body), '{"query":"{ shop { id } }"}')
  assert.equal(res.status, 200)
  assert.equal(res.headers['server-timing'], '_y;desc="u1"')
  assert.deepEqual(res.headers['set-cookie'], [
    '_shopify_analytics=a; Path=/; HttpOnly; Domain=sundayrollsgolf.com',
    '_shopify_marketing=m; Path=/; HttpOnly; Domain=sundayrollsgolf.com',
  ])
  assert.equal(String(res.body), '{"data":{}}')
})

test('returns 502 when Shopify is unreachable', async () => {
  const req = fakeRequest({ url: '/api/2025-01/graphql.json', headers: { host: 'www.sundayrollsgolf.com' } })
  const res = fakeResponse()
  const originalError = console.error
  console.error = () => {}
  try {
    await proxyStorefrontApi(req, res, {
      upstreamHost: 'shop.sundayrollsgolf.com',
      fetchImpl: async () => {
        throw new Error('down')
      },
    })
  } finally {
    console.error = originalError
  }
  assert.equal(res.status, 502)
})
