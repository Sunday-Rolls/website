import { GoogleAuth } from 'google-auth-library'
import type { SearchKeyword } from './types.js'

export type GscCredentials = {
  serviceAccountJson: string | Record<string, unknown>
  /** e.g. https://www.sundayrollsgolf.com/ */
  siteUrl: string
}

function parseServiceAccount(json: string | Record<string, unknown>): Record<string, unknown> {
  if (typeof json === 'string') return JSON.parse(json) as Record<string, unknown>
  return json
}

async function getAccessToken(serviceAccountJson: string | Record<string, unknown>): Promise<string> {
  const auth = new GoogleAuth({
    credentials: parseServiceAccount(serviceAccountJson),
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
  })
  const client = await auth.getClient()
  const token = await client.getAccessToken()
  if (!token.token) throw new Error('Failed to obtain Search Console access token')
  return token.token
}

export function loadGscCredentialsFromEnv(env: NodeJS.ProcessEnv = process.env): GscCredentials | null {
  const serviceAccountJson = env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()
  const siteUrl = (
    env.SEARCH_CONSOLE_SITE_URL ||
    env.GSC_SITE_URL ||
    'https://www.sundayrollsgolf.com/'
  ).trim()
  if (!serviceAccountJson || !siteUrl) return null
  return { serviceAccountJson, siteUrl: siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/` }
}

/** Top search queries by clicks for a date range. */
export async function fetchSearchConsoleKeywords(
  creds: GscCredentials,
  startDate: string,
  endDate: string,
  rowLimit = 50,
): Promise<SearchKeyword[]> {
  const token = await getAccessToken(creds.serviceAccountJson)
  const res = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(creds.siteUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ['query'],
        rowLimit: Math.max(1, Math.min(rowLimit, 25000)),
      }),
    },
  )
  const data = (await res.json()) as {
    error?: { message?: string }
    rows?: Array<{ keys?: string[]; clicks?: number; impressions?: number }>
  }
  if (!res.ok) {
    throw new Error(data.error?.message || `Search Console query failed (${res.status})`)
  }
  return (data.rows ?? [])
    .map((row) => ({
      query: (row.keys?.[0] || '').trim(),
      visits: Math.round(Number(row.clicks ?? 0)),
      periodStart: startDate,
      periodEnd: endDate,
    }))
    .filter((k) => k.query && k.visits > 0)
}
