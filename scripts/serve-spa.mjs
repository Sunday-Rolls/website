#!/usr/bin/env node
/**
 * Zero-dependency static file server with SPA fallback for Railway.
 * Serves ./dist, rewrites unknown paths to index.html, exposes GET /health.
 *
 * When EXPERIMENTS_CONFIG_URL is set, every HTML response gets the visitor's
 * A/B assignments injected as window.__SR_EXP__ (docs/EXPERIMENTS_CONTRACT.md).
 */
import { realpathSync } from 'node:fs'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { pathToFileURL } from 'node:url'
import { legacyRedirect } from './lib/legacy-redirects.mjs'
import {
  VID_COOKIE,
  buildState,
  createConfigPoller,
  injectState,
  isBot,
  isValidVid,
  newVisitorId,
  parseCookies,
  vidCookie,
} from './lib/experiments.mjs'

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

const UNHASHED = new Set(['.html', '.txt', '.xml'])

function isHttps(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase()
  return proto === 'https' || Boolean(req.socket?.encrypted)
}

/**
 * Per-request experiment state: reads/creates sr_vid and builds __SR_EXP__.
 * Never throws; a failure yields empty assignments.
 */
function experimentHeadersAndState(req, getExperiments, { allowAutomation }) {
  const headers = { Vary: 'Cookie', 'Cache-Control': 'private, no-cache' }
  let state
  try {
    const bot = isBot(req.headers['user-agent'], { allowAutomation })
    if (bot) {
      state = buildState({ config: [], vid: null, bot: true })
    } else {
      let vid = parseCookies(req.headers.cookie)[VID_COOKIE]
      if (!isValidVid(vid)) {
        vid = newVisitorId()
        headers['Set-Cookie'] = vidCookie(vid, { secure: isHttps(req) })
      }
      let experiments = []
      try {
        experiments = getExperiments() || []
      } catch (error) {
        console.error('experiments: config read failed', error)
      }
      state = buildState({ config: experiments, vid, bot: false })
    }
  } catch (error) {
    console.error('experiments: state failed', error)
    state = { vid: null, assignments: {}, tracked: [], bot: false }
  }
  return { headers, state }
}

/**
 * Builds the request handler. `getExperiments` (optional) returns the current
 * validated experiment list; when omitted, HTML is served untouched.
 */
export function createSpaHandler({ dist, productHandles = new Set(), getExperiments = null, allowAutomation = false }) {
  function safePath(urlPath) {
    const decoded = decodeURIComponent((urlPath || '/').split('?')[0].split('#')[0])
    const cleaned = normalize(decoded).replace(/^(\.\.[/\\])+/, '')
    const relative = cleaned.replace(/^[/\\]+/, '')
    return join(dist, relative || 'index.html')
  }

  async function sendFile(req, res, filePath, status = 200) {
    let body = await readFile(filePath)
    const ext = extname(filePath).toLowerCase()
    const type = TYPES[ext] || 'application/octet-stream'
    const headers = {
      'Content-Type': type,
      'Content-Length': body.length,
      // Only hashed build assets are immutable; pages, robots.txt and sitemap.xml change in place.
      'Cache-Control': UNHASHED.has(ext) ? 'no-cache' : 'public, max-age=31536000, immutable',
    }
    if (getExperiments && ext === '.html') {
      const exp = experimentHeadersAndState(req, getExperiments, { allowAutomation })
      try {
        const html = injectState(body.toString('utf8'), exp.state)
        body = Buffer.from(html, 'utf8')
      } catch (error) {
        console.error('experiments: inject failed', error)
      }
      Object.assign(headers, exp.headers)
      headers['Content-Length'] = body.length
    }
    res.writeHead(status, headers)
    res.end(body)
  }

  return async function handler(req, res) {
    try {
      if (req.method === 'GET' && (req.url === '/health' || req.url?.startsWith('/health?'))) {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('ok')
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
        await sendFile(req, res, filePath)
        return
      } catch {
        // fall through to SPA index
      }

      // Asset-like paths should 404 instead of returning HTML
      if (extname(filePath)) {
        res.writeHead(404).end('Not Found')
        return
      }

      await sendFile(req, res, join(dist, 'index.html'))
    } catch (error) {
      console.error(error)
      res.writeHead(500).end('Internal Server Error')
    }
  }
}

async function main() {
  const dist = join(process.cwd(), 'dist')
  const port = Number(process.env.PORT || 8080)
  const host = process.env.HOST || '0.0.0.0'

  // Product handles for the Squarespace URL redirects (empty set → product URLs fall back to /shop/).
  const productHandles = await readFile(join(process.cwd(), 'src/data/product-catalog.json'), 'utf8')
    .then((text) => new Set(JSON.parse(text).map((product) => product.handle).filter(Boolean)))
    .catch(() => new Set())

  let getExperiments = null
  const configUrl = process.env.EXPERIMENTS_CONFIG_URL
  if (configUrl) {
    let lastError = ''
    const poller = createConfigPoller({
      url: configUrl,
      onError: (error) => {
        const message = String(error?.message || error)
        if (message !== lastError) console.warn(`experiments: config fetch failed: ${message}`)
        lastError = message
      },
    })
    poller.start()
    getExperiments = () => poller.current()
  }

  const server = createServer(
    createSpaHandler({
      dist,
      productHandles,
      getExperiments,
      allowAutomation: process.env.E2E_EXPERIMENTS === '1',
    }),
  )
  server.listen(port, host, () => {
    console.log(`Sunday Rolls SPA listening on http://${host}:${port}`)
  })
}

function isMain() {
  if (!process.argv[1]) return false
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
  } catch {
    return false
  }
}

if (isMain()) await main()
