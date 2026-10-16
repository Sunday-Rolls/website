import { Link } from 'react-router-dom'
import { brandAssets } from '@/assets'
import { useCart } from '@/lib/cart'
import { getButtonLabel, useSiteContent } from '@/lib/content'
import { prefetchHandlers } from '@/lib/preload-route'
import { sitePath } from '@/lib/site-path'
import { cn } from '@/lib/utils'
import { Container } from '@/components/ui/Container'

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

export function Header() {
  const { brand, navigation } = useSiteContent()
  const { itemCount } = useCart()

  return (
    <header className="sticky top-0 z-50 border-b border-sand bg-cream/95 backdrop-blur-sm">
      <Container className="flex h-16 items-center justify-between gap-6">
        <Link to="/" className="flex items-center gap-3 text-heritage-green" {...prefetchHandlers('/')}>
          <img
            src={brandAssets.logoMark}
            alt=""
            aria-hidden="true"
            width={24}
            height={36}
            className="h-9 w-auto shrink-0"
          />
          <span className="font-display text-lg tracking-wide">{brand.name}</span>
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
