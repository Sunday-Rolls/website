import { useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useSiteContent } from '@/lib/content'
import { isPromoActive } from '@/lib/promo-banner'
import { sitePath } from '@/lib/site-path'

/** Base `top` of the static homepage poster in index.html (header height + border). */
const HERO_LCP_TOP = 'calc(4rem + 1px)'

/**
 * Sitewide sale bar above the header (Black Friday). Shows only inside the dates in
 * site.json `promoBanner`, or with `?promo=1` to preview early.
 */
export function PromoBanner() {
  const { promoBanner } = useSiteContent()
  const { search } = useLocation()
  // Remember a preview flag for the visit so it survives clicking around the preview.
  const [previewing] = useState(() => search.includes('promo=1'))
  const active = isPromoActive(promoBanner, new Date(), previewing ? '?promo=1' : search)
  const barRef = useRef<HTMLDivElement>(null)

  // The homepage's static LCP poster is absolutely positioned under the header;
  // push it down by the bar's height so it stays lined up with the hero.
  useLayoutEffect(() => {
    const hero = document.getElementById('hero-lcp')
    const bar = barRef.current
    if (!hero) return
    if (!active || !bar) {
      hero.style.top = HERO_LCP_TOP
      return
    }
    const sync = () => {
      hero.style.top = `calc(${HERO_LCP_TOP} + ${bar.offsetHeight}px)`
    }
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(bar)
    return () => {
      observer.disconnect()
      hero.style.top = HERO_LCP_TOP
    }
  }, [active])

  if (!active || !promoBanner) return null

  return (
    <div
      ref={barRef}
      role="region"
      aria-label={`${promoBanner.eyebrow}: ${promoBanner.headline}`}
      className="relative overflow-hidden border-b border-soft-gold/40 bg-heritage-green text-cream"
    >
      {/* Thin pinstripes, like the towel stripes. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:repeating-linear-gradient(90deg,currentColor_0_1px,transparent_1px_14px)]"
      />
      <div className="relative mx-auto flex max-w-container flex-wrap items-center justify-center gap-x-4 gap-y-1 px-container-x py-2.5 text-center">
        <span className="border border-soft-gold-bright/70 px-2 py-0.5 font-body text-soft-gold-bright text-[0.68rem] font-semibold uppercase tracking-[0.22em]">
          {promoBanner.eyebrow}
        </span>
        <span className="font-display text-lg leading-tight sm:text-xl">{promoBanner.headline}</span>
        <span className="hidden font-body text-sm text-cream/80 md:inline">{promoBanner.detail}</span>
        <Link
          to={sitePath(promoBanner.cta.href)}
          className="font-body text-sm font-medium uppercase tracking-widest text-cream underline decoration-cream/50 underline-offset-4 transition-colors hover:decoration-cream"
        >
          {promoBanner.cta.label} →
        </Link>
      </div>
    </div>
  )
}
