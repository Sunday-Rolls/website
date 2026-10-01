import type { ValueIcon } from '@/types/content'
import { cn } from '@/lib/utils'

interface ValueStripProps {
  items: Array<{ label: string; icon?: ValueIcon }>
  className?: string
}

const iconPaths: Record<ValueIcon, React.ReactNode> = {
  flag: (
    <>
      <circle cx="30" cy="6" r="1.6" />
      <path d="M30 8v42" />
      <path d="M30 9.5 46 15l-16 5.5" />
      <ellipse cx="30" cy="50.5" rx="4.5" ry="1.4" />
      <path d="M6 56c10-4.5 42-4.5 52 0" />
      <path d="M14 51.5c3-1.2 6.5-1.8 10-2.1M36 49.4c3.5.3 7 .9 10 2.1" />
    </>
  ),
  spool: (
    <>
      <rect x="15" y="8" width="30" height="6" rx="2" />
      <rect x="15" y="50" width="30" height="6" rx="2" />
      <path d="M19 14v36M41 14v36" />
      <path d="M19 20l22 4M19 26l22 4M19 32l22 4M19 38l22 4M19 44l22 4" />
      <path d="M41 24c7 1 11 5 10 12-1 6-5 9-3 15" />
      <path d="M50 51l6 6" />
      <circle cx="56.5" cy="57.5" r="1.2" />
    </>
  ),
  bag: (
    <>
      <path d="M26 17 22 5M32 17V3M38 17l5-11" />
      <path d="M19.5 5.5h5M29 3h6M40.5 5l5 1.6" />
      <rect x="20" y="17" width="24" height="6" rx="2" />
      <path d="M22 23h20v28a5 5 0 0 1-5 5H27a5 5 0 0 1-5-5z" />
      <rect x="26.5" y="33" width="11" height="12" rx="2" />
      <path d="M42 27c9 4 9 19 0 23" />
    </>
  ),
  shield: (
    <>
      <path d="M32 8 45 13v14c0 11-6 19-13 24-7-5-13-13-13-24V13z" />
      <path d="M32 14v31" />
      <path d="M14 20c-6 13-3 27 12 36M50 20c6 13 3 27-12 36" />
      <path d="M12.5 27c-3-1-4.5-3.5-4.5-6 3 .5 4.5 3 4.5 6zM11 35c-3-.5-5-3-5.5-5.5 3 0 5 2.5 5.5 5.5zM12.5 43c-3 0-5.5-2-6.5-4.5 3-.5 5.5 1.5 6.5 4.5zM17 50c-3 .5-6-1-7.5-3.5 3-1 6 .5 7.5 3.5z" />
      <path d="M51.5 27c3-1 4.5-3.5 4.5-6-3 .5-4.5 3-4.5 6zM53 35c3-.5 5-3 5.5-5.5-3 0-5 2.5-5.5 5.5zM51.5 43c3 0 5.5-2 6.5-4.5-3-.5-5.5 1.5-6.5 4.5zM47 50c3 .5 6-1 7.5-3.5-3-1-6 .5-7.5 3.5z" />
    </>
  ),
}

export function ValueStrip({ items, className }: ValueStripProps) {
  return (
    <div className={cn('border-t border-cream/10 bg-heritage-green py-10 md:py-12', className)}>
      <ul className="mx-auto grid w-full max-w-container grid-cols-2 gap-x-6 gap-y-10 px-container-x lg:grid-cols-4">
        {items.map((item) => (
          <li key={item.label} className="flex flex-col items-center gap-4 text-center">
            {item.icon ? (
              <svg
                viewBox="0 0 64 64"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-16 w-16 text-cream md:h-20 md:w-20"
                aria-hidden="true"
              >
                {iconPaths[item.icon]}
              </svg>
            ) : null}
            <p className="font-display text-xl font-semibold uppercase tracking-wide text-soft-gold sm:text-2xl md:text-[1.75rem]">
              {item.label}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
