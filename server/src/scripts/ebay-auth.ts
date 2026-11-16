/**
 * One-time eBay sign-in for the reports-sheet eBay sync (docs/EBAY_SYNC.md).
 *
 *   EBAY_CLIENT_ID=… EBAY_RUNAME=… npm run ebay:auth                 → prints the sign-in link
 *   EBAY_CLIENT_ID=… EBAY_CLIENT_SECRET=… EBAY_RUNAME=… npm run ebay:auth -- '<accept URL or code>'
 *                                                                     → prints the refresh token
 *
 * Paste the refresh token into Railway as EBAY_REFRESH_TOKEN. Nothing is saved to disk.
 */
import { EBAY_SCOPES } from '../analytics/ebay.js'

const clientId = process.env.EBAY_CLIENT_ID?.trim()
const clientSecret = process.env.EBAY_CLIENT_SECRET?.trim()
const ruName = process.env.EBAY_RUNAME?.trim()
const scopes = process.env.EBAY_SCOPES?.trim() || EBAY_SCOPES.join(' ')

if (!clientId || !ruName) {
  console.error('Set EBAY_CLIENT_ID and EBAY_RUNAME (the RuName from developer.ebay.com → User Tokens).')
  process.exit(1)
}

const input = process.argv[2]?.trim()
if (!input) {
  const url = new URL('https://auth.ebay.com/oauth2/authorize')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', ruName)
  url.searchParams.set('scope', scopes)
  console.log('1. Open this link, sign in as the Sunday Rolls eBay seller and agree:\n')
  console.log(url.toString())
  console.log("\n2. Copy the full address of the page eBay sends you to, then run:\n   npm run ebay:auth -- '<that address>'")
  process.exit(0)
}

if (!clientSecret) {
  console.error('Set EBAY_CLIENT_SECRET too, to exchange the code.')
  process.exit(1)
}

let code = input
try {
  code = new URL(input).searchParams.get('code') ?? input
} catch {
  // Not a URL: treat it as the code itself.
}

const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
  method: 'POST',
  headers: {
    Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: ruName }).toString(),
})
const data = (await res.json().catch(() => ({}))) as {
  refresh_token?: string
  refresh_token_expires_in?: number
  error?: string
  error_description?: string
}
if (!res.ok || !data.refresh_token) {
  console.error(`eBay said ${res.status}: ${data.error_description ?? data.error ?? 'no refresh token returned'}`)
  console.error('Codes expire after about 5 minutes and work once; start again from step 1 if needed.')
  process.exit(1)
}
const months = data.refresh_token_expires_in ? Math.round(data.refresh_token_expires_in / (30 * 86_400)) : null
console.log(`Refresh token${months ? ` (good for about ${months} months)` : ''}:\n\n${data.refresh_token}\n`)
console.log('Add it to Railway → contact-api → Variables as EBAY_REFRESH_TOKEN.')
