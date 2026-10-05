import { assetUrl } from '@/lib/asset-url'
import { useSiteContent } from '@/lib/content'
import { cn } from '@/lib/utils'

type SocialNetwork = 'facebook' | 'instagram' | 'etsy'

const networks: Array<{ key: SocialNetwork; label: string }> = [
  { key: 'facebook', label: 'Facebook' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'etsy', label: 'Etsy' },
]

/** Logos are self-hosted in `public/assets/social` and masked so they inherit the text color. */
function SocialIcon({ network, className }: { network: SocialNetwork; className?: string }) {
  const url = `url("${assetUrl(`/assets/social/${network}.svg`)}")`

  return (
    <span
      aria-hidden="true"
      className={cn('inline-block bg-current', className)}
      style={{
        maskImage: url,
        WebkitMaskImage: url,
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
      }}
    />
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
