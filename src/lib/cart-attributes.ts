/**
 * Everything the cart carries to Shopify as hidden attributes: the ad-source touch
 * (`_sr_source` …, attribution.ts) plus the experiment keys `_sr_vid` / `_sr_exp`.
 *
 * `cartAttributesUpdate` replaces the whole set, so the two groups are always sent together.
 */
import { cartAttributes, cartNeedsAttributes, markCartAttributed } from '@/lib/attribution'
import { experimentString, visitorId } from '@/lib/experiments'

type Attribute = { key: string; value: string }

const EXP_STAMPED_KEY = 'sr_exp_cart'

export function experimentCartAttributes(
  vid: string | null = visitorId(),
  exp: string = experimentString(),
): Attribute[] {
  return [
    { key: '_sr_vid', value: vid ?? '' },
    { key: '_sr_exp', value: exp },
  ].filter((a) => a.value)
}

/** Attribution keys and experiment keys, for `createCart` / `updateCartAttributes`. */
export function allCartAttributes(
  storage: Storage = window.localStorage,
  now = Date.now(),
): Attribute[] {
  return [...cartAttributes(storage, now), ...experimentCartAttributes()]
}

function experimentStamp(cartId: string): string {
  return `${cartId}|${visitorId() ?? ''}|${experimentString()}`
}

/** True when the touch or the exposure set has changed since this cart was last stamped. */
export function cartNeedsStamp(
  cartId: string,
  storage: Storage = window.localStorage,
  now = Date.now(),
): boolean {
  if (cartNeedsAttributes(cartId, storage, now)) return true
  if (experimentCartAttributes().length === 0) return false
  try {
    return storage.getItem(EXP_STAMPED_KEY) !== experimentStamp(cartId)
  } catch {
    return false
  }
}

export function markCartStamped(
  cartId: string,
  storage: Storage = window.localStorage,
  now = Date.now(),
): void {
  markCartAttributed(cartId, storage, now)
  try {
    storage.setItem(EXP_STAMPED_KEY, experimentStamp(cartId))
  } catch {
    // ignore
  }
}
