/**
 * Scrape shop reviews from Etsy into src/data/reviews.json.
 *
 * Etsy sits behind DataDome, so this opens a real headed Chrome window by
 * default. If a challenge appears, complete it in the browser — the script
 * waits until review cards show up, then saves.
 *
 * Usage:
 *   npm run reviews:scrape
 *   npm run reviews:scrape -- --max 50
 *   npm run reviews:scrape -- --headless   # usually blocked by Etsy
 *   npm run reviews:scrape -- --url https://www.etsy.com/shop/SundayRolls#reviews
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { withInferredProductHandle } from './lib/infer-product-handle.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const outPath = join(root, 'src/data/reviews.json')
const profileDir = join(root, '.etsy-browser-profile')

const DEFAULT_URL = 'https://www.etsy.com/shop/SundayRolls/reviews'
const WAIT_MS = 180_000

function parseArgs(argv) {
  const args = {
    url: DEFAULT_URL,
    max: 100,
    headless: false,
    timeoutMs: WAIT_MS,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--url') args.url = argv[++i] ?? args.url
    else if (arg === '--max') args.max = Number(argv[++i] ?? args.max)
    else if (arg === '--timeout') args.timeoutMs = Number(argv[++i] ?? args.timeoutMs) * 1000
    else if (arg === '--headless') args.headless = true
    else if (arg === '--headed') args.headless = false
  }

  if (!Number.isFinite(args.max) || args.max < 1) args.max = 100
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs < 5_000) args.timeoutMs = WAIT_MS
  return args
}

async function dismissBanners(page) {
  const selectors = [
    'button:has-text("Accept")',
    'button:has-text("Accept all")',
    'button:has-text("Got it")',
    'button:has-text("Continue")',
    '[data-gdpr-consent-accept]',
  ]
  for (const sel of selectors) {
    const btn = page.locator(sel).first()
    if ((await btn.count()) === 0) continue
    try {
      await btn.click({ timeout: 1500 })
    } catch {
      // ignore
    }
  }
}

async function scrollTowardReviews(page) {
  for (let i = 0; i < 12; i += 1) {
    try {
      const found = await page.evaluate(() => {
        const el =
          document.querySelector('#reviews') ||
          document.querySelector('[data-reviews-section]') ||
          document.querySelector('[data-review-region]') ||
          document.querySelector('div[class*="reviews"]')
        if (el) {
          el.scrollIntoView({ block: 'center' })
          return true
        }
        return false
      })
      if (found) break
    } catch {
      // ignore navigation during scroll
    }
    await page.mouse.wheel(0, 900)
    await page.waitForTimeout(400)
  }
}

function reviewsPageUrl(baseUrl, pageNum) {
  const url = new URL(baseUrl.split('#')[0])
  url.searchParams.set('ref', 'pagination')
  url.searchParams.set('page', String(pageNum))
  return url.toString()
}

async function extractReviews(page) {
  return page.evaluate(() => {
    const cards = [
      ...document.querySelectorAll('li[data-region="review"], [data-review-region]'),
    ]

    const items = []
    const seen = new Set()

    for (const card of cards) {
      const reviewId =
        card.getAttribute('data-review-region') ||
        card.closest('[data-review-region]')?.getAttribute('data-review-region') ||
        ''

      const textEl = card.querySelector('p.prose.wt-break-word, .wt-sem-text-secondary p.prose')
      const text = (textEl?.textContent || '').replace(/\s+/g, ' ').trim()

      const listingLink = card.querySelector('[data-region="listing"] a[href*="/listing/"]')
      const listing =
        (
          listingLink?.getAttribute('aria-label') ||
          listingLink?.getAttribute('title') ||
          listingLink?.textContent ||
          ''
        )
          .replace(/\s+/g, ' ')
          .trim() || undefined

      const authorEl = card.querySelector(
        'p.shop2-review-attribution a, a[href*="/people/"][href*="shop_review"]',
      )
      const author = (authorEl?.textContent || 'Etsy buyer').replace(/\s+/g, ' ').trim()

      const ratingInput = card.querySelector('input[name="rating"]')
      let rating = Number(ratingInput?.getAttribute('value') || ratingInput?.value || 5)
      if (!Number.isFinite(rating)) {
        const label = card.querySelector('.screen-reader-only')?.textContent || ''
        const m = label.match(/(\d+(?:\.\d+)?)\s+out of/i)
        rating = m ? Number(m[1]) : 5
      }

      const key = reviewId || `${author}::${rating}::${text || listing || ''}`
      if (seen.has(key)) continue
      seen.add(key)

      /** @type {{ author: string, rating: number, text: string, listing?: string }} */
      const item = {
        author,
        rating: Math.max(1, Math.min(5, Math.round(rating))),
        text,
      }
      if (listing) item.listing = listing
      items.push(item)
    }

    return items
  })
}

