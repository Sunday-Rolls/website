/**
 * Live inventory: on hand = received (starting count + shipments) − units sold since the count.
 *
 * Inputs, all kept in analytics_integration_state (no tables of their own):
 * - `inventory-sheet`: the Sales Tracker's `SKUs` and `Inventory In` tabs, plus eBay and in-person
 *   sales from the SKU column on the `eBay` and `Other` tabs. Written by the Sales Tracker sync.
 * - `inventory-etsy`: Etsy sales by receipt (kept even after the sheet's Etsy row replaces the live
 *   order, which has no SKU) and Etsy's listed quantity per SKU. Written by the Etsy sync.
 * - `inventory-shopify`: Shopify's listed quantity per SKU and product title → SKU, used for older
 *   order lines without a SKU. Written by the Shopify sync.
 * Shopify sales come from the live Shopify orders themselves.
 */
import { storeDay } from './period.js'
import { unwrapCell } from './sheet-import.js'
import type { EtsyReceiptRaw } from './etsy.js'
import type { Order } from './types.js'

export const INVENTORY_SHEET_KEY = 'inventory-sheet'
export const INVENTORY_ETSY_KEY = 'inventory-etsy'
export const INVENTORY_SHOPIFY_KEY = 'inventory-shopify'

/** At or below this many on hand a SKU shows as low stock. */
export const LOW_STOCK = 10
/** Weekly sales pace looks at this many recent days. */
const PACE_DAYS = 28

export type InventoryChannel = 'shopify' | 'etsy' | 'ebay' | 'other'

export type InventorySku = { sku: string; product: string; style: string; category: string }

export type InventoryReceipt = { date: string; sku: string; qty: number; type: string; notes: string }

/** One sold line. `sku` is null when the sale couldn't be matched to a SKU. */
export type InventorySale = {
  key: string
  channel: InventoryChannel
  sku: string | null
  product: string
  quantity: number
  soldAt: string
  ref: string
}

export type SheetInventory = {
  skus: InventorySku[]
  received: InventoryReceipt[]
  sales: InventorySale[]
  warnings: string[]
  syncedAt: string
}

export type EtsyInventory = {
  /** Receipt id → its sold lines. */
  sales: Record<string, InventorySale[]>
  /** SKU → quantity listed on Etsy (active listings). Null when listings couldn't be read. */
  listed: Record<string, number> | null
  syncedAt: string
}

export type ShopifyInventory = {
  listed: Record<string, number>
  /** Product title (and "title - variant") → SKU. */
  titleToSku: Record<string, string>
  syncedAt: string
}

// ---------- Sales Tracker tabs ----------

type Rows = unknown[][]

function text(value: unknown): string {
  const v = unwrapCell(value as never)
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v).trim()
}

/** YYYY-MM-DD from a sheet date cell (Date, ISO text or m/d/yyyy), else null. */
export function sheetDate(value: unknown): string | null {
  const v = unwrapCell(value as never)
  if (v == null || v === '') return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10)
  if (typeof v === 'number' && Number.isFinite(v) && v > 20000 && v < 80000) {
    // Spreadsheet serial day.
    return new Date(Date.UTC(1899, 11, 30) + v * 86_400_000).toISOString().slice(0, 10)
  }
  const s = String(v).trim()
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (us) {
    const year = us[3].length === 2 ? `20${us[3]}` : us[3]
    return `${year}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`
  }
  return null
}

function number(value: unknown): number | null {
  const v = unwrapCell(value as never)
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v ?? '').replace(/[,\s]/g, '')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** First row (of the top 6) that has every `required` header; header name → column index. */
function findHeader(rows: Rows, required: string[]): { row: number; col: Map<string, number> } | null {
  for (let r = 0; r < Math.min(rows.length, 6); r++) {
    const col = new Map<string, number>()
    rows[r].forEach((cell, i) => {
      const name = norm(text(cell))
      if (name && !col.has(name)) col.set(name, i)
    })
    if (required.every((h) => col.has(h))) return { row: r, col }
  }
  return null
}

function pick(col: Map<string, number>, ...names: string[]): number {
  for (const n of names) {
    const i = col.get(n)
    if (i != null) return i
  }
  return -1
}

const truthy = (v: unknown) => {
  const t = norm(text(v))
  return t === 'true' || t === 'yes' || t === 'y' || t === '1'
}

/**
 * Parse the inventory tabs. `sheetRows(name)` returns a tab's rows (empty when the tab is missing).
 * eBay and Other rows count as one unit each: those tabs log one row per order.
 */
