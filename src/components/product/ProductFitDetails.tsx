import { Link } from 'react-router-dom'
import { collectionPath, getCollectionForSection } from '@/lib/collections'
import type { ShopifyProduct } from '@/lib/shopify'
import { Container } from '@/components/ui/Container'

/**
 * Fit questions for the product's putter type, shared with its landing page
 * (content/pages/collections.json). scripts/emit-spa-shells.mjs writes the same
 * text into the product page's HTML.
 */
export function ProductFitDetails({ product }: { product: ShopifyProduct }) {
  const collection = product.subcategory ? getCollectionForSection(product.subcategory) : undefined
  if (!collection) return null

  return (
    <section aria-labelledby="product-fit-heading" className="py-10 md:py-14">
      <Container className="max-w-3xl space-y-6">
        <h2 id="product-fit-heading" className="font-display text-section-title text-heritage-green">
          Fit &amp; details
        </h2>
        <dl className="divide-y divide-sand border-y border-sand">
          {collection.faq.map((item) => (
            <div key={item.question} className="space-y-1 py-4">
              <dt className="font-body text-lg font-semibold text-matte-black">{item.question}</dt>
              <dd className="font-body text-matte-black/80">{item.answer}</dd>
            </div>
          ))}
        </dl>
        <p className="font-body">
          <Link
            to={collectionPath(collection.slug)}
            className="text-heritage-green underline underline-offset-4"
          >
            {`See all ${collection.header.title}`}
          </Link>
        </p>
      </Container>
    </section>
  )
}
