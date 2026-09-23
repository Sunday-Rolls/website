/**
 * Infer a Shopify product handle from an Etsy listing title.
 * Keep in sync with src/lib/reviews.ts `inferProductHandleFromListing`.
 */
export function inferProductHandleFromListing(listing) {
  if (!listing) return undefined

  const text = String(listing).toLowerCase()

  if (text.includes('birdie machine')) return 'the-birdie-machine'
  if (text.includes('sunday strip')) return 'sunday-stripes'
  if (text.includes('corduroy')) {
    return text.includes('heel') || text.includes('mallet putter')
      ? 'mallet-the-corduroy'
      : 'the-corduroy'
  }
  if (text.includes('breakfast')) return 'the-breakfast-roller'
  if (text.includes('sunny side') || text.includes('sunny-side')) return 'sunny-side-up'
  if (text.includes('coin collector')) return 'coin-collector'
  if (text.includes('doodle')) return 'the-doodle'
  if (text.includes('flagstick')) return 'flagstick-fuel'

  const isMallet =
    text.includes('heel shaft') ||
    (text.includes('mallet') && !text.includes('center'))

  if (
    text.includes('yellow') &&
    !text.includes('purple') &&
    !text.includes('grey') &&
    !text.includes('gray')
  ) {
    return isMallet ? 'mallet-retro-roller-white' : 'retro-roller-yellow'
  }

  if (
    text.includes('purple') &&
    !text.includes('yellow') &&
    !text.includes('grey') &&
    !text.includes('gray')
  ) {
    return 'retro-roller-purple'
  }

  if (
    (text.includes('grey') || text.includes('gray')) &&
    !text.includes('purple') &&
    !text.includes('yellow')
  ) {
    return isMallet ? 'mallet-retro-roller-grey' : 'retro-roller-grey'
  }

  if (text.includes('white') && isMallet) return 'mallet-retro-roller-white'

  if (text.includes('purple') || text.includes('yellow')) return undefined

  if (isMallet) return 'mallet-retro-roller-grey'

  if (
    text.includes('center') ||
    text.includes('retro gaming') ||
    text.includes('gameboy') ||
    text.includes('game boy')
  ) {
    return 'retro-roller-grey'
  }

  return undefined
}

export function withInferredProductHandle(review) {
  if (review.productHandle) return review
  const productHandle = inferProductHandleFromListing(review.listing)
  if (!productHandle) return review
  return { ...review, productHandle, source: review.source ?? 'etsy' }
}