export function parseInventorySheets(sheetRows: (name: string) => Rows, syncedAt = new Date().toISOString()): SheetInventory {
  const warnings: string[] = []

  const skus: InventorySku[] = []
  const skuRows = sheetRows('SKUs')
  const skuHead = findHeader(skuRows, ['sku'])
  if (!skuHead) warnings.push('Missing "SKUs" tab')
  else {
    const c = skuHead.col
    for (const row of skuRows.slice(skuHead.row + 1)) {
      const sku = text(row[c.get('sku')!])
      if (!sku) continue
      skus.push({
        sku,
        product: text(row[pick(c, 'product')]) || sku,
        style: text(row[pick(c, 'style')]),
        category: text(row[pick(c, 'category')]) || 'Other',
      })
    }
  }

  const received: InventoryReceipt[] = []
  const inRows = sheetRows('Inventory In')
  const inHead = findHeader(inRows, ['sku', 'qty'])
  if (!inHead) warnings.push('Missing "Inventory In" tab')
  else {
    const c = inHead.col
    let undated = 0
    for (const row of inRows.slice(inHead.row + 1)) {
      const sku = text(row[c.get('sku')!])
      const qty = number(row[c.get('qty')!])
      if (!sku || qty == null) continue
      const date = sheetDate(row[pick(c, 'date')])
      if (!date) {
        undated++
        continue
      }
      received.push({
        date,
        sku,
        qty,
        type: text(row[pick(c, 'type')]) || 'Shipment',
        notes: text(row[pick(c, 'notes')]),
      })
    }
    if (undated) warnings.push(`${undated} Inventory In row${undated === 1 ? '' : 's'} with a quantity but no date (skipped)`)
  }

  const sales: InventorySale[] = []
  const ebayRows = sheetRows('eBay')
  const ebayHead = findHeader(ebayRows, ['sku', 'submitted on'])
  if (ebayHead) {
    const c = ebayHead.col
    const iDate = c.get('submitted on')!
    const iCancel = pick(c, 'canceled', 'cancelled')
    const iRef = pick(c, 'order number', 'order id')
    for (const row of ebayRows.slice(ebayHead.row + 1)) {
      const date = sheetDate(row[iDate])
      if (!date || (iCancel >= 0 && truthy(row[iCancel]))) continue
      const ref = text(row[iRef]) || `row ${ebayRows.indexOf(row) + 1}`
      const sku = text(row[c.get('sku')!]) || null
      sales.push({ key: `ebay:${ref}`, channel: 'ebay', sku, product: text(row[pick(c, 'product')]), quantity: 1, soldAt: date, ref })
    }
  }

  const otherRows = sheetRows('Other')
  const otherHead = findHeader(otherRows, ['sku', 'date ordered'])
  if (otherHead) {
    const c = otherHead.col
    const iDate = c.get('date ordered')!
    const iRef = pick(c, 'order id')
    for (const row of otherRows.slice(otherHead.row + 1)) {
      const date = sheetDate(row[iDate])
      if (!date) continue
      const ref = text(row[iRef]) || `row ${otherRows.indexOf(row) + 1}`
      const sku = text(row[c.get('sku')!]) || null
      sales.push({ key: `other:${ref}`, channel: 'other', sku, product: text(row[pick(c, 'product')]), quantity: 1, soldAt: date, ref })
    }
  }

  return { skus, received, sales, warnings, syncedAt }
}

// ---------- Etsy ----------

/** SKU → quantity across a listing inventory's enabled offerings. */
export function etsyListedBySku(
  inventories: Array<{ products?: Array<{ sku?: string | null; is_deleted?: boolean; offerings?: Array<{ quantity?: number; is_enabled?: boolean; is_deleted?: boolean }> }> }>,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const inv of inventories) {
    for (const p of inv.products ?? []) {
      const sku = (p.sku || '').trim()
      if (!sku || p.is_deleted) continue
      const qty = (p.offerings ?? [])
        .filter((o) => o.is_enabled !== false && !o.is_deleted)
        .reduce((s, o) => s + (o.quantity ?? 0), 0)
      out[sku] = (out[sku] ?? 0) + qty
    }
  }
  return out
}

/**
 * Fold fetched receipts into the stored Etsy sales: counted receipts are (re)written, cancelled or
 * refunded ones removed, and receipts outside this fetch kept. A line without a SKU takes its
 * listing's SKU when that listing has exactly one.
 */
