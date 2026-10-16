import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePageContent } from '@/lib/content'
import { trackViewItemList } from '@/lib/gtm'
import { applyPageMeta } from '@/lib/page-meta'
import { filterProductsByCategory, placeholderProducts } from '@/lib/product-catalog'
import { scheduleAfterLoad } from '@/lib/schedule'
import type { ShopifyProduct } from '@/lib/shopify'
import { ProductGrid } from '@/components/shop/ProductGrid'
import { ShopHeader } from '@/components/shop/ShopHeader'
import { Container } from '@/components/ui/Container'
import { cn } from '@/lib/utils'

export function ShopPage() {
  const content = usePageContent('shop')
  const [searchParams] = useSearchParams()
  const targetSection = searchParams.get('category')
  const [products, setProducts] = useState<ShopifyProduct[]>(placeholderProducts)

  useEffect(() => {
    applyPageMeta({
      title: content.meta.title,
      description: content.meta.description,
      path: '/shop',
      image: '/assets/shop/banner.jpg',
    })

    return scheduleAfterLoad(() => {
      void import('@/lib/shopify').then(({ fetchProducts }) =>
        fetchProducts(50).then((items) => {
          if (items.length > 0) setProducts(items)
        }),
      )
    }, 8000)
  }, [content.meta.title, content.meta.description])

  const sections = useMemo(
    () =>
      content.sections
        .map((section) => ({
          section,
          products: filterProductsByCategory(products, section.id),
        }))
        .filter(({ products: sectionProducts }) => sectionProducts.length > 0),
    [content.sections, products],
  )

  useEffect(() => {
    for (const { section, products: sectionProducts } of sections) {
      trackViewItemList(`shop_${section.id}`, `Shop — ${section.title}`, sectionProducts)
    }
  }, [sections])

  useEffect(() => {
    if (!targetSection) return
    document.getElementById(targetSection)?.scrollIntoView()
  }, [targetSection, products])

  return (
    <>
      <ShopHeader />

      {sections.length === 0 ? (
        <Container className="py-section-y">
          <ProductGrid products={[]} />
        </Container>
      ) : null}

      {sections.map(({ section, products: sectionProducts }, index) => (
        <section
          key={section.id}
          id={section.id}
          aria-labelledby={`shop-${section.id}-heading`}
          className={cn(
            'scroll-mt-16 py-10 md:py-14',
            index % 2 === 0 ? 'bg-cream' : 'bg-warm-sand/45',
          )}
        >
          <Container className="space-y-6">
            <div className="max-w-2xl space-y-2">
              {section.badge ? (
                <p>
                  <span className="inline-flex items-center rounded-full bg-heritage-green px-2.5 py-0.5 font-body text-sm font-semibold tracking-wide text-cream">
                    {section.badge}
                  </span>
                </p>
              ) : null}
              <h2
                id={`shop-${section.id}-heading`}
                className="font-display text-page-title text-heritage-green"
              >
                {section.title}
              </h2>
              {section.subtitle ? (
                <p className="font-body text-lg text-matte-black/75">{section.subtitle}</p>
              ) : null}
            </div>

            <ProductGrid
              products={sectionProducts}
              listId={`shop_${section.id}`}
              listName={`Shop — ${section.title}`}
              priorityCount={index === 0 ? 1 : 0}
            />
          </Container>
        </section>
      ))}
    </>
  )
}
