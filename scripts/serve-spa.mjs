#!/usr/bin/env node
/**
 * Zero-dependency static file server with SPA fallback for Railway.
 * Serves ./dist, rewrites unknown paths to index.html, exposes GET /health.
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { legacyRedirect } from './lib/legacy-redirects.mjs'
import { proxyStorefrontApi, storefrontApiVersion } from './lib/storefront-proxy.mjs'

const dist = join(process.cwd(), 'dist')
const port = Number(process.env.PORT || 8080)
/** Shop's primary domain; Shopify analytics cookies are issued for its parent domain. */
const storefrontProxyHost =
  process.env.VITE_SHOPIFY_CHECKOUT_DOMAIN?.trim() || 'shop.sundayrollsgolf.com'

// Product handles for the Squarespace URL redirects (empty set → product URLs fall back to /shop/).
const productHandles = await readFile(join(process.cwd(), 'src/data/product-catalog.json'), 'utf8')
  .then((text) => new Set(JSON.parse(text).map((product) => product.handle).filter(Boolean)))
  .catch(() => new Set())
const host = process.env.HOST || '0.0.0.0'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

function safePath(urlPath) {
  const decoded = decodeURIComponent((urlPath || '/').split('?')[0].split('#')[0])
  const cleaned = normalize(decoded).replace(/^(\.\.[/\\])+/, '')
  const relative = cleaned.replace(/^[/\\]+/, '')
  return join(dist, relative || 'index.html')
}

const UNHASHED = new Set(['.html', '.txt', '.xml'])

async function sendFile(res, filePath, status = 200) {
  const body = await readFile(filePath)
  const type = TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream'
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': body.length,
    // Only hashed build assets are immutable; pages, robots.txt and sitemap.xml change in place.
    'Cache-Control': UNHASHED.has(extname(filePath).toLowerCase())
      ? 'no-cache'
      : 'public, max-age=31536000, immutable',
  })
  res.end(body)
}

const server = createServer(async (req, res) => {
  try {
    // Browsers should only ever use HTTPS for this site (Semrush: "no HSTS support").
    res.setHeader('Strict-Transport-Security', 'max-age=31536000')
    if (req.method === 'GET' && (req.url === '/health' || req.url?.startsWith('/health?'))) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('ok')
      return
    }

    if (storefrontApiVersion(req.url)) {
      await proxyStorefrontApi(req, res, { upstreamHost: storefrontProxyHost })
      return
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end('Method Not Allowed')
      return
    }

    const redirect = legacyRedirect(req.url || '/', productHandles)
    if (redirect) {
      res.writeHead(301, { Location: redirect, 'Cache-Control': 'public, max-age=86400' })
      res.end()
      return
    }

    let filePath = safePath(req.url || '/')
    if (!filePath.startsWith(dist)) {
      res.writeHead(403).end('Forbidden')
      return
    }

    try {
      const info = await stat(filePath)
      if (info.isDirectory()) filePath = join(filePath, 'index.html')
      await sendFile(res, filePath)
      return
    } catch {
      // fall through to SPA index
    }

    // Asset-like paths should 404 instead of returning HTML
    if (extname(filePath)) {
      res.writeHead(404).end('Not Found')
      return
    }

    await sendFile(res, join(dist, 'index.html'))
  } catch (error) {
    console.error(error)
    res.writeHead(500).end('Internal Server Error')
  }
})

server.listen(port, host, () => {
  console.log(`Sunday Rolls SPA listening on http://${host}:${port}`)
})
