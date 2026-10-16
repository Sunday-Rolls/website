import { createRequire } from 'node:module'
import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import {
  fetchShopifyActiveProducts,
  loadShopifyCredentialsFromEnv,
  type ShopifyActiveProduct,
} from './analytics/shopify.js'

const require = createRequire(import.meta.url)
const catalog = require('./data/review-qr-products.json') as {
  products: Array<{ handle: string; title: string; category?: string | null }>
}

export type ReviewQrSiteTarget = 'pages' | 'live'

export const REVIEW_QR_SITE_TARGETS: Record<
  ReviewQrSiteTarget,
  { label: string; url: string; basePath: string }
> = {
  pages: {
    label: 'GitHub Pages',
    url: 'https://sunday-rolls.github.io/website',
    basePath: '/website',
  },
  live: {
    label: 'Live site',
    url: 'https://www.sundayrollsgolf.com',
    basePath: '/',
  },
}

/** Cutouts per product page (3×3 on letter). */
export const REVIEW_QR_CUTOUTS_PER_PAGE = 9

export function parseReviewQrTarget(value: string | undefined): ReviewQrSiteTarget {
  return value === 'live' ? 'live' : 'pages'
}

export function reviewQrLandingUrl(target: ReviewQrSiteTarget, handle: string): string {
  const site = REVIEW_QR_SITE_TARGETS[target]
  const origin = site.url.replace(/\/$/, '')
  const base = site.basePath === '/' ? '' : site.basePath.replace(/\/$/, '')
  if (base && (origin.endsWith(base) || origin.endsWith(`${base}/`))) {
    return `${origin}/products/${encodeURIComponent(handle)}?review=1`
  }
  return `${origin}${base}/products/${encodeURIComponent(handle)}?review=1`
}

/** Fallback when Shopify is unavailable — full local catalog (all categories). */
export function listCatalogReviewQrProducts(): ShopifyActiveProduct[] {
  const products = Array.isArray(catalog.products) ? catalog.products : []
  return products
    .filter((p) => p.handle && p.title)
    .map((p) => ({ handle: p.handle, title: p.title }))
    .sort((a, b) => a.title.localeCompare(b.title))
}

/** Prefer live Shopify active products; fall back to bundled catalog. */
export async function loadReviewQrProducts(): Promise<{
  products: ShopifyActiveProduct[]
  source: 'shopify' | 'catalog'
}> {
  const creds = loadShopifyCredentialsFromEnv()
  if (creds) {
    try {
      const products = await fetchShopifyActiveProducts(creds)
      if (products.length) return { products, source: 'shopify' }
    } catch (error) {
      console.warn(
        'Shopify product fetch for QR PDF failed; using catalog fallback',
        error instanceof Error ? error.message : error,
      )
    }
  }
  return { products: listCatalogReviewQrProducts(), source: 'catalog' }
}

type PdfDoc = InstanceType<typeof PDFDocument>

function drawCutoutCell(
  doc: PdfDoc,
  opts: {
    x: number
    y: number
    cellWidth: number
    cellHeight: number
    qrSize: number
    png: Buffer
    title: string
    handle: string
  },
) {
  const { x, y, cellWidth, cellHeight, qrSize, png, title, handle } = opts

  doc
    .save()
    .lineWidth(0.75)
    .dash(3, { space: 2 })
    .strokeColor('#c9bfa8')
    .rect(x, y, cellWidth, cellHeight)
    .stroke()
    .undash()
    .restore()

  const imgX = x + (cellWidth - qrSize) / 2
  const imgY = y + 10
  doc.image(png, imgX, imgY, { width: qrSize, height: qrSize })

  const textTop = imgY + qrSize + 8
  doc
    .fillColor('#1b3a2f')
    .font('Times-Bold')
    .fontSize(9)
    .text(title, x + 6, textTop, {
      width: cellWidth - 12,
      align: 'center',
      height: 28,
      ellipsis: true,
    })
  doc
    .fillColor('#666666')
    .font('Helvetica')
    .fontSize(7)
    .text(handle, x + 6, textTop + 30, { width: cellWidth - 12, align: 'center' })
}

/** One letter page filled with identical cutouts for a single product. */
export function drawProductCutoutPage(
  doc: PdfDoc,
  product: ShopifyActiveProduct,
  png: Buffer,
  meta: { siteLabel: string; siteUrl: string },
) {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right
  const cols = 3
  const rows = 3
  const gap = 12

  doc
    .fillColor('#1b3a2f')
    .font('Times-Bold')
    .fontSize(16)
    .text(product.title, doc.page.margins.left, doc.page.margins.top, { width: pageWidth })
  doc
    .fillColor('#555555')
    .font('Helvetica')
    .fontSize(8)
    .text(
      `${product.handle} · ${meta.siteLabel} · Scan → leave a review · Cut along dashed lines`,
      { width: pageWidth },
    )

  const headerBottom = doc.y + 10
  const gridHeight = doc.page.height - doc.page.margins.bottom - headerBottom
  const cellWidth = (pageWidth - gap * (cols - 1)) / cols
  const cellHeight = (gridHeight - gap * (rows - 1)) / rows
  const qrSize = Math.min(150, cellWidth - 16, cellHeight - 56)

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = doc.page.margins.left + col * (cellWidth + gap)
      const y = headerBottom + row * (cellHeight + gap)
      drawCutoutCell(doc, {
        x,
        y,
        cellWidth,
        cellHeight,
        qrSize,
        png,
        title: product.title,
        handle: product.handle,
      })
    }
  }
}

export async function buildReviewQrPdf(target: ReviewQrSiteTarget): Promise<{
  pdf: Buffer
  count: number
  source: 'shopify' | 'catalog'
  pages: number
}> {
  const { products, source } = await loadReviewQrProducts()
  if (!products.length) {
    throw new Error('No products available for review QR export')
  }

  const site = REVIEW_QR_SITE_TARGETS[target]
  const doc = new PDFDocument({
    size: 'LETTER',
    margin: 36,
    info: {
      Title: 'Sunday Rolls — Product review QR codes',
      Author: 'Sunday Rolls',
      Subject: `One page per product · ${site.label} (${site.url})`,
    },
  })

  const chunks: Buffer[] = []
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  for (let index = 0; index < products.length; index += 1) {
    const product = products[index]!
    if (index > 0) doc.addPage()

    const url = reviewQrLandingUrl(target, product.handle)
    const png = await QRCode.toBuffer(url, {
      type: 'png',
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'M',
    })

    drawProductCutoutPage(doc, product, png, {
      siteLabel: site.label,
      siteUrl: site.url,
    })
  }

  doc.end()
  const pdf = await done
  return { pdf, count: products.length, source, pages: products.length }
}
