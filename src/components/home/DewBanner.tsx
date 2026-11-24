import type { CSSProperties } from 'react'
import { usePageContent } from '@/lib/content'
import { assetUrl } from '@/lib/asset-url'
import { trackCtaClick } from '@/lib/gtm'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
// Only this lazily loaded banner uses the heavy weight, so control visitors never download it.
import '@fontsource/inter/latin-800.css'

/**
 * Morning Dew banner (A/B test home-dew-banner, arm b).
 * A soda-bright citrus green tied to real dew on a first-light round: a misty dawn fairway with
 * rows of pines, a ball track glistening through the dew to the flag, and the cover behind a cold,
 * dewy glass with drops sliding down and fizz rising. One fit (L.A.B. DF3), no fit picker.
 */
export function DewBanner() {
  const { dew } = usePageContent('home')
  if (!dew) return null

  const lastLine = dew.titleLines.length - 1

  return (
    <section className="relative overflow-hidden bg-dew-mint text-pine-deep" aria-labelledby="home-dew-heading">
      <DawnFairway />

      <Container className="relative pt-section-y pb-[calc(var(--spacing-section-y)+6rem)] lg:pt-24 lg:pb-44">
        <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16">
          <div className="order-2 space-y-7 lg:order-1 lg:max-w-xl">
            {dew.eyebrow ? (
              <p className="flex items-center gap-2.5 font-body text-label font-bold tracking-[0.3em] text-pine uppercase">
                <DropMark className="h-4 w-3 text-citrus drop-shadow-[0_0_6px_rgba(155,226,45,0.8)]" />
                {dew.eyebrow}
              </p>
            ) : null}

            <h2
              id="home-dew-heading"
              className="font-body text-[clamp(2.8rem,6.6vw,5.4rem)] leading-[0.95] font-extrabold tracking-[-0.03em] uppercase"
            >
              {dew.titleLines.map((line, index) => (
                <span
                  key={line}
                  className={cn(
                    'block',
                    index === lastLine
                      ? 'text-citrus [-webkit-text-stroke:1.5px_var(--color-pine-deep)] [paint-order:stroke_fill] [text-shadow:0_0_24px_rgba(155,226,45,0.65),0_3px_0_var(--color-pine-deep)]'
                      : 'text-pine-deep',
                  )}
                >
                  {line}{' '}
                </span>
              ))}
            </h2>

            {dew.subtitle ? (
              <p className="font-body text-lg font-bold text-pine sm:text-xl">{dew.subtitle}</p>
            ) : null}

            <div className="space-y-4 font-body text-body text-pine-deep/80">
              {dew.lines.map((line) => (
                <p key={line} className="max-w-md">
                  {line}
                </p>
              ))}
            </div>

            {dew.teeSheet?.length ? <TeeSheet rows={dew.teeSheet} /> : null}

            <Button
              href={dew.href}
              className="group [&>span]:gap-3 [&>span]:rounded-full [&>span]:border-2 [&>span]:border-pine-deep [&>span]:bg-citrus [&>span]:px-8 [&>span]:py-3.5 [&>span]:font-extrabold [&>span]:text-pine-deep [&>span]:shadow-[0_0_0_4px_rgba(155,226,45,0.25),0_12px_30px_-10px_rgba(155,226,45,0.9)] [&>span]:transition-[transform,box-shadow] hover:[&>span]:-translate-y-0.5 hover:[&>span]:shadow-[0_0_0_6px_rgba(155,226,45,0.3),0_16px_36px_-10px_rgba(155,226,45,1)]"
              onClick={() => trackCtaClick(dew.cta.label, 'home_dew')}
            >
              {dew.cta.label}
              <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1">
                →
              </span>
            </Button>
          </div>

          <DewyGlass image={dew.image} />
        </div>
      </Container>
    </section>
  )
}

