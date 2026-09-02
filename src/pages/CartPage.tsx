import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  getButtonLabel,
  resolveLinkLabel,
  usePageContent,
} from '@/lib/content'
import { placeholderProducts } from '@/lib/shopify'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { PageHeader } from '@/components/ui/PageHeader'

export function CartPage() {
  const content = usePageContent('cart')
  const cartItems = placeholderProducts.slice(0, 2)
  const total = '$350.00'
  const isEmpty = false

  useEffect(() => {
    document.title = content.meta.title
  }, [content.meta.title])

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

      <div className="space-y-4">
        {cartItems.map((item) => (
          <div
            key={item.id}
            className="grid gap-4 border border-sand bg-white p-4 sm:grid-cols-[80px_1fr_auto]"
          >
            <div className="aspect-square bg-warm-sand" />
            <div>
              <p className="font-display text-xl text-heritage-green">{item.title}</p>
              <p className="font-body text-body-small text-matte-black/70">{item.material}</p>
            </div>
            <p className="font-body text-body text-matte-black">{item.price}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col items-end gap-4 border-t border-sand pt-6">
        <p className="font-display text-2xl text-heritage-green">
          {content.summary.totalLabel}: {total}
        </p>
        <Button href="/checkout">
          {getButtonLabel(content.summary.checkoutLabelKey)}
        </Button>
      </div>
    </Container>
  )
}
