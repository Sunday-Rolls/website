import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Container } from '@/components/ui/Container'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  clearPendingCheckout,
  readPendingCheckout,
  trackPurchase,
} from '@/lib/gtm'

/**
 * Optional return / validation landing for purchases.
 * Fires GA4 `purchase` once from either query params or the cart stashed at begin_checkout.
 *
 * Shopify hosted checkout usually stays on shopify.com — install the Customer Events
 * pixel in docs/SHOPIFY_WEB_PIXEL.md for production purchase tracking. This page is for
 * (a) manual validation and (b) a future checkout return URL.
 */
export function OrderThankYouPage() {
  const [params] = useSearchParams()
  const fired = useRef(false)
  const [status, setStatus] = useState<'pending' | 'tracked' | 'missing'>('pending')

  useEffect(() => {
    if (fired.current) return
    fired.current = true

    const transactionId =
      params.get('transaction_id') ||
      params.get('order_id') ||
      params.get('order') ||
      ''
    const valueParam = params.get('value')
    const pending = readPendingCheckout()

    const value = valueParam
      ? Number(valueParam)
      : pending?.value ?? 0
    const items = pending?.items ?? []

    if (!transactionId || !(value > 0 || items.length > 0)) {
      setStatus('missing')
      return
    }

    trackPurchase({
      transactionId,
      value: value > 0 ? value : items.reduce((s, i) => s + (i.price ?? 0) * (i.quantity ?? 1), 0),
      currency: pending?.currency ?? 'USD',
      items,
    })
    clearPendingCheckout()
    setStatus('tracked')
  }, [params])

  return (
    <Container className="space-y-6 py-section-y text-center">
      <PageHeader
        title="Thanks for your order"
        subtitle={
          status === 'tracked'
            ? 'Purchase recorded for analytics.'
            : status === 'missing'
              ? 'Order received. Open this page with ?transaction_id=…&value=… to validate purchase tracking, or rely on the Shopify web pixel.'
              : 'Confirming your order…'
        }
      />
      <Link
        to="/shop/"
        className="inline-block font-body text-body text-heritage-green hover:text-forest-green"
      >
        Continue shopping
      </Link>
    </Container>
  )
}
