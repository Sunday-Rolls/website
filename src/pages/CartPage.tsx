import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '@/lib/cart'
import {
  getButtonLabel,
  resolveLinkLabel,
  usePageContent,
} from '@/lib/content'
import { trackBeginCheckout, trackViewCart } from '@/lib/gtm'
import { isShopifyConfigured } from '@/lib/shopify'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { PageHeader } from '@/components/ui/PageHeader'

export function CartPage() {
  const content = usePageContent('cart')
  const {
    cart,
    isLoading,
    isUpdating,
    error,
    updateItemQuantity,
    removeItem,
  } = useCart()

  const lines = cart?.lines ?? []
  const isEmpty = !isLoading && lines.length === 0
  const cartSignature = cart
    ? `${cart.id}:${cart.totalQuantity}:${cart.total}:${lines.map((l) => `${l.id}:${l.quantity}`).join(',')}`
    : ''

  useEffect(() => {
    if (isLoading || isEmpty || !cart || lines.length === 0) return
    trackViewCart(
      lines.map((item) => ({
        id: item.variantId || item.id,
        title: item.title,
        price: item.price,
        quantity: item.quantity,
      })),
      cart.total,
    )
  }, [cart, cartSignature, isEmpty, isLoading, lines])

  if (!isShopifyConfigured) {
    return (
      <Container className="space-y-6 py-section-y text-center">
        <PageHeader
          title={content.emptyState.title}
          subtitle={content.status.unavailable}
        />
        <Button href={content.emptyState.cta.href}>
          {resolveLinkLabel(content.emptyState.cta)}
        </Button>
      </Container>
    )
  }

  if (isLoading) {
    return (
      <Container className="py-section-y">
        <p className="font-body text-body text-matte-black/70">{content.status.loading}</p>
      </Container>
    )
  }

  if (isEmpty) {
    return (
      <Container className="space-y-6 py-section-y text-center">
        <PageHeader
          title={content.emptyState.title}
          subtitle={content.emptyState.description}
        />
        <Button href={content.emptyState.cta.href}>
          {resolveLinkLabel(content.emptyState.cta)}
        </Button>
      </Container>
    )
  }

  function handleCheckoutClick() {
    trackBeginCheckout(
      lines.map((item) => ({
        id: item.variantId || item.id,
        title: item.title,
        price: item.price,
        quantity: item.quantity,
      })),
      cart?.total,
    )
  }

  return (
    <Container className="space-y-8 py-section-y">
      <div className="space-y-3">
        <PageHeader title={content.header.title} />
        <Link
          to={content.header.continueShoppingHref}
          className="inline-block font-body text-body-small text-heritage-green hover:text-forest-green"
        >
          ← {getButtonLabel(content.header.continueShoppingKey)}
        </Link>
      </div>

      {error ? (
        <p className="font-body text-body-small text-leather" role="alert">
          {error}
        </p>
      ) : null}

      {isUpdating ? (
        <p className="font-body text-body-small text-matte-black/60">{content.status.updating}</p>
      ) : null}

      <div className="space-y-4">
        {lines.map((item) => (
          <div
            key={item.id}
            className="grid gap-4 border border-sand bg-white p-4 sm:grid-cols-[80px_1fr_auto]"
          >
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt={item.imageAlt ?? item.title}
                className="aspect-square w-full object-cover"
              />
            ) : (
              <div className="aspect-square bg-warm-sand" />
            )}

            <div className="space-y-3">
              <div>
                <Link
                  to={`/products/${item.handle}`}
                  className="font-display text-xl text-heritage-green hover:text-forest-green"
                >
                  {item.title}
                </Link>
                <p className="font-body text-body-small text-matte-black/70">{item.price}</p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <span className="font-body text-label uppercase tracking-widest text-leather">
                  {content.lineActions.quantityLabel}
                </span>
                <div className="flex items-center border border-sand">
                  <button
                    type="button"
                    className="px-3 py-1 font-body text-body text-heritage-green hover:bg-sand/40 disabled:opacity-50"
                    aria-label={content.lineActions.decreaseLabel}
                    disabled={isUpdating}
                    onClick={() => void updateItemQuantity(item.id, item.quantity - 1)}
                  >
                    −
                  </button>
                  <span className="min-w-8 px-2 text-center font-body text-body">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    className="px-3 py-1 font-body text-body text-heritage-green hover:bg-sand/40 disabled:opacity-50"
                    aria-label={content.lineActions.increaseLabel}
                    disabled={isUpdating}
                    onClick={() => void updateItemQuantity(item.id, item.quantity + 1)}
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  className="font-body text-body-small text-leather underline-offset-2 hover:underline disabled:opacity-50"
                  disabled={isUpdating}
                  onClick={() => void removeItem(item.id)}
                >
                  {content.lineActions.removeLabel}
                </button>
              </div>
            </div>

            <p className="font-body text-body text-matte-black">{item.price}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col items-end gap-4 border-t border-sand pt-6">
        <p className="font-display text-2xl text-heritage-green">
          {content.summary.totalLabel}: {cart?.total}
        </p>
        {cart?.checkoutUrl ? (
          <Button href={cart.checkoutUrl} onClick={handleCheckoutClick}>
            {getButtonLabel(content.summary.checkoutLabelKey)}
          </Button>
        ) : (
          <Button disabled>{getButtonLabel(content.summary.checkoutLabelKey)}</Button>
        )}
      </div>
    </Container>
  )
}
