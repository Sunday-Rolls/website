import { useEffect, useMemo, useState } from 'react'
import { usePageContent } from '@/lib/content'
import { applyPageMeta } from '@/lib/page-meta'
import {
  fetchProducts,
  filterProductsByCategory,
  placeholderProducts,
  type ShopifyProduct,
} from '@/lib/shopify'
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
      image: '/assets/home/hero.jpg',
    })

    fetchProducts(50).then((items) => {
      if (items.length > 0) setProducts(items)
    })
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
      {blocks.map(({ block, products: blockProducts, tone }) => (
        <ProductCarouselBlock
          key={block.id}
          block={block}
          products={blockProducts}
          tone={tone}
        />
      ))}
      <MediaBreak />
      <ReviewsMarquee />
      <StoryBanner />
      <SocialsBanner />
      <NewsletterSection />
    </>
  )
}
