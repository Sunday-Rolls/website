import { createHmac, timingSafeEqual } from 'node:crypto'

/** Webhook topics that can change what Merchant Center should show. Declared in shopify.app.toml. */
export const MERCHANT_WEBHOOK_TOPICS = new Set([
  'products/create',
  'products/update',
  'products/delete',
  'inventory_levels/update',
])

/** Shopify signs the raw body with the app's client secret (base64 HMAC-SHA256). */
export function verifyShopifyWebhook(rawBody: string, hmacHeader: string | undefined, secret: string): boolean {
  if (!hmacHeader || !secret) return false
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest()
  const given = Buffer.from(hmacHeader, 'base64')
  return given.length === expected.length && timingSafeEqual(given, expected)
}
