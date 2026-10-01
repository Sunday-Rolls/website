import { useSiteContent } from '@/lib/content'
import { cn } from '@/lib/utils'

type SocialNetwork = 'facebook' | 'instagram' | 'etsy'

const networks: Array<{ key: SocialNetwork; label: string }> = [
  { key: 'facebook', label: 'Facebook' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'etsy', label: 'Etsy' },
]

function SocialIcon({ network, className }: { network: SocialNetwork; className?: string }) {
  if (network === 'instagram') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className={className}
        aria-hidden="true"
      >
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4.2" />
        <circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none" />
      </svg>
    )
  }

  if (network === 'facebook') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
        <path d="M13.5 21v-7.6h2.6l.4-3h-3V8.5c0-.9.3-1.5 1.5-1.5h1.6V4.3c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.8v3h2.6V21z" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M7 4h10.2l.4 4.2h-.9c-.4-1.8-1-2.6-3-2.6h-3v5.6h2.2c1.5 0 1.9-.6 2.1-1.9h.8v5.4H15c-.2-1.4-.6-2-2.1-2h-2.2v4.6c0 1.2.6 1.6 1.8 1.6h1.4c1.9 0 2.6-.9 3.2-2.9h.9L17.6 20H7v-.8c1.1-.2 1.4-.5 1.4-1.6V6.4c0-1.1-.3-1.4-1.4-1.6z" />
    </svg>
  )
}

interface SocialLinksProps {
  /** `banner` shows large circular logos with labels; `compact` shows a row of small icons. */
  variant?: 'banner' | 'compact'
  className?: string
}

export function SocialLinks({ variant = 'compact', className }: SocialLinksProps) {
  const { footer } = useSiteContent()
  const links = networks.flatMap(({ key, label }) => {
    const href = footer.social?.[key]
    return href ? [{ key, label, href }] : []
  })

  if (links.length === 0) return null

  return (
    <ul
      className={cn(
        'flex items-center',
        variant === 'banner' ? 'justify-center gap-8 sm:gap-14' : 'gap-4',
        className,
      )}
    >
      {links.map(({ key, label, href }) => (
        <li key={key}>
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            aria-label={`Sunday Rolls on ${label}`}
            className={cn(
              'group flex flex-col items-center transition-colors',
              variant === 'banner'
                ? 'gap-3 text-heritage-green'
                : 'text-cream/85 hover:text-white',
            )}
          >
            {variant === 'banner' ? (
              <>
                <span className="inline-flex h-16 w-16 items-center justify-center rounded-full border border-heritage-green transition-colors group-hover:bg-heritage-green group-hover:text-cream sm:h-20 sm:w-20">
                  <SocialIcon network={key} className="h-7 w-7 sm:h-8 sm:w-8" />
                </span>
                <span className="font-body text-label uppercase tracking-widest">{label}</span>
              </>
            ) : (
              <SocialIcon network={key} className="h-5 w-5" />
            )}
          </a>
        </li>
      ))}
    </ul>
  )
}
