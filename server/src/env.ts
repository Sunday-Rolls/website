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
  }
}

export type Config = ReturnType<typeof loadConfig>
