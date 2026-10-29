import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '@/lib/cart'
import { getButtonLabel, useSiteContent } from '@/lib/content'
import { prefetchHandlers } from '@/lib/preload-route'
import { scheduleAfterLoad } from '@/lib/schedule'
import { sitePath } from '@/lib/site-path'
import { cn } from '@/lib/utils'
import { Container } from '@/components/ui/Container'
import { StrollingLogo } from '@/components/layout/StrollingLogo'
import { preloadStroll } from '@/components/layout/stroll-loader'

function CartIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M6 6h15l-1.5 9h-12z" />
      <path d="M6 6 5 3H2" />
      <circle cx="9" cy="20" r="1" fill="currentColor" stroke="none" />
      <circle cx="18" cy="20" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

const STROLL_QUERY = '(min-width: 1024px) and (hover: hover) and (prefers-reduced-motion: no-preference)'
const FIRST_STROLL_MS = 12_000
const STROLL_GAP_MS = [30_000, 60_000] as const

/** Every so often on desktop, the logo's old man hops off his log and putts a ball to the cart. */
function useLogoStroll() {
  const [strolling, setStrolling] = useState(false)

  useEffect(() => {
    if (typeof window.matchMedia === 'function' && window.matchMedia(STROLL_QUERY).matches) {
      return scheduleAfterLoad(preloadStroll, 4000)
    }
  }, [])

  useEffect(() => {
    if (strolling || typeof window.matchMedia !== 'function') return
    const [minGap, maxGap] = STROLL_GAP_MS
    let delay = minGap + Math.random() * (maxGap - minGap)
    if (!sessionStorageFlag()) delay = FIRST_STROLL_MS
    const timer = window.setTimeout(() => {
      if (document.hidden || !window.matchMedia(STROLL_QUERY).matches) return
      markStrolled()
      setStrolling(true)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [strolling])

  const endStroll = useCallback(() => setStrolling(false), [])
  /** Click the old man and he putts one too (unless he's already at it, or motion is reduced). */
  const startStroll = useCallback(() => {
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    markStrolled()
    setStrolling(true)
  }, [])
  return { strolling, startStroll, endStroll }
}


function sessionStorageFlag(): boolean {
  try {
    return window.sessionStorage.getItem('sr-logo-strolled') === '1'
  } catch {
    return true
  }
}

function markStrolled() {
  try {
    window.sessionStorage.setItem('sr-logo-strolled', '1')
  } catch {
    // Storage blocked: the next stroll just waits the normal gap.
  }
}

export function Header() {
  const { brand, navigation } = useSiteContent()
  const { itemCount } = useCart()
  const { strolling, startStroll, endStroll } = useLogoStroll()

  return (
    <header className="sticky top-0 z-50 border-b border-sand bg-cream/95 backdrop-blur-sm">
      <Container className="flex h-16 items-center justify-between gap-6">
        <Link to="/" className="flex items-center gap-3 text-heritage-green" {...prefetchHandlers('/')}>
          <StrollingLogo strolling={strolling} onDone={endStroll} onClick={startStroll} />
          <span className="relative z-10 font-display text-lg tracking-wide">{brand.name}</span>
        </Link>

        <div className="flex items-center gap-6">
          <nav aria-label="Primary">
            <ul className="flex items-center gap-6">
              {navigation.primary.map((item) => (
                <li key={item.href}>
                  <Link
                    to={sitePath(item.href)}
                    className={cn(
                      'font-body text-nav uppercase tracking-widest text-heritage-green',
                      'transition-colors hover:text-forest-green',
                    )}
                    {...prefetchHandlers(sitePath(item.href))}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <Link
            to="/cart"
            data-putt-target
            className={cn(
              'relative inline-flex items-center justify-center text-heritage-green',
              'transition-colors hover:text-forest-green',
            )}
            aria-label={
              itemCount > 0
                ? `${getButtonLabel('cart')}, ${itemCount} items`
                : getButtonLabel('cart')
            }
          >
            <CartIcon className="h-6 w-6" />
            <span
              aria-hidden="true"
              className={cn(
                'absolute -right-2 -top-2 inline-flex h-5 min-w-5 items-center justify-center',
                'bg-heritage-green px-1 font-body text-[10px] leading-none text-cream',
              )}
            >
              {itemCount}
            </span>
          </Link>
        </div>
      </Container>
    </header>
  )
}
