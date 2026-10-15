import pg from 'pg'
import { loadGa4CredentialsFromEnv, syncGa4ToStore } from '../analytics/ga4-sync.js'
import { createPgAnalyticsStore } from '../analytics/store.js'

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const creds = loadGa4CredentialsFromEnv()
if (!creds) {
  console.error('Set GOOGLE_SERVICE_ACCOUNT_JSON and GA4_PROPERTY_RESOURCE')
  process.exit(1)
}

const days = Math.max(1, Math.min(Number(process.env.GA4_SYNC_DAYS ?? 90) || 90, 365))
const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 })
const store = createPgAnalyticsStore(pool)
await store.migrate()
const result = await syncGa4ToStore(store, creds, { days })
console.log(JSON.stringify(result, null, 2))
await pool.end()
