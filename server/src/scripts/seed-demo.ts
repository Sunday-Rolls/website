#!/usr/bin/env node
import pg from 'pg'
import { seedDemoStore } from '../analytics/seed.js'
import { createMemoryAnalyticsStore, createPgAnalyticsStore } from '../analytics/store.js'

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) {
  const store = createMemoryAnalyticsStore()
  await seedDemoStore(store)
  console.log('Seeded in-memory store (no DATABASE_URL)')
  process.exit(0)
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 })
const store = createPgAnalyticsStore(pool)
await store.migrate()
await seedDemoStore(store)
console.log('Demo data seeded')
await pool.end()
