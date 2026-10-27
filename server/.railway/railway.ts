import {
  defineRailway,
  github,
  postgres,
  preserve,
  project,
  service,
  volume,
} from 'railway/iac'

/**
 * Railway project config for sunday-rolls-contact.
 * Connecting contact-api to GitHub main (root: server/) enables autodeploy on push.
 */
export default defineRailway(() => {
  const Postgres = postgres('Postgres', { region: 'sfo' })
  Postgres.networking = { privateNetworkEndpoint: 'postgres' }

  const postgresVolume = volume('postgres-volume', {
    alerts: { usage: { '100': {}, '80': {}, '95': {} } },
    allowOnlineResize: true,
    region: 'sfo',
    sizeMB: 500,
  })

  const contactApi = service('contact-api', {
    source: github('Sunday-Rolls/website', {
      branch: 'main',
      rootDirectory: '/server',
    }),
    build: {
      builder: 'RAILPACK',
      buildCommand: 'npm install && npm run build',
      // Repo-root paths (not relative to rootDirectory) — `/**` was skipping all deploys
      watchPatterns: ['/server/**'],
    },
    start: 'npm start',
    healthcheck: '/health',
    replicas: { sfo: 1 },
    env: {
      ANALYTICS_ALLOW_DEMO_SEED: preserve(),
      ANALYTICS_SEED_DEMO_ON_BOOT: preserve(),
      CONTACT_TO_EMAIL: preserve(),
      CORS_ORIGINS: preserve(),
      DASHBOARD_BOOTSTRAP_USERS: preserve(),
      DASHBOARD_ENABLED: preserve(),
      DASHBOARD_SECURE_COOKIES: preserve(),
      DATABASE_URL: preserve(),
      GA4_PROPERTY_ID: preserve(),
      GA4_PROPERTY_RESOURCE: preserve(),
      GA4_SYNC_DAYS: preserve(),
      GA4_SYNC_ON_BOOT: preserve(),
      GOOGLE_ADS_CUSTOMER_ID: preserve(),
      GOOGLE_SERVICE_ACCOUNT_JSON: preserve(),
      META_AD_ACCOUNT_ID: preserve(),
      REQUIRE_BROWSER_ORIGIN: preserve(),
      RESEND_API_KEY: preserve(),
      RESEND_FROM_EMAIL: preserve(),
      SALES_TRACKER_DRIVE_FILE_ID: preserve(),
      SEARCH_CONSOLE_SITE_URL: preserve(),
      SHOPIFY_ADMIN_ACCESS_TOKEN: preserve(),
      SHOPIFY_API_VERSION: preserve(),
      SHOPIFY_CLIENT_ID: preserve(),
      SHOPIFY_CLIENT_SECRET: preserve(),
      SHOPIFY_SHOP: preserve(),
      SHOPIFY_STORE_DOMAIN: preserve(),
      SMTP_CONNECTION_TIMEOUT_MS: preserve(),
      SMTP_HOST: preserve(),
      SMTP_PASS: preserve(),
      SMTP_PORT: preserve(),
      SMTP_USER: preserve(),
    },
  })

  /** Storefront SPA — GitHub main autodeploy; Pages keeps PR previews. */
  const website = service('website', {
    source: github('Sunday-Rolls/website', {
      branch: 'main',
      rootDirectory: '/',
    }),
    build: {
      builder: 'RAILPACK',
      // Railpack already installs deps; `npm ci` here races a locked node_modules cache.
      buildCommand: 'npm run build:railway',
      watchPatterns: [
        '/src/**',
        '/public/**',
        '/index.html',
        '/package.json',
        '/package-lock.json',
        '/vite.config.ts',
        '/tsconfig.json',
        '/tsconfig.app.json',
        '/tsconfig.node.json',
        '/scripts/serve-spa.mjs',
        '/scripts/emit-spa-shells.mjs',
      ],
    },
    start: 'npm run start:spa',
    healthcheck: '/health',
    replicas: { sfo: 1 },
    env: {
      // Railpack: pin Node; disable Vite cache mounts (avoids EBUSY with npm)
      RAILPACK_NODE_VERSION: '22',
      RAILPACK_DISABLE_CACHES: '*',
      // Build-time Vite vars (set live values in Railway before cutover)
      VITE_BASE_PATH: '/',
      VITE_GTM_ID: preserve(),
      VITE_GA4_MEASUREMENT_ID: preserve(),
      VITE_GA4_SEND_DIRECT: preserve(),
      VITE_CONTACT_API_URL: preserve(),
      VITE_CONTACT_API_KEY: preserve(),
      VITE_SHOPIFY_STORE_DOMAIN: preserve(),
      VITE_SHOPIFY_STOREFRONT_TOKEN: preserve(),
      VITE_SHOPIFY_API_VERSION: preserve(),
    },
  })

  return project('sunday-rolls-contact', {
    resources: [Postgres, contactApi, website, postgresVolume],
  })
})
