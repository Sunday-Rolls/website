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
    // Preferred mail transport on Railway Hobby (SMTP ports are blocked).
    // Free Resend plan: 3,000 emails/month, 100/day — enough for contact form.
    resendApiKey: optional('RESEND_API_KEY'),
    resendFromEmail: optional(
      'RESEND_FROM_EMAIL',
      'Sunday Rolls Contact <onboarding@resend.dev>',
    ),
    // Legacy Gmail SMTP — only works on Railway Pro+ (not Hobby).
    smtpUser: optional('SMTP_USER'),
    smtpPass: optional('SMTP_PASS'),
    smtpHost: optional('SMTP_HOST', 'smtp.gmail.com'),
    smtpPort: Number(optional('SMTP_PORT', '465')) || 465,
    databaseUrl: optional('DATABASE_URL'),
    dashboardEnabled: optional('DASHBOARD_ENABLED', 'true') !== 'false',
    dashboardSecureCookies: optional('DASHBOARD_SECURE_COOKIES', 'false') === 'true',
    dashboardDemoPassword: optional('DASHBOARD_DEMO_PASSWORD'),
    dashboardBootstrapUsers: bootstrap,
    analyticsSeedDemoOnBoot: optional('ANALYTICS_SEED_DEMO_ON_BOOT', 'false') === 'true',
    websiteCutoverAt: optional('WEBSITE_CUTOVER_AT') || null,
    googleServiceAccountJson: optional('GOOGLE_SERVICE_ACCOUNT_JSON') || null,
    ga4PropertyResource: optional('GA4_PROPERTY_RESOURCE') || null,
    ga4SyncOnBoot: optional('GA4_SYNC_ON_BOOT', 'false') === 'true',
    ga4SyncDays: Math.max(1, Math.min(Number(optional('GA4_SYNC_DAYS', '90')) || 90, 365)),
    salesTrackerDriveFileId: optional('SALES_TRACKER_DRIVE_FILE_ID') || null,
    salesTrackerDriveFolderId: optional('SALES_TRACKER_DRIVE_FOLDER_ID') || null,
  }
}

export type Config = ReturnType<typeof loadConfig>
