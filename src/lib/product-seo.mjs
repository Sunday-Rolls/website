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

const META_DESCRIPTION_MAX = 158

/**
 * A meta description that is different for every product, even color versions that
 * share copy: "Retro Roller Grey L.A.B. DF3 putter cover by Sunday Rolls Golf. <first sentence>"
 */
export function productMetaDescription(product) {
  const name = productDisplayName(product?.title)
  const fit = productFitLabel(product)
  const lead =
    product?.category === 'towels'
      ? `${name.replace(/^golf towel\s*/i, '')} waffle golf towel by Sunday Rolls Golf.`
      : `${name} ${fit} by Sunday Rolls Golf.`
  const text = String(product?.description ?? '').replace(/\s+/g, ' ').trim()
  const sentence = text.match(/^.*?[.!?](\s|$)/)?.[0]?.trim() ?? text
  const full = sentence ? `${lead} ${sentence}` : lead
  if (full.length <= META_DESCRIPTION_MAX) return full
  const cut = full.slice(0, META_DESCRIPTION_MAX - 1)
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`
}
