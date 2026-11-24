import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { usePageContent } from '@/lib/content'
import { applyPageMeta } from '@/lib/page-meta'
import {
  filterProductsByCategory,
  placeholderProducts,
} from '@/lib/product-catalog'
import { scheduleAfterLoad } from '@/lib/schedule'
import type { ShopifyProduct } from '@/lib/shopify'
import { FeaturedProductBanner } from '@/components/home/FeaturedProductBanner'
import { HeroSection } from '@/components/home/HeroSection'
import { MediaBreak } from '@/components/home/MediaBreak'
import { NewsletterSection } from '@/components/home/NewsletterSection'
import { ProductCarouselBlock } from '@/components/home/ProductCarouselBlock'
import { ReviewsMarquee } from '@/components/home/ReviewsMarquee'
import { SocialsBanner } from '@/components/home/SocialsBanner'
import { StoryBanner } from '@/components/home/StoryBanner'
import { ValueStrip } from '@/components/ui/ValueStrip'
import { Variant, useVariant } from '@/components/experiments'

// Arm b of home-doodle-banner only: control visitors never download this banner or its image.
const DoodleBanner = lazy(() =>
  import('@/components/home/DoodleBanner').then((module) => ({ default: module.DoodleBanner })),
)

export function HomePage() {
  const content = usePageContent('home')
  // A/A check: both arms render the same page. Logs the home-page exposure that proves the pipeline.
  useVariant('aa-check')
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
      {/*
        A/B test home-doodle-banner (src/experiments/home-doodle-banner.json): arm b sees the
        Doodle sketchbook banner in this slot. Until that test is started from the dashboard every
        visitor is in control, which renders exactly what was here before: the home-banner test
        (src/experiments/home-banner.json), whose arm b sees the Retro Roller banner.
      */}
      <Variant
        experiment="home-doodle-banner"
        is="b"
        fallback={
          <Variant experiment="home-banner" is="b">
            <FeaturedProductBanner />
          </Variant>
        }
      >
        <Suspense fallback={null}>
          <DoodleBanner />
        </Suspense>
      </Variant>
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
