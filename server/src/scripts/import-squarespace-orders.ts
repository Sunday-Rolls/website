#!/usr/bin/env node
/**
 * Backfill Squarespace orders CSV into analytics_orders.
 *
 * Usage:
 *   DATABASE_URL=… npm run analytics:import-squarespace -- /path/to/orders.csv
 */
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { parseSquarespaceOrdersCsv } from '../analytics/squarespace-orders.js'
import { createMemoryAnalyticsStore, createPgAnalyticsStore } from '../analytics/store.js'

const filePath = process.argv[2]
if (!filePath) {
  console.error('Usage: npm run analytics:import-squarespace -- <path-to-orders.csv>')
  process.exit(1)
}

const text = await readFile(filePath, 'utf8')
const parsed = parseSquarespaceOrdersCsv(text)
console.log(
  JSON.stringify(
    {
      parsed: parsed.rows.length,
      skipped: parsed.skipped,
      warnings: parsed.warnings.slice(0, 12),
      warningCount: parsed.warnings.length,
      revenueSum: Math.round(parsed.rows.reduce((s, r) => s + r.revenue, 0) * 100) / 100,
      dateRange: parsed.rows.length
        ? {
            first: parsed.rows[0].orderedAt,
            last: parsed.rows[parsed.rows.length - 1].orderedAt,
          }
        : null,
    },
    null,
    2,
  ),
)

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) {
  console.warn('DATABASE_URL unset — dry parse only')
  process.exit(0)
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 })
const store = createPgAnalyticsStore(pool)
await store.migrate()

const before = (await store.listOrders()).filter((o) => o.channel === 'squarespace').length
const upserted = await store.upsertOrders(parsed.rows)
const after = (await store.listOrders()).filter((o) => o.channel === 'squarespace').length

const sync = await store.startSync('squarespace-csv')
await store.finishSync(
  sync.id,
  'ok',
  `Squarespace CSV: ${upserted} orders upserted (${filePath.split('/').pop()})`,
  upserted,
)

console.log(JSON.stringify({ upserted, squarespaceBefore: before, squarespaceAfter: after }, null, 2))
await pool.end()
