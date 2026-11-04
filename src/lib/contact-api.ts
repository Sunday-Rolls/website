import { contactApiBaseUrl } from '@/lib/api-base'
import { experimentString, visitorId } from '@/lib/experiments'

export type ContactFormPayload = {
  name: string
  email: string
  subject: string
  message: string
}

/** Adds the visitor id and exposure string (contract: optional, never put in the email). */
function withExperiments(payload: ContactFormPayload) {
  const vid = visitorId()
  const experiments = experimentString()
  return {
    ...payload,
    ...(vid ? { visitorId: vid } : {}),
    ...(experiments && experiments.length <= 500 ? { experiments } : {}),
  }
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
    body: JSON.stringify(withExperiments(payload)),
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
