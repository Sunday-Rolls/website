import { useState, type CSSProperties } from 'react'
import { usePageContent } from '@/lib/content'
import type { HomeContent } from '@/types/content'
import { assetUrl } from '@/lib/asset-url'
import { trackCtaClick } from '@/lib/gtm'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
// Only this lazily loaded banner uses the heavy weight, so control visitors never download it.
import '@fontsource/inter/latin-800.css'

/**
 * Sunny Side Up diner banner, the second Sunny Side Up option
 * (A/B test home-sunny-diner-banner, arm b).
 * A 1950s diner counter at dawn: butter-yellow wall with chrome trim, an "Open early" neon sign,
 * the cover served in a cast-iron skillet with steam rising, the details on an order ticket clipped
 * to a chrome rail, a service bell to ring, and a checkerboard counter edge into the next section.
 * One fit (L.A.B. OZ.1i and Mezz.1), so there is no fit picker.
 */
export function SunnyDinerBanner() {
  const { sunnyDiner } = usePageContent('home')
  const [rings, setRings] = useState(0)
  if (!sunnyDiner) return null

  const { ticket } = sunnyDiner

  return (
    <section className="relative overflow-hidden bg-diner-butter text-diner-ink" aria-labelledby="home-sunny-diner-heading">
      <DinerWall neon={sunnyDiner.neon} />

      <Container className="relative pt-section-y pb-[calc(var(--spacing-section-y)+4rem)] lg:pt-24 lg:pb-36">
        <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
          <div className="order-2 space-y-7 lg:order-1 lg:max-w-xl">
            {sunnyDiner.eyebrow ? (
              <p className="inline-flex items-center gap-2 rounded-full bg-diner-red px-4 py-1.5 font-body text-label font-bold tracking-[0.25em] text-diner-butter uppercase shadow-[0_3px_0_#8f1f18]">
                <EggMark className="h-4 w-4" />
                {sunnyDiner.eyebrow}
              </p>
            ) : null}

            <h2
              id="home-sunny-diner-heading"
              className="font-body text-[clamp(2.8rem,6.4vw,5.2rem)] leading-[0.95] font-extrabold tracking-[-0.03em] uppercase"
            >
              {sunnyDiner.titleLines.map((line, index) => (
                <span
                  key={line}
                  className={cn(
                    'block',
                    index === 0
                      ? 'text-diner-ink'
                      : 'text-diner-red [text-shadow:3px_3px_0_#f6b51e,6px_6px_0_var(--color-diner-ink)]',
                  )}
                >
                  {line}{' '}
                </span>
              ))}
            </h2>

            {sunnyDiner.subtitle ? (
              <p className="font-body text-lg font-bold text-diner-ink sm:text-xl">{sunnyDiner.subtitle}</p>
            ) : null}

            <div className="space-y-4 font-body text-body text-diner-ink/80">
              {sunnyDiner.lines.map((line) => (
                <p key={line} className="max-w-md">
                  {line}
                </p>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-5">
              <Button
                href={sunnyDiner.href}
                className="group [&>span]:gap-3 [&>span]:rounded-full [&>span]:border-2 [&>span]:border-diner-ink [&>span]:bg-diner-red [&>span]:px-8 [&>span]:py-3.5 [&>span]:font-extrabold [&>span]:text-diner-butter [&>span]:shadow-[0_5px_0_var(--color-diner-ink)] [&>span]:transition-[transform,box-shadow] hover:[&>span]:-translate-y-0.5 hover:[&>span]:shadow-[0_7px_0_var(--color-diner-ink)] active:[&>span]:translate-y-[3px] active:[&>span]:shadow-[0_2px_0_var(--color-diner-ink)]"
                onClick={() => trackCtaClick(sunnyDiner.cta.label, 'home_sunny_diner')}
              >
                {sunnyDiner.cta.label}
                <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1">
                  →
                </span>
              </Button>
              <ServiceBell rings={rings} onRing={() => setRings((count) => count + 1)} />
            </div>
          </div>

          <div className="relative order-1 mx-auto w-full max-w-[21rem] sm:max-w-[25rem] lg:order-2 lg:max-w-[29rem]">
            {ticket ? <OrderTicket ticket={ticket} /> : null}
            <Skillet image={sunnyDiner.image} imageSmall={sunnyDiner.imageSmall} />
          </div>
        </div>
      </Container>

      {/* Checkerboard counter edge into the cream section below. */}
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0">
        <div className="h-2 bg-[linear-gradient(180deg,#f4f4f2,#a9adb3_55%,#e9eaec)]" />
        <div className="h-10 bg-diner-ink [background-image:conic-gradient(#f7f3ea_25%,transparent_0_50%,#f7f3ea_0_75%,transparent_0)] [background-size:40px_40px] sm:h-12" />
      </div>
    </section>
  )
}

/** Butter-yellow wall with chrome trim, a red stripe and the neon sign. */
function DinerWall({ neon }: { neon?: string }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_75%_35%,rgba(255,236,180,0.9)_0%,rgba(253,240,196,0)_55%)]" />
      {/* Subwall tile and trim behind the counter. */}
      <div className="absolute inset-x-0 bottom-12 h-[30%] bg-diner-mint [background-image:linear-gradient(90deg,rgba(29,29,29,0.08)_1px,transparent_1px),linear-gradient(0deg,rgba(29,29,29,0.08)_1px,transparent_1px)] [background-size:28px_28px] sm:bottom-14" />
      <div className="absolute inset-x-0 bottom-[calc(30%+3rem)] h-3 bg-diner-red shadow-[0_2px_0_#8f1f18] sm:bottom-[calc(30%+3.5rem)]" />
      <div className="absolute inset-x-0 bottom-[calc(30%+3.75rem)] h-[5px] bg-[linear-gradient(180deg,#ffffff,#a9adb3_60%,#e9eaec)] sm:bottom-[calc(30%+4.25rem)]" />

      {neon ? (
        <div className="absolute top-[7%] right-[4%] hidden -rotate-3 rounded-2xl border-[3px] border-[#3a1416] bg-[#2a0f12]/90 px-6 py-3 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)] md:block lg:right-[6%]">
          <p
            className="font-body text-2xl font-extrabold tracking-[0.12em] text-[#ffe6ea] uppercase motion-safe:animate-[neon-flicker_6s_linear_infinite] [text-shadow:0_0_4px_#fff,0_0_10px_#ff4d6d,0_0_22px_#ff2d55,0_0_40px_#ff2d55] lg:text-3xl"
          >
            {neon}
          </p>
        </div>
      ) : null}
    </div>
  )
}

