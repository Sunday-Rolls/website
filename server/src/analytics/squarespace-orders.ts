import { randomUUID } from 'node:crypto'
import { parseCsv } from './manual-import.js'
import type { Order, OrderLine } from './types.js'

export type SquarespaceImportResult = {
  rows: Order[]
  warnings: string[]
  skipped: number
}

function headerIndex(header: string[], names: string[]): number {
  const normalized = header.map((h) => h.trim().toLowerCase())
  for (const name of names) {
    const i = normalized.findIndex((h) => h === name)
    if (i >= 0) return i
  }
  return -1
}

function toNumber(value: string): number {
  const n = Number(String(value ?? '').replace(/[$,]/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

function toIso(value: string): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function financialOk(status: string): boolean {
  const s = status.trim().toLowerCase()
  if (!s) return true // continuation / already attached to a paid header
  return s === 'paid' || s === 'partially_refunded' || s === 'partially refunded'
}

/**
 * Parse a Squarespace (Shopify-shaped) orders CSV into analytics Order rows.
 * Groups multi-lineitem rows by Order ID. Revenue = Subtotal (post-discount merchandise).
 * Fully refunded / cancelled headers are skipped.
 */
export function parseSquarespaceOrdersCsv(text: string): SquarespaceImportResult {
  const warnings: string[] = []
  const table = parseCsv(text)
  if (table.length < 2) {
    return { rows: [], warnings: ['CSV needs a header and data rows'], skipped: 0 }
  }

  const header = table[0]
  const idx = {
    orderId: headerIndex(header, ['order id', 'order number', 'channel order number']),
    email: headerIndex(header, ['email']),
    financial: headerIndex(header, ['financial status']),
    paidAt: headerIndex(header, ['paid at']),
    createdAt: headerIndex(header, ['created at']),
    cancelledAt: headerIndex(header, ['cancelled at']),
    subtotal: headerIndex(header, ['subtotal']),
    shipping: headerIndex(header, ['shipping']),
    refunded: headerIndex(header, ['amount refunded']),
    total: headerIndex(header, ['total']),
    discountAmount: headerIndex(header, ['discount amount']),
    channelName: headerIndex(header, ['channel name']),
    qty: headerIndex(header, ['lineitem quantity']),
    name: headerIndex(header, ['lineitem name']),
    price: headerIndex(header, ['lineitem price']),
    sku: headerIndex(header, ['lineitem sku']),
    variant: headerIndex(header, ['lineitem variant']),
    shipProvince: headerIndex(header, ['shipping province']),
    billProvince: headerIndex(header, ['billing province']),
  }

  if (idx.orderId < 0 || idx.subtotal < 0 || idx.name < 0) {
    return {
      rows: [],
      warnings: ['Squarespace orders CSV requires Order ID, Subtotal, and Lineitem name columns'],
      skipped: 0,
    }
  }

  type Acc = {
    orderId: string
    email: string | null
    financial: string
    cancelled: boolean
    orderedAt: string | null
    subtotal: number
    shipping: number
    refunded: number
    state: string | null
    lines: OrderLine[]
  }

  const byId = new Map<string, Acc>()
  let skipped = 0

  for (let r = 1; r < table.length; r++) {
    const line = table[r]
    const orderId = String(line[idx.orderId] ?? '').trim()
    if (!orderId) {
      warnings.push(`Row ${r + 1}: missing Order ID`)
      continue
    }

    const financial = idx.financial >= 0 ? String(line[idx.financial] ?? '').trim() : ''
    const email = idx.email >= 0 ? String(line[idx.email] ?? '').trim() || null : null
    const cancelledAt = idx.cancelledAt >= 0 ? String(line[idx.cancelledAt] ?? '').trim() : ''
    const paidAt = idx.paidAt >= 0 ? String(line[idx.paidAt] ?? '').trim() : ''
    const createdAt = idx.createdAt >= 0 ? String(line[idx.createdAt] ?? '').trim() : ''
    const channelName = idx.channelName >= 0 ? String(line[idx.channelName] ?? '').trim() : ''
    if (channelName && !/squarespace/i.test(channelName)) {
      warnings.push(`Row ${r + 1}: unexpected channel "${channelName}" (expected Squarespace)`)
    }

    let acc = byId.get(orderId)
    if (!acc) {
      acc = {
        orderId,
        email,
        financial,
        cancelled: Boolean(cancelledAt),
        orderedAt: toIso(paidAt) || toIso(createdAt),
        subtotal: toNumber(line[idx.subtotal] ?? ''),
        shipping: idx.shipping >= 0 ? Math.abs(toNumber(line[idx.shipping] ?? '')) : 0,
        refunded: idx.refunded >= 0 ? Math.abs(toNumber(line[idx.refunded] ?? '')) : 0,
        state:
          (idx.shipProvince >= 0 ? String(line[idx.shipProvince] ?? '').trim() : '') ||
          (idx.billProvince >= 0 ? String(line[idx.billProvince] ?? '').trim() : '') ||
          null,
        lines: [],
      }
      byId.set(orderId, acc)
    } else {
      // Header fields only on the first non-empty financial/email row
      if (!acc.email && email) acc.email = email
      if (!acc.financial && financial) acc.financial = financial
      if (!acc.cancelled && cancelledAt) acc.cancelled = true
      if (!acc.orderedAt) acc.orderedAt = toIso(paidAt) || toIso(createdAt)
      if (!acc.subtotal && idx.subtotal >= 0) acc.subtotal = toNumber(line[idx.subtotal] ?? '')
      if (!acc.shipping && idx.shipping >= 0) acc.shipping = Math.abs(toNumber(line[idx.shipping] ?? ''))
      if (!acc.refunded && idx.refunded >= 0) acc.refunded = Math.abs(toNumber(line[idx.refunded] ?? ''))
      if (!acc.state) {
        acc.state =
          (idx.shipProvince >= 0 ? String(line[idx.shipProvince] ?? '').trim() : '') ||
          (idx.billProvince >= 0 ? String(line[idx.billProvince] ?? '').trim() : '') ||
          null
      }
    }

    const productName = String(line[idx.name] ?? '').trim()
    if (!productName) continue
    const qty = Math.max(1, Math.round(toNumber(line[idx.qty] ?? '1') || 1))
    const unitPrice = idx.price >= 0 ? toNumber(line[idx.price] ?? '') : 0
    const sku = idx.sku >= 0 ? String(line[idx.sku] ?? '').trim() || null : null
    const variant = idx.variant >= 0 ? String(line[idx.variant] ?? '').trim() : ''
    const displayName = variant && !productName.toLowerCase().includes(variant.toLowerCase())
      ? `${productName} – ${variant}`
      : productName

    acc.lines.push({
      productName: displayName,
      productSku: sku,
      category: displayName,
      quantity: qty,
      unitPrice,
      lineRevenue: unitPrice * qty,
    })
  }

  const rows: Order[] = []
  for (const acc of byId.values()) {
    if (acc.cancelled) {
      skipped += 1
      continue
    }
    if (!financialOk(acc.financial)) {
      skipped += 1
      continue
    }
    if (!acc.orderedAt) {
      warnings.push(`Order ${acc.orderId}: missing Paid/Created at`)
      skipped += 1
      continue
    }
    // Fully refunded
    if (acc.refunded > 0 && acc.subtotal > 0 && acc.refunded >= acc.subtotal + acc.shipping - 0.01) {
      skipped += 1
      continue
    }
    const revenue = Math.max(0, acc.subtotal)
    if (!revenue && !acc.lines.length) {
      skipped += 1
      continue
    }
    if (!acc.lines.length) {
      acc.lines.push({
        productName: 'Squarespace order',
        productSku: null,
        category: 'Squarespace order',
        quantity: 1,
        unitPrice: revenue,
        lineRevenue: revenue,
      })
    }

    rows.push({
      id: randomUUID(),
      externalId: `squarespace:${acc.orderId}`,
      channel: 'squarespace',
      source: 'manual',
      orderedAt: acc.orderedAt,
      revenue,
      fees: 0,
      shippingCost: acc.shipping,
      marketingCost: 0,
      state: acc.state,
      customerEmail: acc.email,
      isReturning: false,
      trafficSource: null,
      lines: acc.lines,
    })
  }

  rows.sort((a, b) => a.orderedAt.localeCompare(b.orderedAt))
  return { rows, warnings, skipped }
}