async function waitForReviewsOrChallenge(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    let state
    try {
      state = await page.evaluate(() => {
        const blocked = /Access is temporarily restricted|unusual activity|DataDome|captcha/i.test(
          document.body?.innerText || '',
        )
        const count = document.querySelectorAll(
          'li[data-region="review"], [data-review-region], .review-item',
        ).length
        return {
          blocked,
          count,
          title: document.title,
        }
      })
    } catch {
      // Navigation mid-evaluate (DataDome / hash redirect) — keep waiting
      await page.waitForTimeout(1500)
      continue
    }

    if (state.count > 0) return state
    if (state.blocked) {
      process.stdout.write(
        '\rEtsy challenge detected — complete it in the browser window…          ',
      )
    } else {
      process.stdout.write(
        `\rWaiting for reviews (${state.title || 'loading'}). ${Math.max(0, Math.ceil((deadline - Date.now()) / 1000))}s left…   `,
      )
    }
    await page.waitForTimeout(1500)
  }
  process.stdout.write('\n')
  throw new Error(
    `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for Etsy reviews. Re-run headed and pass any challenge, or increase --timeout.`,
  )
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  console.log(`Scraping ${args.url}`)
  console.log(`Mode: ${args.headless ? 'headless' : 'headed'} (Etsy usually requires headed)`)

  mkdirSync(profileDir, { recursive: true })

  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: args.headless,
    viewport: { width: 1400, height: 900 },
    locale: 'en-US',
    args: ['--disable-blink-features=AutomationControlled'],
  })

  const page = context.pages()[0] || (await context.newPage())
  page.setDefaultTimeout(60_000)

  try {
    await page.goto(reviewsPageUrl(args.url, 1), {
      waitUntil: 'domcontentloaded',
      timeout: 90_000,
    })
    await dismissBanners(page)
    await scrollTowardReviews(page)
    await waitForReviewsOrChallenge(page, args.timeoutMs)
    await dismissBanners(page)

    const byKey = new Map()
    let emptyPages = 0

    for (let pageNum = 1; pageNum <= 40 && byKey.size < args.max; pageNum += 1) {
      if (pageNum > 1) {
        await page.goto(reviewsPageUrl(args.url, pageNum), {
          waitUntil: 'domcontentloaded',
          timeout: 60_000,
        })
        await page.waitForTimeout(1200)
        // Etsy redirects past-the-end pages; stop when URL no longer matches.
        if (!page.url().includes(`page=${pageNum}`)) break
      }

      const batch = await extractReviews(page)
      if (batch.length === 0) {
        emptyPages += 1
        if (emptyPages >= 2) break
        continue
      }
      emptyPages = 0

      let added = 0
      for (const item of batch) {
        const key = `${item.author}::${item.rating}::${item.text || ''}::${item.listing || ''}`
        if (!byKey.has(key)) {
          byKey.set(key, item)
          added += 1
        }
        if (byKey.size >= args.max) break
      }
      console.log(`  page ${pageNum}: +${added} (total ${byKey.size})`)
      if (added === 0) break
    }

    const items = [...byKey.values()].map((item) =>
      withInferredProductHandle({ ...item, source: 'etsy' }),
    )
    if (items.length === 0) {
      throw new Error('Page loaded but no review cards were found. Etsy may have changed markup.')
    }

    const written = items.filter((r) => r.text).length
    const starOnly = items.length - written
    const tagged = items.filter((r) => r.productHandle).length

    const payload = {
      source: args.url.split('#')[0],
      scrapedAt: new Date().toISOString(),
      count: items.length,
      taggedCount: tagged,
      items,
    }

    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`)
    console.log(
      `\nWrote ${items.length} reviews (${written} with text, ${starOnly} star-only, ${tagged} product-tagged) → ${outPath}`,
    )
  } finally {
    await context.close()
  }
}

main().catch((err) => {
  console.error(`\n${err.message || err}`)
  process.exit(1)
})
