import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { collectionPath, collections, getCollection } from '@/lib/collections'
import { trackViewItemList } from '@/lib/gtm'
import { applyPageMeta } from '@/lib/page-meta'
import { filterProductsByCategory, placeholderProducts } from '@/lib/product-catalog'
import { scheduleAfterLoad } from '@/lib/schedule'
import type { ShopifyProduct } from '@/lib/shopify'
import { ProductGrid } from '@/components/shop/ProductGrid'
import { Container } from '@/components/ui/Container'
import { PageHeader } from '@/components/ui/PageHeader'
import { NotFoundPage } from '@/pages/NotFoundPage'

/** Landing page for one putter fit, e.g. /putter-covers/lab-df3. Copy lives in content/pages/collections.json. */
export function CollectionPage() {
  const { slug } = useParams()
  const collection = getCollection(slug)
  const [products, setProducts] = useState<ShopifyProduct[]>(placeholderProducts)

  useEffect(() => {
    if (!collection) return
    applyPageMeta({
      title: collection.meta.title,
      description: collection.meta.description,
      path: collectionPath(collection.slug),
      image: '/assets/shop/banner.jpg',
    })
    return scheduleAfterLoad(() => {
      void import('@/lib/shopify').then(({ fetchProducts }) =>
        fetchProducts(50).then((items) => {
          if (items.length > 0) setProducts(items)
        }),
      )
    }, 0)
  }, [collection])

  const sectionProducts = useMemo(
    () => (collection ? filterProductsByCategory(products, collection.sectionId) : []),
    [collection, products],
  )

  useEffect(() => {
    if (!collection || sectionProducts.length === 0) return
    trackViewItemList(`collection_${collection.slug}`, collection.header.title, sectionProducts)
  }, [collection, sectionProducts])

  if (!collection) return <NotFoundPage />

  const others = collections.filter((item) => item.slug !== collection.slug)

  return (
    <>
      <section className="border-b border-sand bg-sand/40">
        <Container className="space-y-4 py-12 md:py-16">
          <nav aria-label="Breadcrumb" className="font-body text-sm text-matte-black/70">
            <Link to="/shop" className="underline-offset-4 hover:underline">
              Shop
            </Link>
            <span aria-hidden="true"> / </span>
            <span>{collection.navLabel}</span>
          </nav>
          <PageHeader title={collection.header.title} subtitle={collection.header.subtitle} />
        </Container>
      </section>

      <section className="bg-cream py-10 md:py-14">
        <Container className="space-y-8">
          <div className="max-w-2xl space-y-3 font-body text-lg text-matte-black/80">
            {collection.intro.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <ProductGrid
            products={sectionProducts}
            listId={`collection_${collection.slug}`}
            listName={collection.header.title}
            priorityCount={1}
          />
        </Container>
      </section>

      <section aria-labelledby="collection-faq-heading" className="bg-warm-sand/45 py-10 md:py-14">
        <Container className="max-w-3xl space-y-6">
          <h2 id="collection-faq-heading" className="font-display text-page-title text-heritage-green">
            Questions about fit
          </h2>
          <div className="divide-y divide-sand border-y border-sand">
            {collection.faq.map((item) => (
              <details key={item.question} className="group py-4">
                <summary className="cursor-pointer list-none font-body text-lg font-semibold text-matte-black">
                  {item.question}
                </summary>
                <p className="mt-2 font-body text-matte-black/80">{item.answer}</p>
              </details>
            ))}
          </div>
          <p className="font-body text-matte-black/80">
            Other fits:{' '}
            {others.map((item, index) => (
              <span key={item.slug}>
                {index > 0 ? ' · ' : null}
                <Link to={collectionPath(item.slug)} className="underline underline-offset-4">
                  {item.header.title}
                </Link>
              </span>
            ))}
            {' · '}
            <Link to="/shop" className="underline underline-offset-4">
              Shop everything
            </Link>
          </p>
        </Container>
      </section>
    </>
  )
}
