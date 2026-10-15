import { usePageContent } from '@/lib/content'
import { Container } from '@/components/ui/Container'
import { PageHeader } from '@/components/ui/PageHeader'
import { shopAssets } from '@/assets'

export function ShopHeader() {
  const content = usePageContent('shop')

  return (
    <section className="relative overflow-hidden border-b border-sand bg-sand/40">
      <picture>
        <source srcSet={shopAssets.headerBannerWebp} type="image/webp" />
        <img
          src={shopAssets.headerBanner}
          alt=""
          aria-hidden="true"
          width={1200}
          height={800}
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover opacity-60"
        />
      </picture>
      <div className="absolute inset-0 bg-gradient-to-r from-cream via-cream/90 to-cream/70" />

      <Container className="relative py-12 md:py-16">
        <PageHeader title={content.header.title} subtitle={content.header.subtitle} />
      </Container>
    </section>
  )
}