/** Tee sheet card: label and value in rows, like the starter's board at first light. */
function TeeSheet({ rows }: { rows: Array<{ label: string; value: string }> }) {
  return (
    <div className="max-w-md overflow-hidden rounded-xl border border-pine/20 bg-white/75 shadow-[0_12px_30px_-18px_rgba(20,52,35,0.6)] backdrop-blur-sm">
      <p className="bg-pine px-4 py-1.5 font-body text-[0.68rem] font-bold tracking-[0.3em] text-white uppercase">
        Tee sheet
      </p>
      <dl className="divide-y divide-pine/10 font-body text-body-small">
        {rows.map((row) => (
          <div key={row.label} className="flex gap-4 px-4 py-2">
            <dt className="w-24 shrink-0 font-bold text-pine">{row.label}</dt>
            <dd className="text-pine-deep">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** Dew drops on the glass: [left %, top %, size px, slides?]. */
const DROPS: Array<[number, number, number, boolean]> = [
  [6, 8, 14, false], [14, 22, 8, false], [88, 12, 16, true], [80, 30, 9, false], [92, 44, 12, false],
  [5, 46, 18, true], [12, 64, 10, false], [86, 70, 14, true], [94, 84, 9, false], [8, 86, 13, false],
  [22, 6, 7, false], [70, 6, 10, false], [48, 92, 11, false], [62, 88, 8, false], [30, 94, 9, false],
  [76, 52, 6, false], [18, 40, 6, false],
]

/** Fizz bubbles: [left %, size px, duration s, delay s]. */
const FIZZ: Array<[number, number, number, number]> = [
  [4, 8, 5, 0], [12, 5, 6, -2], [22, 6, 4.5, -1], [86, 7, 5.5, -3], [93, 5, 4, -0.5], [78, 9, 6.5, -4], [60, 5, 5, -2.5],
]

/** The cover behind cold, dewy glass, with fizz rising around it. */
function DewyGlass({ image }: { image: string }) {
  return (
    <div className="relative order-1 mx-auto w-full max-w-[20rem] sm:max-w-[24rem] lg:order-2 lg:max-w-[27rem]">
      {/* Citrus glow behind the glass. */}
      <div aria-hidden="true" className="absolute inset-[6%] rounded-[2rem] bg-citrus/55 blur-3xl" />

      {/* Fizz */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-10 bottom-0">
        {FIZZ.map(([left, size, duration, delay]) => (
          <span
            key={`${left}-${delay}`}
            className="absolute bottom-[10%] rounded-full border border-white/80 bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,0.95),rgba(190,240,120,0.45)_60%,rgba(155,226,45,0.15))] opacity-0 motion-safe:animate-[fizz-rise_var(--fizz-d)_ease-in_infinite] motion-reduce:opacity-60"
            style={{ left: `${left}%`, width: size, height: size, animationDelay: `${delay}s`, '--fizz-d': `${duration}s` } as CSSProperties}
          />
        ))}
      </div>

      <div className="relative rounded-[2rem] border border-white/70 bg-white/35 p-3 shadow-[0_40px_70px_-30px_rgba(20,52,35,0.55),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md sm:p-4">
        <div className="relative aspect-square overflow-hidden rounded-[1.5rem] bg-[#e6dfcd]">
          <img
            src={assetUrl(image)}
            alt="Morning Dew center-shafted putter cover"
            width={900}
            height={900}
            fetchPriority="low"
            decoding="async"
            className="h-full w-full object-cover"
          />
          {/* Cold mist on the glass, clearer in the middle. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_50%,rgba(255,255,255,0)_45%,rgba(235,248,238,0.55)_100%)]" />
          {/* Dew drops, a few sliding down. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            {DROPS.map(([left, top, size, slides], index) => (
              <span
                key={index}
                className={cn(
                  'absolute rounded-[50%_50%_48%_52%/58%_58%_42%_42%] bg-[radial-gradient(circle_at_32%_28%,rgba(255,255,255,0.95)_0_14%,rgba(255,255,255,0.35)_32%,rgba(200,230,205,0.25)_62%,rgba(255,255,255,0.05)_74%)] shadow-[inset_-1px_-2px_2px_rgba(20,52,35,0.25),0_1px_1px_rgba(255,255,255,0.6)]',
                  slides && 'motion-safe:animate-[drop-slide_7s_ease-in_infinite]',
                )}
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                  width: size,
                  height: size * 1.12,
                  animationDelay: `${-index * 1.3}s`,
                  '--slide': `${30 + size * 3}px`,
                } as CSSProperties}
              />
            ))}
            {/* Trails left by drops that already ran. */}
            <span className="absolute top-[18%] left-[88.6%] h-[22%] w-[3px] rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0),rgba(255,255,255,0.55))]" />
            <span className="absolute top-[30%] left-[5.8%] h-[18%] w-[4px] rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0),rgba(255,255,255,0.5))]" />
          </div>
        </div>
        <p className="mt-3 flex items-center justify-between px-1 font-body text-[0.68rem] font-bold tracking-[0.25em] text-pine uppercase">
          <span>Served cold</span>
          <span className="text-pine/60">6:42 AM</span>
        </p>
      </div>
    </div>
  )
}

/** Dawn sky, three rows of pines fading into haze, drifting mist and a dewy fairway with a ball track. */
function DawnFairway() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#fde9cf_0%,#f3efdc_30%,#e3f1e2_58%,#cfe6c9_100%)]" />
      <div className="absolute -top-[18%] right-[8%] h-[70%] w-[55%] rounded-full bg-[radial-gradient(closest-side,rgba(255,221,160,0.75),rgba(255,221,160,0))]" />

      <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="dew-fairway" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8fc46a" />
            <stop offset="1" stopColor="#5f9f4a" />
          </linearGradient>
          <symbol id="dew-pine" viewBox="0 0 40 80">
            <path d="M20 0 L30 22 H25 L34 40 H27 L38 62 H23 V80 H17 V62 H2 L13 40 H6 L15 22 H10 Z" />
          </symbol>
        </defs>
        {/* Far pines, lost in haze */}
        <g fill="#a9c7ae" opacity="0.7">
          {Array.from({ length: 26 }, (_, i) => (
            <use key={i} href="#dew-pine" x={i * 58 - 20} y={470 - (i % 3) * 8} width="36" height="72" />
          ))}
        </g>
        {/* Middle pines */}
        <g fill="#6f9c7a" opacity="0.85">
          {Array.from({ length: 20 }, (_, i) => (
            <use key={i} href="#dew-pine" x={i * 76 - 10} y={500 - (i % 4) * 10} width="48" height="96" />
          ))}
        </g>
        {/* Near pines, at the edges */}
        <g fill="var(--color-pine)">
          {[[-30, 470], [40, 500], [100, 520], [1290, 490], [1350, 470], [1410, 510]].map(([x, y]) => (
            <use key={`${x}`} href="#dew-pine" x={x} y={y} width="70" height="140" />
          ))}
        </g>
        {/* Fairway */}
        <path d="M0 640 C 260 610, 520 630, 760 622 S 1200 600, 1440 620 V900 H0 Z" fill="url(#dew-fairway)" />
        {/* Mower stripes */}
        <g fill="#ffffff" opacity="0.07">
          <path d="M120 900 L520 630 L600 628 L300 900 Z" />
          <path d="M480 900 L680 626 L760 624 L660 900 Z" />
          <path d="M840 900 L840 622 L920 620 L1020 900 Z" />
          <path d="M1200 900 L1000 617 L1080 615 L1380 900 Z" />
        </g>
        {/* Ball track through the dew, to the cup */}
        <path d="M260 900 C 420 800, 760 760, 1040 700 C 1100 688, 1140 680, 1168 676" fill="none" stroke="#467f3a" strokeWidth="9" strokeLinecap="round" opacity="0.55" />
        <path d="M260 900 C 420 800, 760 760, 1040 700 C 1100 688, 1140 680, 1168 676" fill="none" stroke="#ffffff" strokeWidth="1.5" strokeDasharray="1 14" strokeLinecap="round" opacity="0.8" />
        <ellipse cx="1176" cy="676" rx="12" ry="4" fill="#173a26" />
        <line x1="1176" y1="676" x2="1176" y2="586" stroke="#f3f1e8" strokeWidth="3" />
        <path d="M1178 586 L1222 598 L1178 610 Z" fill="var(--color-citrus)" />
        {/* Dew sparkle on the grass */}
        <g fill="#ffffff">
          {Array.from({ length: 70 }, (_, i) => {
            const x = (i * 97) % 1440
            const y = 650 + ((i * 53) % 240)
            return <circle key={i} cx={x} cy={y} r={(i % 3) * 0.6 + 0.8} opacity={0.35 + (i % 4) * 0.15} />
          })}
        </g>
      </svg>

      {/* Morning haze behind the copy so the text reads cleanly over the pines. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_55%_60%_at_28%_48%,rgba(247,248,239,0.82)_0%,rgba(247,248,239,0.55)_45%,rgba(247,248,239,0)_75%)]" />

      {/* Mist banks, and a soft fade into the cream section below. */}
      <div className="absolute top-[48%] -left-[10%] h-24 w-[70%] rounded-full bg-white/45 blur-2xl motion-safe:animate-[mist-drift_24s_ease-in-out_infinite]" />
      <div className="absolute top-[56%] -right-[10%] h-28 w-[65%] rounded-full bg-white/40 blur-2xl motion-safe:animate-[mist-drift_30s_ease-in-out_infinite_reverse]" />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(180deg,rgba(246,242,232,0),var(--color-cream))]" />
    </div>
  )
}

function DropMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 16" className={className} aria-hidden="true" fill="currentColor">
      <path d="M6 0 C 8 4, 12 8, 12 11 A6 6 0 0 1 0 11 C 0 8, 4 4, 6 0 Z" />
    </svg>
  )
}
