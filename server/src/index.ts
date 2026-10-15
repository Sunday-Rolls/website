import { serve } from '@hono/node-server'
import pg from 'pg'
import { loadGa4CredentialsFromEnv, syncGa4ToStore } from './analytics/ga4-sync.js'
import { createMemoryAnalyticsStore, createPgAnalyticsStore, type AnalyticsStore } from './analytics/store.js'
import { seedDemoStore } from './analytics/seed.js'
import { createApp } from './app.js'
import { ensureBootstrapUsers } from './dashboard/routes.js'
import { loadConfig } from './env.js'
import { createMailer } from './mail.js'
import { createPgReviewStore } from './reviews.js'

const config = loadConfig()
const { sendContactEmail } = createMailer(config)

const pool = config.databaseUrl
  ? new pg.Pool({ connectionString: config.databaseUrl, max: 5 })
  : undefined

let reviews: ReturnType<typeof createPgReviewStore> | undefined
let analytics: AnalyticsStore | undefined

const bootstrapUsers = config.dashboardBootstrapUsers.length
  ? config.dashboardBootstrapUsers
  : [
      { email: 'stwolfe10@gmail.com', name: 'Sam' },
      { email: 'funk20alex@gmail.com', name: 'Alex' },
      { email: 'derickkuchera04@gmail.com', name: 'Derick' },
    ]

async function setupDashboard(store: AnalyticsStore, label: string) {
  await store.migrate()
  if (config.dashboardDemoPassword) {
    await ensureBootstrapUsers(
      store,
      bootstrapUsers.map((u) => ({
        email: u.email,
        name: u.name || u.email,
        password: config.dashboardDemoPassword!,
      })),
    )
    console.log(`Dashboard users ensured (${bootstrapUsers.length}) on ${label}`)
  } else {
    console.log('DASHBOARD_DEMO_PASSWORD unset — create users with npm run user:set-password')
  }
  if (config.analyticsSeedDemoOnBoot) {
    await seedDemoStore(store)
    console.log(`Seeded analytics demo data on ${label}`)
  }
  const ga4Creds = loadGa4CredentialsFromEnv()
  if (config.ga4SyncOnBoot && ga4Creds) {
    try {
      const result = await syncGa4ToStore(store, ga4Creds, { days: config.ga4SyncDays })
      console.log(
        `GA4 sync on boot (${label}): ${result.trafficRows} traffic days, ${result.productViewRows} product rows, ${result.adSpendRows} ad spend rows`,
      )
    } catch (error) {
      console.error('GA4 sync on boot failed:', error instanceof Error ? error.message : error)
    }
  } else if (config.ga4SyncOnBoot && !ga4Creds) {
    console.warn('GA4_SYNC_ON_BOOT set but GOOGLE_SERVICE_ACCOUNT_JSON / GA4_PROPERTY_RESOURCE missing')
  }
}

if (pool) {
  reviews = createPgReviewStore(pool)
  await reviews.migrate()

  if (config.dashboardEnabled) {
    analytics = createPgAnalyticsStore(pool)
    await setupDashboard(analytics, 'postgres')
  }
} else if (config.dashboardEnabled && config.analyticsSeedDemoOnBoot) {
  analytics = createMemoryAnalyticsStore()
  await setupDashboard(analytics, 'memory')
  console.warn('DATABASE_URL unset — dashboard running in-memory (data lost on restart)')
} else {
  console.warn('DATABASE_URL is not set; /reviews and /dashboard will be unavailable')
}

const app = createApp({
  config,
  sendContactEmail,
  reviews,
  analytics,
})

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Sunday Rolls API listening on :${info.port}`)
  console.log(`CORS allowlist: ${config.corsOrigins.join(', ') || '(empty)'}`)
  if (analytics) console.log(`Dashboard: http://localhost:${info.port}/dashboard/`)
})
