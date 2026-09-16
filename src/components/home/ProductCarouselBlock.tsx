import { useEffect, useRef, useState } from 'react'
import { resolveLinkLabel } from '@/lib/content'
import type { HomeProductBlock } from '@/types/content'
import type { ShopifyProduct } from '@/lib/shopify'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { ProductCard } from '@/components/ui/ProductCard'
import { cn } from '@/lib/utils'

interface ProductCarouselBlockProps {
  block: HomeProductBlock
  products: ShopifyProduct[]
  tone?: 'cream' | 'sand'
}

const MOBILE_BREAKPOINT = 560

function visibleCountForWidth(width: number) {
  if (width >= 1100) return 4
  if (width >= 860) return 3
  if (width >= MOBILE_BREAKPOINT) return 2
  return 1
}

export function ProductCarouselBlock({
  block,
  products,
  tone = 'cream',
}: ProductCarouselBlockProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const mobileScrollerRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState(1)
  const [page, setPage] = useState(0)
  const [activeIndex, setActiveIndex] = useState(0)
  const isMobile = visibleCount === 1
  const maxPage = Math.max(0, Math.ceil(products.length / visibleCount) - 1)

  useEffect(() => {
    const node = trackRef.current
    if (!node) return

    const update = () => {
      setVisibleCount(visibleCountForWidth(node.clientWidth))
    }

    update()

    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setPage((current) => Math.min(current, maxPage))
  }, [maxPage])

  useEffect(() => {
    if (!isMobile) return

    const scroller = mobileScrollerRef.current
    if (!scroller) return

    const syncActiveIndex = () => {
      const items = Array.from(scroller.querySelectorAll<HTMLElement>('[data-carousel-item]'))
      if (items.length === 0) return

      const scrollerCenter = scroller.scrollLeft + scroller.clientWidth / 2
      let closestIndex = 0
      let closestDistance = Number.POSITIVE_INFINITY

      items.forEach((item, index) => {
        const itemCenter = item.offsetLeft + item.offsetWidth / 2
        const distance = Math.abs(itemCenter - scrollerCenter)
        if (distance < closestDistance) {
          closestDistance = distance
          closestIndex = index
        }
      })

      setActiveIndex(closestIndex)
    }

    syncActiveIndex()
    scroller.addEventListener('scroll', syncActiveIndex, { passive: true })
    return () => scroller.removeEventListener('scroll', syncActiveIndex)
  }, [isMobile, products.length])

  function scrollMobileToIndex(index: number) {
    const scroller = mobileScrollerRef.current
    const item = scroller?.querySelectorAll<HTMLElement>('[data-carousel-item]')[index]
    if (!scroller || !item) return

    const left = item.offsetLeft - (scroller.clientWidth - item.offsetWidth) / 2
    scroller.scrollTo({ left, behavior: 'smooth' })
  }

  function goPrevious() {
    if (isMobile) {
      scrollMobileToIndex(Math.max(0, activeIndex - 1))
      return
    }
    setPage((current) => Math.max(0, current - 1))
  }

  function goNext() {
    if (isMobile) {
      scrollMobileToIndex(Math.min(products.length - 1, activeIndex + 1))
      return
    }
    setPage((current) => Math.min(maxPage, current + 1))
  }

  const canGoPrevious = isMobile ? activeIndex > 0 : page > 0
  const canGoNext = isMobile ? activeIndex < products.length - 1 : page < maxPage
  const itemWidthPercent = 100 / visibleCount
  const showControls = isMobile ? products.length > 1 : maxPage > 0
  const dotCount = isMobile ? products.length : maxPage + 1
  const activeDot = isMobile ? activeIndex : page

  return (
    <section
      className={cn(
        'home-snap-section py-section-y',
        tone === 'sand' ? 'bg-warm-sand/45' : 'bg-cream',
      )}
    >
      <Container className="space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl space-y-3">
            <h2 className="font-display text-section-title text-heritage-green">{block.title}</h2>
            {block.subtitle ? (
              <p className="font-body text-body text-matte-black/75">{block.subtitle}</p>
            ) : null}
          </div>

          {showControls ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={goPrevious}
                disabled={!canGoPrevious}
                aria-label={`Previous ${block.title}`}
                className="inline-flex h-11 w-11 items-center justify-center border border-heritage-green text-heritage-green transition-colors hover:bg-heritage-green hover:text-white disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-heritage-green"
              >
                ←
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={!canGoNext}
                aria-label={`Next ${block.title}`}
                className="inline-flex h-11 w-11 items-center justify-center border border-heritage-green text-heritage-green transition-colors hover:bg-heritage-green hover:text-white disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-heritage-green"
              >
                →
              </button>
            </div>
          ) : null}
        </div>

        <div ref={trackRef} aria-roledescription="carousel" aria-label={block.title}>
          {isMobile ? (
            <div
              ref={mobileScrollerRef}
              className="product-carousel-snap -mx-container-x flex snap-x snap-mandatory gap-4 overflow-x-auto px-[12.5%] pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="list"
            >
              {products.map((product) => (
                <div
                  key={product.id}
                  data-carousel-item
                  role="listitem"
                  className="w-[75%] shrink-0 snap-center snap-always"
                >
                  <ProductCard product={product} className="h-full border-sand/80 bg-white/90" />
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-hidden">
              <div
                className="flex transition-transform duration-500 ease-out"
                style={{ transform: `translateX(-${page * 100}%)` }}
                role="list"
              >
                {products.map((product) => (
                  <div
                    key={product.id}
                    role="listitem"
                    className="shrink-0 px-2 first:pl-0 last:pr-0 sm:px-2.5"
                    style={{ width: `${itemWidthPercent}%` }}
                  >
                    <ProductCard product={product} className="h-full border-sand/80 bg-white/90" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {showControls ? (
          <div className="flex justify-center gap-2">
            {Array.from({ length: dotCount }, (_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => {
                  if (isMobile) {
                    scrollMobileToIndex(index)
                    return
                  }
                  setPage(index)
                }}
                aria-label={`Go to ${block.title} page ${index + 1}`}
                className={cn(
                  'h-2 w-2 rounded-full transition-colors',
                  index === activeDot
                    ? 'bg-heritage-green'
                    : 'bg-heritage-green/25 hover:bg-heritage-green/50',
                )}
              />
            ))}
          </div>
        ) : null}

        <div className="flex justify-center pt-2">
          <Button href={block.shopAll.href} variant="secondary">
            {resolveLinkLabel(block.shopAll)}
          </Button>
        </div>
      </Container>
    </section>
  )
}
