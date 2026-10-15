#!/usr/bin/env node
/**
 * Zero-dependency static file server with SPA fallback for Railway.
 * Serves ./dist, rewrites unknown paths to index.html, exposes GET /health.
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
