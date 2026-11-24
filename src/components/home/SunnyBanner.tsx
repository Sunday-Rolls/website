import { usePageContent } from '@/lib/content'
import { assetUrl } from '@/lib/asset-url'
import { trackCtaClick } from '@/lib/gtm'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
// Only this lazily loaded banner uses the italic, so control visitors never download it.
import '@fontsource/cormorant-garamond/latin-500-italic.css'

/**
 * Sunny Side Up banner (A/B test home-sunny-banner, arm b).
 * A bright morning: a yolk-gold sun rises behind the cover as the section scrolls in, the cover
 * sits in a round yolk window inside an egg-white shape over rolling fairway, and the details
 * read like a brunch menu. One fit (L.A.B. OZ.1i and Mezz.1), so there is no fit picker.
 */
export function SunnyBanner() {
  const { sunny } = usePageContent('home')
  if (!sunny) return null

  const [titleLead, titleLast] = splitLastWord(sunny.title)

  return (
    <section
      className="relative overflow-hidden bg-cream text-toast"
      aria-labelledby="home-sunny-heading"
    >
      {/* Morning sky warming toward the horizon. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,#fdf6e3_0%,#fcebc6_48%,#f9e2b4_66%,var(--color-cream)_100%)]"
      />
      <Fairway />

      <Container className="relative pt-section-y pb-[calc(var(--spacing-section-y)+3rem)] lg:pt-24 lg:pb-32">
        <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
          <Egg image={sunny.image} imageSmall={sunny.imageSmall} />

          <div className="space-y-7 lg:max-w-xl">
            {sunny.eyebrow ? (
              <p className="flex items-center gap-3 font-body text-label font-semibold uppercase tracking-[0.3em] text-[#b8650c]">
                <SunMark className="h-4 w-4" />
                {sunny.eyebrow}
              </p>
            ) : null}

            <h2
              id="home-sunny-heading"
              className="font-display text-[clamp(3rem,7vw,5.75rem)] leading-[0.95] font-semibold tracking-[-0.01em] text-toast"
            >
              {titleLead}
              {titleLead ? ' ' : null}
              <em className="font-medium text-[#d97d0c] italic">{titleLast}</em>
            </h2>

            {sunny.subtitle ? (
              <p className="font-display text-[1.6rem] leading-snug text-toast/90 sm:text-[1.8rem]">{sunny.subtitle}</p>
            ) : null}

            <div className="space-y-4 font-body text-body text-toast/80">
              {sunny.lines.map((line) => (
                <p key={line} className="max-w-md">
                  {line}
                </p>
              ))}
            </div>

            {sunny.menu?.length ? <MenuCard rows={sunny.menu} /> : null}

            <Button
              href={sunny.href}
              className="group [&>span]:gap-3 [&>span]:rounded-full [&>span]:border-2 [&>span]:border-yolk-sun [&>span]:bg-yolk-sun [&>span]:px-8 [&>span]:py-3.5 [&>span]:font-semibold [&>span]:text-toast [&>span]:shadow-[0_14px_30px_-14px_rgba(217,125,12,0.9)] [&>span]:transition-[background-color,transform] hover:[&>span]:-translate-y-0.5 hover:[&>span]:bg-[#ffb43f]"
              onClick={() => trackCtaClick(sunny.cta.label, 'home_sunny')}
            >
              {sunny.cta.label}
              <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1">
                →
              </span>
            </Button>
          </div>
        </div>
      </Container>
    </section>
  )
}

/** The cover in a round yolk window inside an egg-white shape, with the sun rising behind. */
function Egg({ image, imageSmall }: { image: string; imageSmall?: string }) {
  return (
    <div className="relative mx-auto w-full max-w-[22rem] sm:max-w-[27rem] lg:max-w-[31rem]">
      {/* Rising sun and its rays. */}
      <div aria-hidden="true" className="sunny-sun pointer-events-none absolute -top-[14%] -right-[10%] aspect-square w-[62%]">
        <div className="absolute -inset-[60%] rounded-full [background-image:repeating-conic-gradient(from_0deg,rgba(246,162,30,0.16)_0deg_8deg,transparent_8deg_20deg)] [mask-image:radial-gradient(closest-side,black_30%,transparent_100%)] motion-safe:animate-[rays-turn_160s_linear_infinite]" />
        <div className="absolute -inset-[30%] rounded-full bg-[radial-gradient(closest-side,rgba(255,196,90,0.55),rgba(255,196,90,0))]" />
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_38%_34%,#ffd36b_0%,#f9b233_45%,var(--color-yolk-sun)_75%,#e8860f_100%)] shadow-[0_0_80px_10px_rgba(246,162,30,0.35)]" />
      </div>

      {/* Egg white */}
      <svg
        viewBox="0 0 100 100"
        aria-hidden="true"
        className="relative w-full drop-shadow-[0_30px_40px_rgba(90,58,26,0.22)]"
      >
        <path
          d="M50 5 C64 3 73 11 83 15 C95 20 99 35 95 47 C92 57 99 69 92 79 C84 91 70 90 60 95 C48 100 36 97 27 90 C16 84 4 80 4 64 C4 52 0 44 5 32 C10 18 22 14 32 8 C38 5 44 5 50 5 Z"
          fill="var(--color-egg-white)"
        />
        {/* A soft sheen on the white. */}
        <path d="M22 20 C30 13 40 11 47 12" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.9" />
      </svg>

      {/* Yolk window with the cover. */}
      <div className="absolute top-[16%] left-[17%] aspect-square w-[66%] rounded-full bg-[#e7decd] p-0 shadow-[inset_0_6px_18px_rgba(90,58,26,0.18)] ring-[10px] ring-yolk-sun sm:ring-[12px]">
        <div className="absolute inset-0 overflow-hidden rounded-full">
          <img
            src={assetUrl(image)}
            srcSet={imageSmall ? `${assetUrl(imageSmall)} 720w, ${assetUrl(image)} 1200w` : undefined}
            sizes="(min-width: 1024px) 21rem, (min-width: 640px) 18rem, 15rem"
            alt="Sunny Side Up putter cover for L.A.B. OZ.1i and Mezz.1"
            width={1200}
            height={1200}
            fetchPriority="low"
            decoding="async"
            className="h-full w-full scale-[1.08] object-cover"
          />
        </div>
        {/* Gloss on the yolk ring, top left. */}
        <div aria-hidden="true" className="pointer-events-none absolute -inset-[12px] rounded-full [background:radial-gradient(circle_at_28%_22%,rgba(255,255,255,0.55)_0%,rgba(255,255,255,0)_22%)]" />
      </div>
    </div>
  )
}

/** Brunch-menu card: label, dotted leader, value. */
function MenuCard({ rows }: { rows: Array<{ label: string; value: string }> }) {
  return (
    <div className="max-w-md rounded-sm border border-toast/25 bg-egg-white/80 px-5 pt-3 pb-4 shadow-[0_10px_30px_-18px_rgba(90,58,26,0.5)] backdrop-blur-sm">
      <p className="mb-2 text-center font-display text-lg tracking-[0.25em] text-toast uppercase">
        <span aria-hidden="true" className="mr-2 text-yolk-sun">✦</span>
        Order up
        <span aria-hidden="true" className="ml-2 text-yolk-sun">✦</span>
      </p>
      <dl className="space-y-1.5 font-body text-body-small text-toast">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline gap-2">
            <dt className="shrink-0 font-semibold">{row.label}</dt>
            <span aria-hidden="true" className="min-w-4 flex-1 translate-y-[-3px] border-b-2 border-dotted border-toast/30" />
            <dd className="text-right">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** Rolling fairway on the horizon with a small flag, fading to cream at the bottom. */
function Fairway() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full">
        <path d="M0 700 C 240 660, 480 690, 720 680 S 1200 640, 1440 670 V900 H0 Z" fill="#c6d4a6" />
        <path d="M0 760 C 300 720, 560 760, 860 740 S 1260 720, 1440 740 V900 H0 Z" fill="var(--color-fairway)" opacity="0.8" />
        <g transform="translate(1250 676)">
          <line x1="0" y1="0" x2="0" y2="-70" stroke="#6b5a3d" strokeWidth="2.5" />
          <path d="M1.5 -70 L34 -61 L1.5 -52 Z" fill="var(--color-yolk-sun)" />
        </g>
      </svg>
      <div className="absolute inset-x-0 bottom-0 h-40 bg-[linear-gradient(180deg,rgba(246,242,232,0)_0%,var(--color-cream)_85%)]" />
    </div>
  )
}

function SunMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true" fill="currentColor">
      <circle cx="8" cy="8" r="3.2" />
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x="7.4" y="0.5" width="1.2" height="2.8" rx="0.6" transform={`rotate(${i * 45} 8 8)`} />
      ))}
    </svg>
  )
}

/** `"Rise and Roll."` → `["Rise and", "Roll."]`, so the last word can be set in italic. */
function splitLastWord(title: string): [string, string] {
  const trimmed = title.trim()
  const cut = trimmed.lastIndexOf(' ')
  return cut === -1 ? ['', trimmed] : [trimmed.slice(0, cut), trimmed.slice(cut + 1)]
}
