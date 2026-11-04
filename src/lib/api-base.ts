/** Production Railway API — used when the Vite env var is missing at build time. */
const DEFAULT_CONTACT_API_URL = 'https://contact-api-production-9af6.up.railway.app'

export function contactApiBaseUrl(): string | null {
  const configured = import.meta.env.VITE_CONTACT_API_URL?.replace(/\/$/, '')
  if (configured) return configured
  if (import.meta.env.PROD) return DEFAULT_CONTACT_API_URL
  return null
}

