#!/usr/bin/env node
/**
 * Usage: npm run analytics:import-sheet -- /path/to/Sunday\ Rolls\ Sales\ Tracker.xlsx
 */
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { syncSalesTrackerFromBuffer } from '../analytics/sales-tracker-sync.js'
import { createMemoryAnalyticsStore, createPgAnalyticsStore } from '../analytics/store.js'

const filePath = process.argv[2]
if (!filePath) {
  console.error('Usage: npm run analytics:import-sheet -- <path-to-xlsx>')
  process.exit(1)
}

const bytes = await readFile(filePath)
const databaseUrl = process.env.DATABASE_URL?.trim()
let pool: pg.Pool | undefined
const store = databaseUrl
  ? createPgAnalyticsStore((pool = new pg.Pool({ connectionString: databaseUrl, max: 2 })))
  : createMemoryAnalyticsStore()

if (databaseUrl) await store.migrate()
else console.warn('DATABASE_URL unset — parsed only, not persisted')

const result = await syncSalesTrackerFromBuffer(store, bytes, filePath, { replaceAll: true })
console.log(result)
await pool?.end()
