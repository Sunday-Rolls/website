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
      REQUIRE_BROWSER_ORIGIN: preserve(),
      SMTP_CONNECTION_TIMEOUT_MS: preserve(),
      SMTP_HOST: preserve(),
      SMTP_PASS: preserve(),
      SMTP_PORT: preserve(),
      SMTP_USER: preserve(),
    },
  })

  /** Storefront SPA — custom domain / DNS cutover target (apex + www). */
  const website = service('website', {
    source: github('Sunday-Rolls/website', {
      branch: 'main',
      rootDirectory: '/',
    }),
    build: {
      builder: 'RAILPACK',
      buildCommand: 'npm ci && npm run build:railway',
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
      ],
    },
    start: 'npm run start:spa',
    healthcheck: '/health',
    replicas: { sfo: 1 },
    env: {
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
