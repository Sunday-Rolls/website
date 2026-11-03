import { describe, expect, it } from 'vitest'
import catalog from '@/data/product-catalog.json'
import tsv from '../../docs/data/merchant-center-link-overrides.tsv?raw'

/**
 * docs/data/merchant-center-link-overrides.tsv mirrors the Google Sheet that
 * overrides Merchant Center product links (docs/ADS_AND_SEO_CONFIG.md). A
 * renamed or removed product would leave a Shopping ad pointing at a 404.
 */
const rows = tsv
  .trim()
  .split('\n')
  .slice(1)
  .map((line) => line.split('\t') as [id: string, link: string])

describe('Merchant Center link overrides', () => {
  const handles = new Set((catalog as Array<{ handle: string }>).map((product) => product.handle))

  it.each(rows)('%s links to a current product page', (_id, link) => {
    const handle = /^https:\/\/www\.sundayrollsgolf\.com\/products\/([^/]+)\/$/.exec(link)?.[1]
    expect(handle, link).toBeDefined()
    expect(handles.has(handle!), `${handle} is not in product-catalog.json`).toBe(true)
  })

  it('lists each Merchant Center product once', () => {
    const ids = rows.map(([id]) => id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
