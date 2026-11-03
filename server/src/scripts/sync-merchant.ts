/**
 * Sync active Shopify products into Google Merchant Center.
 *
 *   npm run merchant:sync -- --dry-run          # print what would be sent, no Google calls
 *   npm run merchant:sync                       # push products, remove ones gone from Shopify
 *   npm run merchant:sync -- --register you@x   # one-time: link the GCP project to Merchant Center
 *   npm run merchant:sync -- --create-data-source  # one-time: create the API data source
 *
 * See docs/GOOGLE_MERCHANT_SYNC.md.
 */
import { loadShopifyCredentialsFromEnv } from '../analytics/shopify.js'
import {
  createApiDataSource,
  createMerchantAccessToken,
  loadMerchantConfigFromEnv,
  registerGcp,
  syncMerchant,
} from '../merchant/merchant-sync.js'

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(name)
const argValue = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

const config = loadMerchantConfigFromEnv()
const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() || ''
const dryRun = flag('--dry-run')

function fail(msg: string): never {
  console.error(msg)
  process.exit(1)
}

if (!config.merchantId) fail('Set MERCHANT_CENTER_ID (e.g. 5685591896)')
if (!dryRun && !serviceAccountJson) fail('Set GOOGLE_SERVICE_ACCOUNT_JSON')

if (flag('--register')) {
  const email = argValue('--register')
  if (!email || email.startsWith('--')) fail('Usage: --register developer@email.com')
  const token = await createMerchantAccessToken(serviceAccountJson)
  console.log(JSON.stringify(await registerGcp(token, config.merchantId, email), null, 2))
  process.exit(0)
}

if (flag('--create-data-source')) {
  const token = await createMerchantAccessToken(serviceAccountJson)
  const ds = await createApiDataSource(token, config)
  console.log(JSON.stringify(ds, null, 2))
  console.log(`\nSet MERCHANT_DATA_SOURCE_ID=${ds.dataSourceId} and run the sync.`)
  process.exit(0)
}

if (!config.dataSourceId && !dryRun) fail('Set MERCHANT_DATA_SOURCE_ID (run with --create-data-source first)')
const shopify = loadShopifyCredentialsFromEnv()
if (!shopify) fail('Set SHOPIFY_SHOP + SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET')

const result = await syncMerchant({
  shopify,
  serviceAccountJson,
  config,
  dryRun,
  prune: !flag('--no-prune'),
})
console.log(JSON.stringify({ ...result, failed: result.failed.length }, null, 2))
if (result.failed.length) process.exit(1)
