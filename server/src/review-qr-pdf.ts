import { createRequire } from 'node:module'
import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'

const require = createRequire(import.meta.url)
const catalog = require('./data/review-qr-products.json') as {
  products: Array<{ handle: string; title: string }>
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

export function listReviewQrProducts(): Array<{ handle: string; title: string }> {
  return Array.isArray(catalog.products) ? catalog.products : []
}

export async function buildReviewQrPdf(target: ReviewQrSiteTarget): Promise<Buffer> {
  const products = listReviewQrProducts()
  if (!products.length) {
    throw new Error('No products configured for review QR export')
  }

  const site = REVIEW_QR_SITE_TARGETS[target]
  const doc = new PDFDocument({
    size: 'LETTER',
    margin: 36,
    info: {
      Title: 'Sunday Rolls — Product review QR codes',
      Author: 'Sunday Rolls',
      Subject: `Review QR codes for ${site.label} (${site.url})`,
    },
  })

  const chunks: Buffer[] = []
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right
  const cols = 3
  const gap = 16
  const cellWidth = (pageWidth - gap * (cols - 1)) / cols
  const qrSize = Math.min(140, cellWidth - 16)
  const cellHeight = qrSize + 72
  let y = doc.page.margins.top

  doc
    .fillColor('#1b3a2f')
    .font('Times-Bold')
    .fontSize(18)
    .text('Sunday Rolls — Review QR codes', { width: pageWidth })
  doc
    .fillColor('#555555')
    .font('Helvetica')
    .fontSize(9)
    .text(`${site.label} · ${site.url}`, { width: pageWidth })
  doc
    .fontSize(8)
    .text('Scan to open the product page with the leave-a-review form. Cut along the dashed boxes.', {
      width: pageWidth,
    })
  y = doc.y + 16

  for (let index = 0; index < products.length; index += 1) {
    const product = products[index]!
    const col = index % cols

    if (col === 0 && index > 0) {
      y += cellHeight + gap
    }
    if (y + cellHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage()
      y = doc.page.margins.top
    }

    const x = doc.page.margins.left + col * (cellWidth + gap)
    const url = reviewQrLandingUrl(target, product.handle)
    const png = await QRCode.toBuffer(url, {
      type: 'png',
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'M',
    })

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
      .text(product.title, x + 6, textTop, {
        width: cellWidth - 12,
        align: 'center',
        height: 28,
        ellipsis: true,
      })
    doc
      .fillColor('#666666')
      .font('Helvetica')
      .fontSize(7)
      .text(product.handle, x + 6, textTop + 30, { width: cellWidth - 12, align: 'center' })
  }

  doc.end()
  return done
}