/** The cover served in a cast-iron skillet, steam rising. */
function Skillet({ image, imageSmall }: { image: string; imageSmall?: string }) {
  return (
    <div className="relative mt-6 lg:mt-10">
      {/* Steam */}
      <div aria-hidden="true" className="pointer-events-none absolute -top-14 left-[18%] h-24 w-[50%]">
        {[0, 1, 2].map((i) => (
          <svg
            key={i}
            viewBox="0 0 30 80"
            className="absolute bottom-0 h-20 w-8 opacity-0 motion-safe:animate-[steam-rise_3.6s_ease-out_infinite] motion-reduce:opacity-50"
            style={{ left: `${i * 34}%`, animationDelay: `${i * 1.2}s` } as CSSProperties}
          >
            <path d="M15 78 C 4 64, 26 52, 15 38 C 4 24, 26 14, 15 2" fill="none" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" opacity="0.85" />
          </svg>
        ))}
      </div>

      <div className="relative ml-[2%] w-[86%]">
        {/* Handle */}
        <div aria-hidden="true" className="absolute top-1/2 -right-[34%] h-[12%] w-[42%] -translate-y-1/2 rounded-r-full bg-[linear-gradient(180deg,#3a3a3a,#141414)] shadow-[0_8px_14px_-6px_rgba(0,0,0,0.6)]">
          <span className="absolute top-1/2 right-[10%] h-[40%] w-[14%] -translate-y-1/2 rounded-full bg-diner-butter/90" />
        </div>
        {/* Pan */}
        <div className="relative aspect-square rounded-full bg-[radial-gradient(circle_at_40%_35%,#4a4a4a_0%,#232323_55%,#111111_100%)] p-[7%] shadow-[0_30px_45px_-20px_rgba(0,0,0,0.6),inset_0_3px_0_rgba(255,255,255,0.12)]">
          <div className="relative h-full w-full overflow-hidden rounded-full bg-[#e7decd] shadow-[inset_0_8px_18px_rgba(0,0,0,0.55)]">
            <img
              src={assetUrl(image)}
              srcSet={imageSmall ? `${assetUrl(imageSmall)} 600w, ${assetUrl(image)} 1000w` : undefined}
              sizes="(min-width: 1024px) 22rem, (min-width: 640px) 19rem, 16rem"
              alt="Sunny Side Up putter cover for L.A.B. OZ.1i and Mezz.1"
              width={1000}
              height={1000}
              fetchPriority="low"
              decoding="async"
              className="h-full w-full scale-[1.05] object-cover"
            />
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_0_0_6px_rgba(20,20,20,0.35)]" />
          </div>
        </div>
      </div>
    </div>
  )
}

