#!/usr/bin/env node
/**
 * Zero-dependency static file server with SPA fallback for Railway.
 * Serves ./dist, returns HTTP 404 + 404.html for unknown paths (soft-404 fix),
 * exposes GET /health.
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const dist = join(process.cwd(), 'dist')
const port = Number(process.env.PORT || 8080)
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

async function sendFile(res, filePath, status = 200) {
  const body = await readFile(filePath)
  const type = TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream'
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': body.length,
    'Cache-Control': extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  })
  res.end(body)
}

async function sendNotFound(res) {
  try {
    await sendFile(res, join(dist, '404.html'), 404)
  } catch {
    try {
      await sendFile(res, join(dist, 'index.html'), 404)
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Not Found')
    }
  }
}

const server = createServer(async (req, res) => {
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
      // fall through
    }

    // Try sibling .html shell (e.g. /shop → shop.html) before 404
    if (!extname(filePath)) {
      const htmlSibling = `${filePath}.html`
      try {
        await stat(htmlSibling)
        await sendFile(res, htmlSibling)
        return
      } catch {
        // unknown route
      }
    }

    // Asset-like paths should 404 without HTML
    if (extname(filePath)) {
      res.writeHead(404).end('Not Found')
      return
    }

    await sendNotFound(res)
  } catch (error) {
    console.error(error)
    res.writeHead(500).end('Internal Server Error')
  }
})

server.listen(port, host, () => {
  console.log(`Sunday Rolls SPA listening on http://${host}:${port}`)
})
