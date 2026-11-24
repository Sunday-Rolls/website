import { useState, type CSSProperties } from 'react'
import { usePageContent } from '@/lib/content'
import { assetUrl } from '@/lib/asset-url'
import { trackCtaClick } from '@/lib/gtm'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
// Only this lazily loaded banner uses the heavy weight, so control visitors never download it.
import '@fontsource/inter/latin-800.css'

/**
 * Flagstick Fuel banner (A/B test home-fuel-banner, arm b).
 * A sports-drink commercial in the cover's own colours: the flavor-block strip (par, birdie,
 * bogey) drips down a dark, spotlit backdrop; the headline names the flavors; picking one
 * recolours the glow and the shop button. Center-shafted only, so there is no fit picker.
 */
export function FuelBanner() {
  const { fuel } = usePageContent('home')
  const [flavorIndex, setFlavorIndex] = useState(1)

  const flavor = fuel?.flavors[flavorIndex] ?? fuel?.flavors[0]
  if (!fuel || !flavor) return null

  return (
    <section
      className="relative overflow-hidden bg-fuel-night text-white"
      style={{ '--flavor': flavor.color } as CSSProperties}
      aria-labelledby="home-fuel-heading"
    >
      {/* Spotlight from above, a pool of the picked flavor behind the cover, and studio haze. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-10%,rgba(31,93,62,0.55)_0%,rgba(11,19,14,0)_60%),radial-gradient(ellipse_at_50%_120%,rgba(31,93,62,0.35)_0%,rgba(11,19,14,0)_55%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[18%] right-[-10%] h-[85%] w-[70%] rounded-full opacity-35 blur-[90px] transition-[background-color] duration-700 lg:right-[-4%]"
        style={{ backgroundColor: 'var(--flavor)' }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-40 [background-image:repeating-linear-gradient(115deg,rgba(255,255,255,0.035)_0_2px,transparent_2px_26px)]"
      />

      <Drips colors={fuel.flavors.map((f) => f.color)} />

      <Container className="relative pt-[calc(var(--spacing-section-y)+5rem)] pb-[calc(var(--spacing-section-y)+1rem)] lg:pt-40 lg:pb-28">
        <div className="grid items-center gap-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-14">
          <div className="order-2 space-y-8 lg:order-1">
            {fuel.eyebrow ? (
              <p className="inline-block -skew-x-12 bg-white px-3 py-1 font-body text-label font-semibold uppercase tracking-[0.3em] text-fuel-night">
                <span className="inline-block skew-x-12">{fuel.eyebrow}</span>
              </p>
            ) : null}

            <h2
              id="home-fuel-heading"
              className="-skew-x-6 font-body text-[clamp(2.7rem,6.2vw,5.4rem)] leading-[0.92] font-extrabold tracking-[-0.03em] uppercase"
            >
              <span className="flex flex-wrap gap-x-[0.28em]">
                {fuel.flavors.map((option, index) => (
                  <span
                    key={option.label}
                    className={cn(
                      'transition-[opacity,text-shadow] duration-500',
                      index === flavorIndex ? 'opacity-100' : 'opacity-80',
                    )}
                    style={{
                      color: option.color,
                      textShadow: index === flavorIndex ? `0 0 28px ${option.color}80` : 'none',
                    }}
                  >
                    {option.label}.{' '}
                  </span>
                ))}
              </span>
              <span className="sr-only"> </span>
              <span className="mt-1 block text-white">{fuel.title}</span>
            </h2>

            <div className="space-y-4 font-body text-body text-white/75">
              {fuel.lines.map((line) => (
                <p key={line} className="max-w-md">
                  {line}
                </p>
              ))}
            </div>

            {fuel.flavors.length > 1 ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-3" role="group" aria-label="Pick a flavor">
                  {fuel.flavors.map((option, index) => (
                    <button
                      key={option.label}
                      type="button"
                      aria-pressed={index === flavorIndex}
                      onClick={() => setFlavorIndex(index)}
                      className={cn(
                        'flex -skew-x-6 items-center gap-2.5 border-2 px-4 py-2 font-body text-label font-extrabold uppercase tracking-widest transition-[background-color,color,border-color,transform] duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
                        index === flavorIndex
                          ? 'scale-105 text-fuel-night'
                          : 'border-white/25 bg-transparent text-white/80 hover:border-white/60 hover:text-white',
                      )}
                      style={
                        index === flavorIndex
                          ? { backgroundColor: option.color, borderColor: option.color }
                          : undefined
                      }
                    >
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 rounded-full ring-2 ring-black/20"
                        style={{ backgroundColor: option.color }}
                      />
                      <span className="skew-x-6">{option.label}</span>
                    </button>
                  ))}
                </div>
                <p className="font-body text-body-small text-white/70" aria-live="polite">
                  {flavor.line ? <span className="font-semibold text-white">{flavor.line} </span> : null}
                  Every cover carries all three.
                </p>
              </div>
            ) : null}

            {fuel.stats?.length ? (
              <dl className="grid max-w-lg grid-cols-2 border-t border-l border-white/15 sm:grid-cols-4">
                {fuel.stats.map((stat) => (
                  <div key={stat.label} className="border-r border-b border-white/15 px-3 py-3">
                    <dt className="font-body text-[0.65rem] uppercase tracking-[0.2em] text-white/55">{stat.label}</dt>
                    <dd className="mt-1 font-body text-body-small font-extrabold uppercase text-white">{stat.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

            <Button
              href={fuel.href}
              className="group [&>span]:-skew-x-6 [&>span]:gap-3 [&>span]:border-2 [&>span]:border-[var(--flavor)] [&>span]:bg-[var(--flavor)] [&>span]:px-8 [&>span]:py-3.5 [&>span]:font-extrabold [&>span]:text-fuel-night [&>span]:shadow-[0_10px_30px_-10px_var(--flavor)] [&>span]:transition-[background-color,border-color,transform] [&>span]:duration-500 hover:[&>span]:-translate-y-0.5"
              onClick={() => trackCtaClick(fuel.cta.label, 'home_fuel')}
            >
              {fuel.cta.label}
              <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1">
                →
              </span>
            </Button>
          </div>

          {/* The cover on a cold card, beaded with condensation. */}
          <div className="relative order-1 mx-auto w-full max-w-[20rem] sm:max-w-[24rem] lg:order-2 lg:max-w-[27rem]">
            <div
              aria-hidden="true"
              className="absolute inset-[8%] rounded-[2rem] opacity-70 blur-2xl transition-[background-color] duration-700"
              style={{ backgroundColor: 'var(--flavor)' }}
            />
            <div className="relative rotate-3 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:rotate-0 motion-reduce:transition-none">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] bg-[#e7decd] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.8)] ring-1 ring-white/10">
                <img
                  src={assetUrl(fuel.image)}
                  srcSet={
                    fuel.imageSmall
                      ? `${assetUrl(fuel.imageSmall)} 720w, ${assetUrl(fuel.image)} 1200w`
                      : undefined
                  }
                  sizes="(min-width: 1024px) 27rem, (min-width: 640px) 24rem, 20rem"
                  alt="Flagstick Fuel center-shafted putter cover"
                  width={1200}
                  height={1200}
                  fetchPriority="low"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-contain"
                />
                {/* A cold sheen down the left edge and the top. */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-[linear-gradient(100deg,rgba(255,255,255,0.35)_0%,rgba(255,255,255,0)_22%),linear-gradient(180deg,rgba(255,255,255,0.18)_0%,rgba(255,255,255,0)_18%)]"
                />
                <Condensation />
              </div>
              {/* Flavor strip under the card, like the one stitched on the cover. */}
              <div aria-hidden="true" className="absolute -bottom-4 left-[8%] right-[8%] flex h-8 -skew-x-6 overflow-hidden shadow-[0_10px_20px_-8px_rgba(0,0,0,0.7)]">
                {fuel.flavors.map((option) => (
                  <span
                    key={option.label}
                    className="grid flex-1 place-items-center font-body text-[0.65rem] font-extrabold uppercase tracking-[0.2em] text-white"
                    style={{ backgroundColor: option.color }}
                  >
                    <span className="skew-x-6 [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]">{option.label}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Container>

      {/* Closing stripe in the three flavors, into the cream section below. */}
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 flex h-2">
        {fuel.flavors.map((option) => (
          <span key={option.label} className="flex-1" style={{ backgroundColor: option.color }} />
        ))}
      </div>
    </section>
  )
}

type Drip = { x: number; w: number; len: number; c: number; delay: number }

/**
 * Colour running down from the top edge: a band in each flavor with drips of different
 * lengths. Long drips sit at the edges and behind the cover; short ones over the copy.
 */
const DRIPS: Drip[] = [
  { x: 40, w: 26, len: 300, c: 0, delay: 0 },
  { x: 110, w: 16, len: 180, c: 0, delay: -2 },
  { x: 175, w: 22, len: 240, c: 0, delay: -4 },
  { x: 260, w: 14, len: 90, c: 0, delay: -1 },
  { x: 340, w: 18, len: 120, c: 0, delay: -3 },
  { x: 420, w: 12, len: 70, c: 0, delay: -5 },
  { x: 520, w: 20, len: 110, c: 1, delay: -2.5 },
  { x: 600, w: 14, len: 80, c: 1, delay: -0.5 },
  { x: 680, w: 24, len: 150, c: 1, delay: -3.5 },
  { x: 770, w: 16, len: 210, c: 1, delay: -1.5 },
  { x: 850, w: 28, len: 330, c: 1, delay: -4.5 },
  { x: 940, w: 14, len: 160, c: 1, delay: -2 },
  { x: 1010, w: 22, len: 280, c: 2, delay: -1 },
  { x: 1090, w: 16, len: 200, c: 2, delay: -3 },
  { x: 1170, w: 26, len: 360, c: 2, delay: -5 },
  { x: 1250, w: 14, len: 150, c: 2, delay: -2 },
  { x: 1320, w: 20, len: 260, c: 2, delay: -4 },
  { x: 1400, w: 18, len: 190, c: 2, delay: -0.5 },
]

function dripPath({ x, w, len }: Drip): string {
  const half = w / 2
  const bulb = w * 0.75
  return [
    `M${x - half} 0`,
    `L${x - half} ${len - bulb}`,
    `C${x - half - 2} ${len + bulb * 0.6}, ${x + half + 2} ${len + bulb * 0.6}, ${x + half} ${len - bulb}`,
    `L${x + half} 0 Z`,
  ].join(' ')
}

function Drips({ colors }: { colors: string[] }) {
  const band = 'M0 0 H1440 V26 C 1380 40, 1320 22, 1260 34 S 1140 46, 1080 30 S 960 22, 900 36 S 780 44, 720 28 S 600 20, 540 34 S 420 46, 360 30 S 240 20, 180 34 S 60 42, 0 28 Z'
  const thirds = [
    { from: 0, to: 480 },
    { from: 480, to: 960 },
    { from: 960, to: 1440 },
  ]
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1440 440"
      preserveAspectRatio="xMidYMin slice"
      className="pointer-events-none absolute inset-x-0 top-0 h-[300px] w-full sm:h-[380px] lg:h-[440px]"
    >
      <defs>
        {thirds.map((third, i) => (
          <clipPath key={i} id={`fuel-third-${i}`}>
            <rect x={third.from} y="0" width={third.to - third.from} height="440" />
          </clipPath>
        ))}
        <linearGradient id="fuel-gloss" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.3" stopColor="#ffffff" stopOpacity="0.45" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* The band along the top, a third per flavor. */}
      {thirds.map((_, i) => (
        <path key={i} d={band} fill={colors[i % colors.length]} clipPath={`url(#fuel-third-${i})`} />
      ))}

      {DRIPS.map((drip) => {
        const color = colors[drip.c % colors.length]
        return (
          <g key={drip.x}>
            <g
              className="origin-top [transform-box:fill-box] motion-safe:animate-[drip-stretch_7s_ease-in-out_infinite]"
              style={{ animationDelay: `${drip.delay}s` }}
            >
              <path d={dripPath(drip)} fill={color} />
              {/* Gloss down the left side of each drip. */}
              <rect
                x={drip.x - drip.w / 2 + drip.w * 0.18}
                y="20"
                width={Math.max(2, drip.w * 0.18)}
                height={Math.max(0, drip.len - drip.w * 1.2)}
                rx={drip.w * 0.09}
                fill="#ffffff"
                opacity="0.35"
              />
            </g>
            {drip.len > 170 ? (
              <ellipse
                cx={drip.x}
                cy={drip.len + drip.w * 0.55}
                rx={drip.w * 0.32}
                ry={drip.w * 0.42}
                fill={color}
                className="opacity-0 motion-safe:animate-[drop-fall_5s_ease-in_infinite]"
                style={{ animationDelay: `${drip.delay * 1.3}s` }}
              />
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}

const BEADS: Array<[number, number, number]> = [
  [12, 14, 5], [20, 9, 3], [85, 12, 6], [90, 22, 3.5], [8, 38, 4], [93, 46, 5], [15, 70, 3],
  [88, 74, 4.5], [10, 86, 6], [80, 90, 3], [50, 6, 3.5], [30, 92, 4],
]

/** Condensation beads around the edges of the card, clear of the cover itself. */
function Condensation() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {BEADS.map(([left, top, size]) => (
        <span
          key={`${left}-${top}`}
          className="absolute rounded-full bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,0.95)_0%,rgba(255,255,255,0.35)_35%,rgba(120,140,130,0.25)_70%,rgba(255,255,255,0)_100%)] shadow-[0_1px_1px_rgba(0,0,0,0.12)]"
          style={{ left: `${left}%`, top: `${top}%`, width: size * 2, height: size * 2.3 }}
        />
      ))}
    </div>
  )
}
