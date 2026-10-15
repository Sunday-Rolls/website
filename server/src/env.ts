function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}

function optional(name: string, fallback = ''): string {
  return process.env[name]?.trim() ?? fallback
}

export function loadConfig() {
  const corsOrigins = optional('CORS_ORIGINS', 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  const bootstrap = optional('DASHBOARD_BOOTSTRAP_USERS')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [email, name] = part.split(':')
      return { email: email?.trim() ?? '', name: (name ?? email ?? '').trim() }
    })
    .filter((u) => u.email)

  return {
    port: Number(optional('PORT', '3001')) || 3001,
    corsOrigins,
    requireBrowserOrigin: optional('REQUIRE_BROWSER_ORIGIN', 'true') !== 'false',
    contactApiKey: optional('CONTACT_API_KEY'),
    contactToEmail: optional('CONTACT_TO_EMAIL', 'sundayrollsdevops@gmail.com'),
    smtpUser: required('SMTP_USER'),
    smtpPass: required('SMTP_PASS'),
    smtpHost: optional('SMTP_HOST', 'smtp.gmail.com'),
    smtpPort: Number(optional('SMTP_PORT', '465')) || 465,
    databaseUrl: optional('DATABASE_URL'),
    dashboardEnabled: optional('DASHBOARD_ENABLED', 'true') !== 'false',
    dashboardSecureCookies: optional('DASHBOARD_SECURE_COOKIES', 'false') === 'true',
    dashboardDemoPassword: optional('DASHBOARD_DEMO_PASSWORD'),
    dashboardBootstrapUsers: bootstrap,
    analyticsSeedDemoOnBoot: optional('ANALYTICS_SEED_DEMO_ON_BOOT', 'false') === 'true',
    websiteCutoverAt: optional('WEBSITE_CUTOVER_AT') || null,
  }
}

export type Config = ReturnType<typeof loadConfig>