type Ticket = NonNullable<NonNullable<HomeContent['sunnyDiner']>['ticket']>

/** A handwritten-style order ticket clipped to a chrome rail. */
function OrderTicket({ ticket }: { ticket: Ticket }) {
  return (
    <div className="relative z-10 ml-auto -mb-10 w-[64%] sm:-mb-14 lg:absolute lg:-top-6 lg:-right-10 lg:mb-0 lg:w-[56%]">
      {/* Rail */}
      <div aria-hidden="true" className="h-3 rounded-full bg-[linear-gradient(180deg,#ffffff,#a9adb3_60%,#6d7177)] shadow-[0_3px_6px_rgba(0,0,0,0.35)]" />
      <div className="relative mx-auto -mt-1 w-[92%] rotate-[4deg] bg-white px-4 pt-4 pb-6 font-mono text-[0.72rem] text-diner-ink shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)] [clip-path:polygon(0_0,100%_0,100%_calc(100%-8px),94%_100%,88%_calc(100%-8px),82%_100%,76%_calc(100%-8px),70%_100%,64%_calc(100%-8px),58%_100%,52%_calc(100%-8px),46%_100%,40%_calc(100%-8px),34%_100%,28%_calc(100%-8px),22%_100%,16%_calc(100%-8px),10%_100%,4%_calc(100%-8px),0_100%)]">
        <span aria-hidden="true" className="absolute top-0 left-1/2 h-3 w-8 -translate-x-1/2 bg-[linear-gradient(180deg,#d5d8dc,#8d9197)]" />
        <div className="flex items-baseline justify-between border-b border-dashed border-diner-ink/30 pb-1.5 font-bold uppercase">
          {ticket.number ? <span>Order #{ticket.number}</span> : <span />}
          {ticket.table ? <span>{ticket.table}</span> : null}
        </div>
        {ticket.items?.length ? (
          <ul className="mt-2 space-y-0.5 font-bold text-diner-red">
            {ticket.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
        {ticket.notes?.length ? (
          <dl className="mt-2 space-y-0.5">
            {ticket.notes.map((row) => (
              <div key={row.label} className="flex gap-2">
                <dt className="w-14 shrink-0 text-diner-ink/60 uppercase">{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </div>
  )
}

/** A chrome service bell. Ringing it calls "Order up!" (announced for screen readers too). */
function ServiceBell({ rings, onRing }: { rings: number; onRing: () => void }) {
  return (
    <div className="relative flex items-center gap-3">
      <button
        type="button"
        onClick={onRing}
        aria-label="Ring the service bell"
        className="relative h-12 w-14 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-diner-ink"
      >
        <svg
          key={rings}
          viewBox="0 0 56 48"
          className={cn('h-full w-full origin-bottom', rings > 0 && 'motion-safe:animate-[bell-ding_0.6s_ease-out]')}
          aria-hidden="true"
        >
          <rect x="24" y="2" width="8" height="6" rx="2" fill="#8d9197" />
          <path d="M8 38 C 8 18, 48 18, 48 38 Z" fill="url(#bell-chrome)" stroke="#5b5f65" strokeWidth="1.5" />
          <rect x="3" y="38" width="50" height="7" rx="3" fill="#2b2b2b" />
          <path d="M16 30 C 18 24, 24 21, 30 21" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" fill="none" />
          <defs>
            <linearGradient id="bell-chrome" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.45" stopColor="#c9ccd1" />
              <stop offset="1" stopColor="#7d8288" />
            </linearGradient>
          </defs>
        </svg>
      </button>
      <p
        className={cn(
          'font-body text-sm font-extrabold tracking-wider uppercase transition-opacity duration-300',
          rings > 0 ? 'text-diner-red opacity-100' : 'text-diner-ink/55 opacity-100',
        )}
        aria-live="polite"
      >
        {rings > 0 ? 'Ding! Order up!' : 'Ring for service'}
      </p>
    </div>
  )
}

function EggMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
      <path d="M8 1 C 12 1, 15 4, 14 8 C 13 12, 10 15, 6 14 C 2 13, 1 10, 2 6 C 3 3, 5 1, 8 1 Z" fill="#fff8e6" />
      <circle cx="8" cy="8" r="3.2" fill="#f6b51e" />
    </svg>
  )
}