export function mergeEtsySales(
  previous: Record<string, InventorySale[]>,
  receipts: EtsyReceiptRaw[],
  isCounted: (r: EtsyReceiptRaw) => boolean,
  listingSkus: Map<string, string[]> = new Map(),
): Record<string, InventorySale[]> {
  const next = { ...previous }
  for (const r of receipts) {
    const id = String(r.receipt_id)
    if (!isCounted(r)) {
      delete next[id]
      continue
    }
    const created = r.created_timestamp ?? r.create_timestamp ?? 0
    const soldAt = new Date(created * 1000).toISOString()
    next[id] = (r.transactions ?? []).map((t, i) => {
      const own = t.sku?.trim() || null
      const fromListing = t.listing_id != null ? listingSkus.get(String(t.listing_id)) : undefined
      return {
        key: `etsy:${id}:${t.transaction_id ?? i}`,
        channel: 'etsy' as const,
        sku: own ?? (fromListing && fromListing.length === 1 ? fromListing[0] : null),
        product: (t.title || 'Etsy item').trim(),
        quantity: t.quantity ?? 1,
        soldAt,
        ref: `receipt ${id}`,
      }
    })
  }
  return next
}

// ---------- Shopify ----------

export type ShopifyVariantStock = { sku: string | null; productTitle: string; variantTitle: string; quantity: number | null; active: boolean }

export function shopifyInventory(variants: ShopifyVariantStock[], syncedAt = new Date().toISOString()): ShopifyInventory {
  const listed: Record<string, number> = {}
  const titleToSku: Record<string, string> = {}
  for (const v of variants) {
    const sku = (v.sku || '').trim()
    if (!sku) continue
    if (v.active && v.quantity != null) listed[sku] = (listed[sku] ?? 0) + v.quantity
    titleToSku[norm(v.productTitle)] = sku
    if (v.variantTitle && v.variantTitle !== 'Default Title') titleToSku[norm(`${v.productTitle} - ${v.variantTitle}`)] = sku
  }
  return { listed, titleToSku, syncedAt }
}

/** Sold lines from live Shopify orders; lines without a SKU are matched by product title. */
export function shopifySales(orders: Order[], titleToSku: Record<string, string> = {}): InventorySale[] {
  const out: InventorySale[] = []
  for (const o of orders) {
    if (o.channel !== 'shopify' || o.source !== 'shopify') continue
    o.lines.forEach((line, i) => {
      const sku = line.productSku?.trim() || titleToSku[norm(line.productName)] || null
      out.push({
        key: `${o.externalId}:${i}`,
        channel: 'shopify',
        sku,
        product: line.productName,
        quantity: line.quantity || 1,
        soldAt: o.orderedAt,
        ref: o.externalId.replace(/^shopify:/, 'order '),
      })
    })
  }
  return out
}

// ---------- View ----------

export type InventoryStatus = 'not-counted' | 'out' | 'low' | 'ok'

export type InventoryRow = InventorySku & {
  counted: boolean
  countDate: string | null
  received: number
  sold: number
  soldBy: Record<InventoryChannel, number>
  onHand: number | null
  weeklyPace: number
  weeksLeft: number | null
  listed: { shopify: number | null; etsy: number | null; ebay: number | null }
  mismatch: boolean
  status: InventoryStatus
}

export type InventoryMovement = { date: string; sku: string; product: string; source: string; ref: string; qty: number }

export type InventoryView = {
  ready: boolean
  lowStock: number
  countDate: string | null
  kpis: { headcovers: number; towels: number; low: number; out: number; mismatched: number; notCounted: number }
  rows: InventoryRow[]
  movements: InventoryMovement[]
  unmatched: Array<{ date: string; channel: InventoryChannel; ref: string; product: string; sku: string | null }>
  sources: { sheet: string | null; etsy: string | null; shopify: string | null; etsyListed: boolean }
  warnings: string[]
}

const CHANNEL_LABEL: Record<InventoryChannel, string> = { shopify: 'Shopify', etsy: 'Etsy', ebay: 'eBay', other: 'In person' }

