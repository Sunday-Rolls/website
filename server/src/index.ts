import { serve } from '@hono/node-server'
import pg from 'pg'
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
