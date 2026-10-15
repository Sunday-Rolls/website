import { GoogleAuth } from 'google-auth-library'

const SHEETS_MIME = 'application/vnd.google-apps.spreadsheet'
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const XLSX_EXPORT = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export type DriveFileInfo = {
  id: string
  name: string
  mimeType: string
  modifiedTime: string | null
  webViewLink: string | null
}

function parseServiceAccount(json: string | Record<string, unknown>): Record<string, unknown> {
  if (typeof json === 'string') return JSON.parse(json) as Record<string, unknown>
  return json
}

async function getAccessToken(serviceAccountJson: string | Record<string, unknown>): Promise<string> {
  const auth = new GoogleAuth({
    credentials: parseServiceAccount(serviceAccountJson),
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/spreadsheets.readonly',
    ],
  })
  const client = await auth.getClient()
  const token = await client.getAccessToken()
  if (!token.token) throw new Error('Failed to obtain Google Drive access token')
  return token.token
}

async function driveFetch(accessToken: string, url: string): Promise<Response> {
  return fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

/** List spreadsheets / Excel workbooks the service account can see (optionally in a folder). */
export async function listDriveWorkbooks(
  serviceAccountJson: string | Record<string, unknown>,
  options?: { folderId?: string | null; pageSize?: number },
): Promise<DriveFileInfo[]> {
  const token = await getAccessToken(serviceAccountJson)
  const pageSize = Math.max(1, Math.min(options?.pageSize ?? 40, 100))
  const clauses = [
    'trashed = false',
    `(mimeType = '${SHEETS_MIME}' or mimeType = '${XLSX_MIME}' or mimeType = 'application/vnd.ms-excel')`,
  ]
  if (options?.folderId) {
    clauses.push(`'${options.folderId.replace(/'/g, "\\'")}' in parents`)
  }
  const params = new URLSearchParams({
    q: clauses.join(' and '),
    pageSize: String(pageSize),
    fields: 'files(id,name,mimeType,modifiedTime,webViewLink)',
    orderBy: 'modifiedTime desc',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  })
  const res = await driveFetch(token, `https://www.googleapis.com/drive/v3/files?${params}`)
  const data = (await res.json()) as { error?: { message?: string }; files?: DriveFileInfo[] }
  if (!res.ok) throw new Error(data.error?.message || `Drive list failed (${res.status})`)
  return data.files ?? []
}

/** Download a Google Sheet or .xlsx as an Excel buffer. */
export async function downloadDriveWorkbook(
  serviceAccountJson: string | Record<string, unknown>,
  fileId: string,
): Promise<{ buffer: Buffer; name: string; mimeType: string }> {
  const token = await getAccessToken(serviceAccountJson)
  const metaRes = await driveFetch(
    token,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType&supportsAllDrives=true`,
  )
  const meta = (await metaRes.json()) as {
    error?: { message?: string }
    name?: string
    mimeType?: string
  }
  if (!metaRes.ok) throw new Error(meta.error?.message || `Drive meta failed (${metaRes.status})`)

  const name = meta.name || fileId
  const mimeType = meta.mimeType || ''
  let downloadUrl: string
  if (mimeType === SHEETS_MIME) {
    downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(XLSX_EXPORT)}`
  } else {
    downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`
  }

  const fileRes = await driveFetch(token, downloadUrl)
  if (!fileRes.ok) {
    const err = (await fileRes.json().catch(() => ({}))) as { error?: { message?: string } }
    throw new Error(err.error?.message || `Drive download failed (${fileRes.status})`)
  }
  const ab = await fileRes.arrayBuffer()
  return { buffer: Buffer.from(ab), name, mimeType }
}

export function extractDriveFileId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed) && !trimmed.includes('/')) return trimmed
  const fromPath = /\/(?:file|spreadsheets)\/d\/([a-zA-Z0-9_-]+)/.exec(trimmed)
  if (fromPath) return fromPath[1]
  const fromOpen = /[?&]id=([a-zA-Z0-9_-]+)/.exec(trimmed)
  if (fromOpen) return fromOpen[1]
  return null
}