export function buildInventoryView(input: {
  sheet: SheetInventory | null
  etsy: EtsyInventory | null
  shopify: ShopifyInventory | null
  orders: Order[]
  now?: Date
  lowStock?: number
}): InventoryView {
  const now = input.now ?? new Date()
  const lowStock = input.lowStock ?? LOW_STOCK
  const today = storeDay(now.toISOString())
  const paceStart = storeDay(new Date(now.getTime() - PACE_DAYS * 86_400_000).toISOString())
  const sheet = input.sheet
  const skus = sheet?.skus ?? []
  const known = new Set(skus.map((s) => s.sku))

  const sales: InventorySale[] = [
    ...shopifySales(input.orders, input.shopify?.titleToSku),
    ...Object.values(input.etsy?.sales ?? {}).flat(),
    ...(sheet?.sales ?? []),
  ]
  const saleDay = (s: InventorySale) => (s.soldAt.length > 10 ? storeDay(s.soldAt) : s.soldAt)

  const receivedBySku = new Map<string, InventoryReceipt[]>()
  for (const r of sheet?.received ?? []) {
    const list = receivedBySku.get(r.sku) ?? []
    list.push(r)
    receivedBySku.set(r.sku, list)
  }
  const salesBySku = new Map<string, InventorySale[]>()
  for (const s of sales) {
    if (!s.sku || !known.has(s.sku)) continue
    const list = salesBySku.get(s.sku) ?? []
    list.push(s)
    salesBySku.set(s.sku, list)
  }

  const rows: InventoryRow[] = skus.map((meta) => {
    const ins = receivedBySku.get(meta.sku) ?? []
    const starts = ins.filter((r) => norm(r.type) === 'starting count').map((r) => r.date).sort()
    const countDate = starts[0] ?? ins.map((r) => r.date).sort()[0] ?? null
    const skuSales = salesBySku.get(meta.sku) ?? []
    const since = countDate ? skuSales.filter((s) => saleDay(s) >= countDate) : []
    const soldBy: Record<InventoryChannel, number> = { shopify: 0, etsy: 0, ebay: 0, other: 0 }
    for (const s of since) soldBy[s.channel] += s.quantity
    const sold = since.reduce((t, s) => t + s.quantity, 0)
    const received = countDate ? ins.filter((r) => r.date >= countDate).reduce((t, r) => t + r.qty, 0) : 0
    const onHand = countDate ? received - sold : null
    const recent = skuSales.filter((s) => saleDay(s) > paceStart && saleDay(s) <= today).reduce((t, s) => t + s.quantity, 0)
    const weeklyPace = Math.round((recent / (PACE_DAYS / 7)) * 10) / 10
    const weeksLeft = onHand != null && weeklyPace > 0 ? Math.max(0, Math.round((onHand / weeklyPace) * 10) / 10) : null
    const listed = {
      shopify: input.shopify ? (input.shopify.listed[meta.sku] ?? null) : null,
      etsy: input.etsy?.listed ? (input.etsy.listed[meta.sku] ?? null) : null,
      ebay: null,
    }
    const mismatch = onHand != null && [listed.shopify, listed.etsy].some((q) => q != null && q !== Math.max(0, onHand))
    const status: InventoryStatus = onHand == null ? 'not-counted' : onHand <= 0 ? 'out' : onHand <= lowStock ? 'low' : 'ok'
    return { ...meta, counted: onHand != null, countDate, received, sold, soldBy, onHand, weeklyPace, weeksLeft, listed, mismatch, status }
  })

  const counted = rows.filter((r) => r.counted)
  const sumOnHand = (pred: (r: InventoryRow) => boolean) => counted.filter(pred).reduce((t, r) => t + Math.max(0, r.onHand ?? 0), 0)
  const firstCount = counted.map((r) => r.countDate!).sort()[0] ?? null

  const productOf = new Map(skus.map((s) => [s.sku, s.product]))
  const moves: InventoryMovement[] = [
    ...(sheet?.received ?? []).map((r) => ({
      date: r.date,
      sku: r.sku,
      product: productOf.get(r.sku) ?? r.sku,
      source: r.type,
      ref: r.notes || 'Inventory In',
      qty: r.qty,
    })),
    ...sales
      .filter((s) => s.sku && known.has(s.sku) && firstCount && saleDay(s) >= firstCount)
      .map((s) => ({
        date: saleDay(s),
        sku: s.sku!,
        product: productOf.get(s.sku!) ?? s.product,
        source: CHANNEL_LABEL[s.channel],
        ref: s.ref,
        qty: -s.quantity,
      })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10)

  const unmatched = sales
    .filter((s) => (!s.sku || !known.has(s.sku)) && firstCount && saleDay(s) >= firstCount)
    .map((s) => ({ date: saleDay(s), channel: s.channel, ref: s.ref, product: s.product, sku: s.sku }))
    .sort((a, b) => b.date.localeCompare(a.date))

  const warnings = [...(sheet?.warnings ?? [])]
  for (const r of sheet?.received ?? []) {
    if (!known.has(r.sku)) warnings.push(`Inventory In has SKU "${r.sku}", which isn't on the SKUs tab`)
  }

  return {
    ready: counted.length > 0,
    lowStock,
    countDate: firstCount,
    kpis: {
      headcovers: sumOnHand((r) => norm(r.category) === 'headcover'),
      towels: sumOnHand((r) => norm(r.category) === 'towel'),
      low: rows.filter((r) => r.status === 'low').length,
      out: rows.filter((r) => r.status === 'out').length,
      mismatched: rows.filter((r) => r.mismatch).length,
      notCounted: rows.filter((r) => !r.counted).length,
    },
    rows,
    movements: moves,
    unmatched,
    sources: {
      sheet: sheet?.syncedAt ?? null,
      etsy: input.etsy?.syncedAt ?? null,
      shopify: input.shopify?.syncedAt ?? null,
      etsyListed: Boolean(input.etsy?.listed),
    },
    warnings,
  }
}
