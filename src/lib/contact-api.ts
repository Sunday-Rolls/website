export type ContactFormPayload = {
  name: string
  email: string
  subject: string
  message: string
}

export async function submitContactForm(
  payload: ContactFormPayload,
): Promise<void> {
  const baseUrl = import.meta.env.VITE_CONTACT_API_URL?.replace(/\/$/, '')
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
