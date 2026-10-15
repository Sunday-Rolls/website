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

  return project('sunday-rolls-contact', {
    resources: [Postgres, contactApi, postgresVolume],
  })
})
