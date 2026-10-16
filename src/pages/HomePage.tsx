import { useEffect, useMemo, useState } from 'react'
import { usePageContent } from '@/lib/content'
import { applyPageMeta } from '@/lib/page-meta'
import {
  filterProductsByCategory,
  placeholderProducts,
} from '@/lib/product-catalog'
import { scheduleAfterLoad } from '@/lib/schedule'
import type { ShopifyProduct } from '@/lib/shopify'
import { HeroSection } from '@/components/home/HeroSection'
import { MediaBreak } from '@/components/home/MediaBreak'
import { NewsletterSection } from '@/components/home/NewsletterSection'
import { ProductCarouselBlock } from '@/components/home/ProductCarouselBlock'
import { ReviewsMarquee } from '@/components/home/ReviewsMarquee'
import { SocialsBanner } from '@/components/home/SocialsBanner'
import { StoryBanner } from '@/components/home/StoryBanner'
import { ValueStrip } from '@/components/ui/ValueStrip'

export function HomePage() {
  const content = usePageContent('home')
  const [products, setProducts] = useState<ShopifyProduct[]>(placeholderProducts)

  useEffect(() => {
    applyPageMeta({
      title: content.meta.title,
      description: content.meta.description,
      path: '/',
      image: '/assets/home/videos/hero-poster.jpg',
    })

    return scheduleAfterLoad(() => {
      void import('@/lib/shopify').then(({ fetchProducts }) =>
        fetchProducts(50).then((items) => {
          if (items.length > 0) setProducts(items)
        }),
      )
    }, 8000)
  }, [content.meta.title, content.meta.description])

  const blocks = useMemo(
    () =>
      content.productBlocks.map((block, index) => ({
        block,
        products: filterProductsByCategory(products, block.filter),
        tone: index % 2 === 0 ? ('cream' as const) : ('sand' as const),
      })),
    [content.productBlocks, products],
  )

  return (
    <>
      <HeroSection />
      <ValueStrip items={content.values.items} />
      {blocks.map(({ block, products: blockProducts, tone }, index) => (
        <ProductCarouselBlock
          key={block.id}
          block={block}
          products={blockProducts}
          tone={tone}
          className={index > 0 ? 'cv-auto' : undefined}
        />
      ))}
      <div className="cv-auto">
        <MediaBreak />
      </div>
      <div className="cv-auto">
        <ReviewsMarquee />
      </div>
      <div className="cv-auto">
        <StoryBanner />
      </div>
      <div className="cv-auto">
        <SocialsBanner />
      </div>
      <div className="cv-auto">
        <NewsletterSection />
      </div>
    </>
  )
}
