import { useEffect, useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { assetUrl } from '@/lib/asset-url'
import { useCart } from '@/lib/cart'
import { cn } from '@/lib/utils'
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
import { useMinimumDuration } from '@/lib/motion'
import { applyPageMeta } from '@/lib/page-meta'
import { sitePath } from '@/lib/site-path'
import { fetchProductByHandle, formatPrice, isShopifyConfigured, type ShopifyCart } from '@/lib/shopify'
import { PUTT_LOOP_MS, PuttAnimation } from '@/components/golf/PuttAnimation'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { PageHeader } from '@/components/ui/PageHeader'

type CartLine = ShopifyCart['lines'][number]

/** A line on its way out: the putt plays over its card, then the card folds away. */
interface LeavingLine {
  item: CartLine
  index: number
  collapsing: boolean
}

const COLLAPSE_MS = 320
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))
const msSince = (start: number) => Date.now() - start
const now = () => Date.now()

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
    pendingAdds,
    error,
    addItem,
    updateItemQuantity,
    removeItem,
  } = useCart()
  const [addingUpsell, setAddingUpsell] = useState(false)
  const [selectedTowelHandle, setSelectedTowelHandle] = useState<string | null>(null)
  const towelColorId = useId()

  const lines = cart?.lines ?? []

  // An add in progress holds a spot at the top of the list with a putt playing, for at
  // least one full putt; the new line stays hidden behind it until then.
  const holdingAdd = useMinimumDuration(pendingAdds > 0, PUTT_LOOP_MS)
  const [linesBeforeAdd, setLinesBeforeAdd] = useState<Set<string> | null>(() =>
    holdingAdd ? new Set(lines.map((line) => line.id)) : null,
  )
  const [wasHoldingAdd, setWasHoldingAdd] = useState(holdingAdd)
  if (holdingAdd !== wasHoldingAdd) {
    setWasHoldingAdd(holdingAdd)
    setLinesBeforeAdd(holdingAdd ? new Set(lines.map((line) => line.id)) : null)
  }

  const [leaving, setLeaving] = useState<Record<string, LeavingLine>>({})
  const shownLines: CartLine[] = linesBeforeAdd ? lines.filter((line) => linesBeforeAdd.has(line.id)) : [...lines]
  for (const gone of Object.values(leaving).sort((a, b) => a.index - b.index)) {
    if (!shownLines.some((line) => line.id === gone.item.id)) {
      shownLines.splice(Math.min(gone.index, shownLines.length), 0, gone.item)
    }
  }

  const isEmpty = !isLoading && lines.length === 0 && !holdingAdd && Object.keys(leaving).length === 0
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
  // The towel card folds away (and back) instead of popping, so it keeps the last towel it
  // showed to draw while it closes.
  const [shownTowel, setShownTowel] = useState(selectedTowel)
  if (selectedTowel && selectedTowel.handle !== shownTowel?.handle) setShownTowel(selectedTowel)
  const upsellOpen = Boolean(selectedTowel)
  const towel = selectedTowel ?? shownTowel
  const towelImage = towel?.images[0] ? assetUrl(towel.images[0]) : undefined
  const towelPrice = towel?.price
    ? formatPrice(towel.price, cart?.currencyCode ?? 'USD')
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
      <Container className="flex min-h-[70vh] flex-col items-center justify-center py-24 text-center md:py-32">
        <div className="flex w-full max-w-lg flex-col items-center gap-8 border border-sand bg-white px-8 py-12 sm:px-12 sm:py-16">
          <PageHeader
            className="items-center text-center [&_p]:mx-auto"
            title={content.emptyState.title}
            subtitle={content.emptyState.description}
          />
          <Button href={content.emptyState.cta.href}>
            {resolveLinkLabel(content.emptyState.cta)}
          </Button>
        </div>
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

  async function handleRemove(item: CartLine, index: number) {
    if (leaving[item.id]) return
    const drop = () =>
      setLeaving((prev) => {
        const next = { ...prev }
        delete next[item.id]
        return next
      })
    setLeaving((prev) => ({ ...prev, [item.id]: { item, index, collapsing: false } }))
    const started = now()
    try {
      await removeItem(item.id)
    } catch {
      // Cart provider surfaces the error banner; the line stays.
      drop()
      return
    }
    await wait(Math.max(0, PUTT_LOOP_MS - msSince(started)))
    setLeaving((prev) => (prev[item.id] ? { ...prev, [item.id]: { ...prev[item.id], collapsing: true } } : prev))
    await wait(COLLAPSE_MS)
    drop()
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

      {towel ? (
        <div
          className={cn(
            'grid transition-[grid-template-rows,opacity,margin] duration-[400ms] ease-out',
            upsellOpen ? 'grid-rows-[1fr] opacity-100' : '!mt-0 grid-rows-[0fr] opacity-0',
          )}
          aria-hidden={!upsellOpen}
          inert={!upsellOpen}
        >
          <div className="overflow-hidden">
            <aside className="grid gap-4 border border-sand bg-warm-sand/35 p-4 sm:grid-cols-[88px_1fr] sm:items-start lg:grid-cols-[88px_1fr_auto]">
              <Link
                to={sitePath(`/products/${towel.handle}`)}
                className="block overflow-hidden"
              >
                {towelImage ? (
                  <img
                    src={towelImage}
                    alt={towel.title}
                    className="aspect-square w-full object-cover"
                  />
                ) : (
                  <div className="aspect-square bg-warm-sand" />
                )}
              </Link>
              <div className="flex min-w-0 flex-col gap-3">
                <div className="space-y-1">
                  <p className="font-body text-label uppercase tracking-widest text-leather">
                    {upsell.eyebrow}
                  </p>
                  <h2 className="font-display text-xl text-heritage-green">{upsell.title}</h2>
                  <p className="max-w-xl font-body text-body-small text-matte-black/75">
                    {upsell.description}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <label className="inline-flex items-center gap-2" htmlFor={towelColorId}>
                    <span className="font-body text-label uppercase tracking-widest text-leather">
                      {upsell.colorLabel}
                    </span>
                    <span className="relative inline-flex">
                      <select
                        id={towelColorId}
                        value={towel.handle}
                        disabled={isUpdating || addingUpsell}
                        onChange={(event) => setSelectedTowelHandle(event.target.value)}
                        className="appearance-none border-0 border-b border-leather/40 bg-transparent py-1 pl-0 pr-6 font-body text-body-small text-heritage-green transition-colors hover:border-heritage-green focus:border-heritage-green focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {towelOptions.map((option) => (
                          <option key={option.handle} value={option.handle}>
                            {towelColorLabel(option.title)}
                          </option>
                        ))}
                      </select>
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-0 right-0 flex items-center text-leather"
                      >
                        <svg width="10" height="6" viewBox="0 0 12 8" fill="none">
                          <path
                            d="M1 1.5L6 6.5L11 1.5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="square"
                          />
                        </svg>
                      </span>
                    </span>
                  </label>
                  {towelPrice ? (
                    <p className="font-body text-body-small text-matte-black/70">{towelPrice}</p>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center lg:justify-end lg:self-center">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isUpdating || addingUpsell}
                  onClick={() => void handleAddTowelUpsell()}
                >
                  {addingUpsell ? upsell.addingLabel : upsell.ctaLabel}
                </Button>
              </div>
            </aside>
          </div>
        </div>
      ) : null}

      <div className="space-y-4">
        {/* Shopify puts a new line at the top of the cart, so its spot is held there. */}
        {holdingAdd ? (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center justify-center gap-4 border border-dashed border-sand bg-white px-4 py-6"
          >
            <div className="w-48 max-w-[50%]">
              <PuttAnimation />
            </div>
            <p className="font-body text-label uppercase tracking-widest text-heritage-green/70">
              {content.status.adding}
            </p>
          </div>
        ) : null}

        {shownLines.map((item, index) => {
          const gone = leaving[item.id]
          return (
            <div
              key={item.id}
              className={cn(
                'grid transition-[grid-template-rows,opacity,margin] ease-out',
                gone?.collapsing ? '!mt-0 grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100',
              )}
              style={{ transitionDuration: `${COLLAPSE_MS}ms` }}
            >
              <div className="overflow-hidden">
                <div className="relative grid gap-4 border border-sand bg-white p-4 sm:grid-cols-[80px_1fr_auto]">
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
                        disabled={isUpdating || Boolean(gone)}
                        onClick={() => void handleRemove(item, index)}
                      >
                        {content.lineActions.removeLabel}
                      </button>
                    </div>
                  </div>

                  <p className="font-body text-body text-matte-black">{item.lineTotal}</p>

                  {gone ? (
                    <div
                      role="status"
                      aria-live="polite"
                      className="absolute inset-0 flex items-center justify-center gap-4 bg-white/90 px-4"
                    >
                      <div className="w-40 max-w-[45%]">
                        <PuttAnimation />
                      </div>
                      <p className="font-body text-label uppercase tracking-widest text-heritage-green/70">
                        {content.status.removing}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )
        })}

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
    </Container>
  )
}
