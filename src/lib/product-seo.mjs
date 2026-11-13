/**
 * Search-friendly product page titles, shared by the React product page and
 * scripts/emit-spa-shells.mjs so the raw HTML and the rendered page agree.
 *
 * Plain product names ("Coin Collector") don't say what the item is or what it
 * fits, so the title adds the fit people search for ("L.A.B. Oz & Mezz Putter Cover").
 */

const FIT_LABELS = {
  'center-shafted': 'L.A.B. DF3 Putter Cover',
  mallet: 'Spider Mallet Putter Cover',
  'oz-mezz': 'L.A.B. Oz & Mezz Putter Cover',
}

/** "Mallet - Retro Roller Grey" → "Retro Roller Grey"; "Retro Roller - Grey" → "Retro Roller Grey". */
export function productDisplayName(title) {
  return String(title ?? '')
    .replace(/^mallet\s*-\s*/i, '')
    .replace(/\s+-\s+/g, ' ')
    .trim()
}

/** The kind of product and its fit, e.g. "L.A.B. DF3 Putter Cover" or "Waffle Golf Towel". */
export function productFitLabel(product) {
  if (product?.category === 'towels') return 'Waffle Golf Towel'
  return FIT_LABELS[product?.subcategory] ?? 'Putter Cover'
}

/** "Coin Collector — L.A.B. Oz & Mezz Putter Cover | Sunday Rolls Golf" */
export function productSeoTitle(product) {
  const fit = productFitLabel(product)
  let name = productDisplayName(product?.title)
  if (product?.category === 'towels') {
    // "Golf Towel - Green Stripe" → "Green Stripe Waffle Golf Towel"
    name = name.replace(/^golf towel\s*/i, '')
    return `${name} ${fit} | Sunday Rolls Golf`.trim()
  }
  return `${name} — ${fit} | Sunday Rolls Golf`
}
