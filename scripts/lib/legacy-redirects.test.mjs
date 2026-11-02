import assert from 'node:assert/strict'
import { test } from 'node:test'
import { legacyRedirect } from './legacy-redirects.mjs'

const handles = new Set([
  'sunday-stripes',
  'the-birdie-machine',
  'the-breakfast-roller',
  'mallet-retro-roller-grey',
  'morning-dew',
])

test('maps Squarespace product URLs to the new product pages', () => {
  assert.equal(legacyRedirect('/shop/p/sunday-stripes', handles), '/products/sunday-stripes/')
  assert.equal(legacyRedirect('/shop/p/birdie-machine', handles), '/products/the-birdie-machine/')
  assert.equal(legacyRedirect('/shop/p/breakfast-roller/', handles), '/products/the-breakfast-roller/')
  assert.equal(legacyRedirect('/shop/p/retro-roller-mallet-grey', handles), '/products/mallet-retro-roller-grey/')
})

test('keeps the query string for ad and Shopping attribution', () => {
  assert.equal(
    legacyRedirect('/shop/p/morning-dew?gclid=abc&srsltid=xyz', handles),
    '/products/morning-dew/?gclid=abc&srsltid=xyz',
  )
})

test('sends unknown products and category pages to the shop', () => {
  assert.equal(legacyRedirect('/shop/p/oz-and-mezz-putter-cover', handles), '/shop/')
  assert.equal(legacyRedirect('/shop/headcovers', handles), '/shop/')
  assert.equal(legacyRedirect('/contact-us', handles), '/contact/')
})

test('leaves current pages alone', () => {
  for (const url of ['/', '/shop', '/shop/', '/about/', '/contact?x=1', '/products/sunday-stripes/', '/cart']) {
    assert.equal(legacyRedirect(url, handles), null, url)
  }
})
