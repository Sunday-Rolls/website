export type ContactFormPayload = {
  name: string
  email: string
  subject: string
  message: string
}

/** Production Railway API — used when the Vite env var is missing at build time. */
const DEFAULT_CONTACT_API_URL = 'https://contact-api-production-9af6.up.railway.app'

function contactApiBaseUrl(): string | null {
  const configured = import.meta.env.VITE_CONTACT_API_URL?.replace(/\/$/, '')
  if (configured) return configured
  if (import.meta.env.PROD) return DEFAULT_CONTACT_API_URL
  return null
}

export async function submitContactForm(
  payload: ContactFormPayload,
): Promise<void> {
  const baseUrl = contactApiBaseUrl()
  if (!baseUrl) {
    throw new Error('Contact form is not configured')
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const apiKey = import.meta.env.VITE_CONTACT_API_KEY
  if (apiKey) {
    headers['X-Contact-Key'] = apiKey
  }

  const response = await fetch(`${baseUrl}/contact`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })

  let data: { ok?: boolean; error?: string } | null = null
  try {
    data = (await response.json()) as { ok?: boolean; error?: string }
  } catch {
    data = null
  }

  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || 'Failed to send message')
  }
}
