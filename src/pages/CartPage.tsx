import { useEffect, useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { assetUrl } from '@/lib/asset-url'
import { useCart } from '@/lib/cart'
import { freeShippingProgress } from '@/lib/cart-free-shipping'
import {
  listTowelUpsellOptions,
  shouldShowTowelUpsell,
  towelColorLabel,
} from '@/lib/cart-towel-upsell'
import {
  getButtonLabel,
  resolveLinkLabel,
  usePageContent,
} from '@/lib/content'
import { trackBeginCheckout, trackViewCart } from '@/lib/gtm'
import { applyPageMeta } from '@/lib/page-meta'
import { sitePath } from '@/lib/site-path'
import { fetchProductByHandle, formatPrice, isShopifyConfigured } from '@/lib/shopify'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { PageHeader } from '@/components/ui/PageHeader'

function fillTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, value),
    template,
  )
}

export function CartPage() {
  const content = usePageContent('cart')
  const {
    cart,
    isLoading,
    isUpdating,
    error,
    addItem,
    updateItemQuantity,
    removeItem,
  } = useCart()
  const [addingUpsell, setAddingUpsell] = useState(false)
  const [selectedTowelHandle, setSelectedTowelHandle] = useState<string | null>(null)
  const towelColorId = useId()

  const lines = cart?.lines ?? []
  const isEmpty = !isLoading && lines.length === 0
  const cartSignature = cart
    ? `${cart.id}:${cart.totalQuantity}:${cart.total}:${lines.map((l) => `${l.id}:${l.quantity}`).join(',')}`
    : ''

  const shipping = freeShippingProgress(
    cart?.subtotalAmount ?? 0,
    content.freeShipping.threshold,
  )
  const upsell = content.towelUpsell
  const showTowelUpsell = shouldShowTowelUpsell(
    cart?.totalAmount ?? 0,
    upsell.minTotal,
    upsell.maxTotal,
  )
  const cartHandles = useMemo(() => lines.map((line) => line.handle), [lines])
  const towelOptions = useMemo(
    () =>
      showTowelUpsell ? listTowelUpsellOptions(cartHandles, upsell.preferredHandle) : [],
    [cartHandles, showTowelUpsell, upsell.preferredHandle],
  )
  const selectedTowel =
    towelOptions.find((option) => option.handle === selectedTowelHandle) ?? towelOptions[0] ?? null
  const towelImage = selectedTowel?.images[0] ? assetUrl(selectedTowel.images[0]) : undefined
  const towelPrice = selectedTowel?.price
    ? formatPrice(selectedTowel.price, cart?.currencyCode ?? 'USD')
    : null
  const thresholdLabel = formatPrice(
    String(content.freeShipping.threshold),
    cart?.currencyCode ?? 'USD',
  )
  const remainingLabel = formatPrice(
    String(shipping.remaining),
    cart?.currencyCode ?? 'USD',
  )

  useEffect(() => {
    if (towelOptions.length === 0) {
      setSelectedTowelHandle(null)
      return
    }
    setSelectedTowelHandle((current) =>
      current && towelOptions.some((option) => option.handle === current)
        ? current
        : towelOptions[0]!.handle,
    )
  }, [towelOptions])

  useEffect(() => {
    applyPageMeta({
      title: content.meta.title,
      description: content.meta.description,
      path: '/cart',
    })
  }, [content.meta.title, content.meta.description])

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

  async function handleAddTowelUpsell() {
    if (!selectedTowel || addingUpsell) return
    setAddingUpsell(true)
    try {
      const product = await fetchProductByHandle(selectedTowel.handle)
      if (!product?.variantId) {
        throw new Error('Towel is unavailable')
      }
      await addItem(product.variantId, 1)
    } catch {
      // Cart provider surfaces the error banner.
    } finally {
      setAddingUpsell(false)
    }
  }

  return (
    <Container className="space-y-8 py-section-y">
      <div className="space-y-3">
        <PageHeader title={content.header.title} />
        <Link
          to={sitePath(content.header.continueShoppingHref)}
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

      <div
        className="space-y-3 border border-sand bg-cream/50 px-4 py-4"
        aria-label={content.freeShipping.barLabel}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-body text-body-small font-semibold text-heritage-green">
            {fillTemplate(content.freeShipping.progressLabel, { threshold: thresholdLabel })}
          </p>
          <p className="font-body text-body-small text-leather">
            {shipping.unlocked
              ? content.freeShipping.unlockedLabel
              : fillTemplate(content.freeShipping.remainingLabel, { remaining: remainingLabel })}
          </p>
        </div>
        <div
          className="h-2 overflow-hidden bg-sand"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={shipping.percent}
          aria-label={content.freeShipping.barLabel}
        >
          <div
            className="h-full bg-heritage-green transition-[width] duration-500"
            style={{ width: `${shipping.percent}%` }}
          />
        </div>
      </div>

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
                  to={sitePath(`/products/${item.handle}`)}
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

            <p className="font-body text-body text-matte-black">{item.lineTotal}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col items-end gap-4 border-t border-sand pt-6">
        <dl className="w-full max-w-sm space-y-2">
          <div className="flex items-baseline justify-between gap-6">
            <dt className="font-body text-body text-leather">{content.summary.subtotalLabel}</dt>
            <dd className="font-body text-body text-matte-black">{cart?.subtotal}</dd>
          </div>
          {(cart?.discounts ?? []).map((discount) => (
            <div key={`${discount.title}-${discount.amount}`} className="flex items-baseline justify-between gap-6">
              <dt className="font-body text-body text-leather">
                {discount.title || content.summary.discountLabel}
              </dt>
              <dd className="font-body text-body text-heritage-green">−{discount.amount}</dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-6 border-t border-sand pt-3">
            <dt className="font-display text-2xl text-heritage-green">{content.summary.totalLabel}</dt>
            <dd className="font-display text-2xl text-heritage-green">{cart?.total}</dd>
          </div>
        </dl>
        {cart?.checkoutUrl ? (
          <Button href={cart.checkoutUrl} onClick={handleCheckoutClick}>
            {getButtonLabel(content.summary.checkoutLabelKey)}
          </Button>
        ) : (
          <Button disabled>{getButtonLabel(content.summary.checkoutLabelKey)}</Button>
        )}
      </div>

      {selectedTowel ? (
        <aside className="grid gap-4 border border-heritage-green/25 bg-warm-sand/40 p-4 sm:grid-cols-[96px_1fr_auto] sm:items-center">
          {towelImage ? (
            <img
              src={towelImage}
              alt={selectedTowel.title}
              className="aspect-square w-full object-cover"
            />
          ) : (
            <div className="aspect-square bg-warm-sand" />
          )}
          <div className="space-y-3">
            <p className="font-body text-label uppercase tracking-widest text-leather">
              {upsell.eyebrow}
            </p>
            <div className="space-y-1">
              <h2 className="font-display text-xl text-heritage-green">{upsell.title}</h2>
              <p className="font-body text-body-small text-matte-black/80">{upsell.description}</p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="block space-y-1" htmlFor={towelColorId}>
                <span className="font-body text-body-small text-leather">{upsell.colorLabel}</span>
                <select
                  id={towelColorId}
                  value={selectedTowel.handle}
                  disabled={isUpdating || addingUpsell}
                  onChange={(event) => setSelectedTowelHandle(event.target.value)}
                  className="block min-w-[12rem] border border-leather/35 bg-white px-3 py-2 font-body text-body text-matte-black focus:border-heritage-green focus:outline-none focus:ring-1 focus:ring-heritage-green/30 disabled:opacity-60"
                >
                  {towelOptions.map((option) => (
                    <option key={option.handle} value={option.handle}>
                      {towelColorLabel(option.title)}
                    </option>
                  ))}
                </select>
              </label>
              <p className="pb-2 font-body text-body-small text-leather">
                <Link
                  to={sitePath(`/products/${selectedTowel.handle}`)}
                  className="text-heritage-green hover:text-forest-green"
                >
                  {selectedTowel.title}
                </Link>
                {towelPrice ? ` · ${towelPrice}` : null}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={isUpdating || addingUpsell}
            onClick={() => void handleAddTowelUpsell()}
          >
            {addingUpsell ? upsell.addingLabel : upsell.ctaLabel}
          </Button>
        </aside>
      ) : null}
    </Container>
  )
}
