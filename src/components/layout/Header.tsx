import { Link } from 'react-router-dom'
import { brandAssets } from '@/assets'
import { useSiteContent } from '@/lib/content'
import { cn } from '@/lib/utils'
import { Container } from '@/components/ui/Container'

export function Header() {
  const { brand, navigation } = useSiteContent()

  return (
    <header className="sticky top-0 z-50 border-b border-sand bg-cream/95 backdrop-blur-sm">
      <Container className="flex h-16 items-center justify-between gap-6">
        <Link to="/" className="flex items-center gap-3 text-heritage-green">
          <img
            src={brandAssets.logoMark}
            alt=""
            aria-hidden="true"
            className="size-8 shrink-0"
          />
          <span className="font-display text-lg tracking-wide">{brand.name}</span>
        </Link>

        <nav aria-label="Primary">
          <ul className="flex items-center gap-6">
            {navigation.primary.map((item) => (
              <li key={item.href}>
                <Link
                  to={item.href}
                  className={cn(
                    'font-body text-nav uppercase tracking-widest text-heritage-green',
                    'transition-colors hover:text-forest-green',
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </header>
  )
}
