import { serve } from '@hono/node-server'
import pg from 'pg'
import { loadGa4CredentialsFromEnv, syncGa4ToStore } from './analytics/ga4-sync.js'
import { createMemoryAnalyticsStore, createPgAnalyticsStore, type AnalyticsStore } from './analytics/store.js'
import { seedDemoStore } from './analytics/seed.js'
import { createApp } from './app.js'
import { ensureBootstrapUsers } from './dashboard/routes.js'
import { loadConfig } from './env.js'
import { createPgContactStore } from './contact-store.js'
import { createMailer } from './mail.js'
import { createPgReviewStore } from './reviews.js'
import { loadShopifyCredentialsFromEnv } from './analytics/shopify.js'
import { createMerchantSyncRunnerFromEnv } from './merchant/merchant-scheduler.js'
import { AUTO_SYNC_SOURCES, createAutoSync, defaultAutoSyncSources } from './dashboard/auto-sync.js'
import { reportsSheetMissingEnv } from './analytics/reports-sheet.js'

const config = loadConfig()
const { sendContactEmail } = createMailer(config)

if (config.resendApiKey) {
  console.log(`Contact email: Resend (from ${config.resendFromEmail})`)
} else if (config.smtpUser && config.smtpPass) {
  console.warn(
    'Contact email: SMTP — only works on Railway Pro+. Prefer RESEND_API_KEY on Hobby (free plan: 3k/mo).',
  )
} else {
  console.warn(
    'No email transport configured (set RESEND_API_KEY). Contact forms still save to Postgres when DATABASE_URL is set.',
  )
}

const pool = config.databaseUrl
  ? new pg.Pool({ connectionString: config.databaseUrl, max: 5 })
  : undefined

let contacts: ReturnType<typeof createPgContactStore> | undefined
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
  contacts = createPgContactStore(pool)
  await contacts.migrate()

  reviews = createPgReviewStore(pool)
  await reviews.migrate()
  const seeded = await reviews.seedCatalog()
  if (seeded > 0) {
    console.log(`Seeded ${seeded} product reviews into Postgres`)
  }

  if (config.dashboardEnabled) {
    analytics = createPgAnalyticsStore(pool)
    await setupDashboard(analytics, 'postgres')
  }
} else if (config.dashboardEnabled && config.analyticsSeedDemoOnBoot) {
  analytics = createMemoryAnalyticsStore()
  await setupDashboard(analytics, 'memory')
  console.warn('DATABASE_URL unset — dashboard running in-memory (data lost on restart)')
} else {
  console.warn('DATABASE_URL is not set; /reviews, contact persistence, and /dashboard will be unavailable')
}

const shopify = loadShopifyCredentialsFromEnv()
const merchant = createMerchantSyncRunnerFromEnv({ shopify, analytics })
const merchantRunner = merchant.runner
if (merchant.runner) {
  merchant.runner.start()
  console.log(`Merchant Center sync: on (account ${merchant.config.merchantId})`)
} else {
  console.log(`Merchant Center sync: off (${merchant.reason})`)
}

// Reports sheet: besides running after each dashboard sync, refresh every few hours on its own
// (sync the stale sources, then export) so the sheet is current even when nobody opens the dashboard.
const reportsMissing = reportsSheetMissingEnv()
const reportsMinutes = Number(process.env.REPORTS_SHEET_INTERVAL_MINUTES ?? '360')
if (analytics && !reportsMissing && Number.isFinite(reportsMinutes) && reportsMinutes > 0) {
  const store = analytics
  const autoSync = createAutoSync(store, defaultAutoSyncSources(), Date.now, 0)
  const refresh = async () => {
    for (const source of AUTO_SYNC_SOURCES) {
      try {
        await autoSync(source)
      } catch (error) {
        console.error(`Scheduled ${source} sync failed:`, error instanceof Error ? error.message : error)
      }
    }
  }
  const timer = setInterval(() => void refresh(), Math.max(30, reportsMinutes) * 60_000)
  timer.unref?.()
  console.log(`Reports sheet: on (every ${Math.max(30, reportsMinutes)} min and after dashboard syncs)`)
} else {
  console.log(`Reports sheet: off (${reportsMissing ? `missing ${reportsMissing}` : 'REPORTS_SHEET_INTERVAL_MINUTES=0'})`)
}

const app = createApp({
  config,
  sendContactEmail,
  contacts,
  reviews,
  analytics,
  shopifyWebhooks:
    merchantRunner && shopify
      ? { secret: shopify.clientSecret, onProductChange: (topic) => merchantRunner.trigger(topic) }
      : undefined,
})

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Sunday Rolls API listening on :${info.port}`)
  console.log(`CORS allowlist: ${config.corsOrigins.join(', ') || '(empty)'}`)
  if (analytics) console.log(`Dashboard: http://localhost:${info.port}/dashboard/`)
})
