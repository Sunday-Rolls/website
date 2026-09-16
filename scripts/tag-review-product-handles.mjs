/**
 * Tag reviews.json items with productHandle inferred from Etsy listing titles.
 *
 * Usage:
 *   node scripts/tag-review-product-handles.mjs
 *   DRY_RUN=1 node scripts/tag-review-product-handles.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withInferredProductHandle } from './lib/infer-product-handle.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const reviewsPath = join(root, 'src/data/reviews.json')
const DRY_RUN = process.env.DRY_RUN === '1'

const data = JSON.parse(readFileSync(reviewsPath, 'utf8'))
const items = (data.items ?? []).map((item) => {
  const next = withInferredProductHandle(item)
  if (!next.source) next.source = 'etsy'
  return next
})

const tagged = items.filter((item) => item.productHandle).length
const payload = {
  ...data,
  taggedAt: new Date().toISOString(),
  taggedCount: tagged,
  count: items.length,
  items,
}

if (DRY_RUN) {
  console.log(`Would tag ${tagged}/${items.length} reviews`)
  for (const item of items) {
    if (!item.productHandle) continue
    console.log(`- ${item.author}: ${item.productHandle}`)
  }
  process.exit(0)
}

writeFileSync(reviewsPath, `${JSON.stringify(payload, null, 2)}\n`)
console.log(`Tagged ${tagged}/${items.length} reviews → ${reviewsPath}`)
