import { useState } from 'react'
import { usePageContent } from '@/lib/content'
import { assetUrl } from '@/lib/asset-url'
import { trackCtaClick } from '@/lib/gtm'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { PixelText } from '@/components/home/PixelText'

/** A chunky 8-bit outline: an ink border plus a hard drop shadow. */
const PIXEL_BOX = 'shadow-[0_0_0_3px_var(--color-pixel-ink),6px_6px_0_3px_rgba(20,20,31,0.35)]'

/**
 * Coin Collector banner (A/B test home-coin-banner, arm b).
 * An original 8-bit platformer screen: pixel sky, clouds, hills and a brick ground, a HUD across
 * the top, a pixel-font headline, and a bonus block visitors can hit to collect coins. Enough
 * coins trigger a power-up burst around the cover. One fit (L.A.B. OZ.1i and Mezz.1).
 */
export function CoinBanner() {
  const { coin } = usePageContent('home')
  const [coins, setCoins] = useState(0)
  const [bumps, setBumps] = useState(0)

  if (!coin) return null

  const target = coin.coinsForPowerUp ?? 5
  const poweredUp = coins >= target
  const titleLines = splitInTwo(coin.title)

  function hitBlock() {
    setCoins((count) => count + 1)
    setBumps((count) => count + 1)
  }

  return (
    <section
      className="relative overflow-hidden bg-pixel-sky text-pixel-ink"
      aria-labelledby="home-coin-heading"
    >
      <PixelWorld />

      <Container className="relative pt-8 pb-[calc(var(--spacing-section-y)+4.5rem)] lg:pt-10 lg:pb-36">
        <Hud coins={coins} />

        <div className="mt-10 grid items-center gap-14 lg:mt-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14">
          <div className="order-2 space-y-7 lg:order-1 lg:max-w-xl">
            {coin.eyebrow ? (
              <p className="flex items-center gap-2 font-mono text-sm font-bold tracking-[0.2em] text-pixel-ink uppercase">
                <span aria-hidden="true" className="motion-safe:animate-[pixel-blink_1s_steps(1)_infinite]">▶</span>
                {coin.eyebrow}
              </p>
            ) : null}

            <h2 id="home-coin-heading">
              <span className="sr-only">{coin.title}</span>
              {titleLines.map((line) => (
                <PixelText
                  key={line}
                  text={line}
                  shadow={1}
                  shadowColor="var(--color-pixel-ink)"
                  className="mb-[0.6vw] block h-auto text-white last:mb-0 lg:mb-2"
                  // Same pixel size for every line: width follows the character count.
                  style={{ width: `min(100%, ${line.length * 3.6}rem)` }}
                />
              ))}
            </h2>

            {coin.subtitle ? (
              <p className="font-body text-lg font-extrabold tracking-wide text-pixel-ink uppercase sm:text-xl">
                {coin.subtitle}
              </p>
            ) : null}

            <div className="space-y-4 font-body text-body text-pixel-ink/85">
              {coin.lines.map((line) => (
                <p key={line} className="max-w-md">
                  {line}
                </p>
              ))}
            </div>

            {coin.stats?.length ? (
              <div className={cn('max-w-md bg-white px-5 py-4', PIXEL_BOX)}>
                <p className="mb-2 font-mono text-xs font-bold tracking-[0.25em] text-pixel-brick uppercase">Item stats</p>
                <dl className="space-y-1 font-mono text-[0.8rem] uppercase">
                  {coin.stats.map((row) => (
                    <div key={row.label} className="flex gap-3">
                      <dt className="w-24 shrink-0 font-bold">{row.label}</dt>
                      <dd>{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}

            <Button
              href={coin.href}
              className="group [&>span]:gap-3 [&>span]:border-[3px] [&>span]:border-pixel-ink [&>span]:bg-pixel-gold [&>span]:px-7 [&>span]:py-3.5 [&>span]:font-mono [&>span]:font-bold [&>span]:text-pixel-ink [&>span]:shadow-[5px_5px_0_var(--color-pixel-ink)] [&>span]:transition-[transform,box-shadow] hover:[&>span]:-translate-y-0.5 hover:[&>span]:shadow-[7px_7px_0_var(--color-pixel-ink)] active:[&>span]:translate-x-[3px] active:[&>span]:translate-y-[3px] active:[&>span]:shadow-[2px_2px_0_var(--color-pixel-ink)]"
              onClick={() => trackCtaClick(coin.cta.label, 'home_coin')}
            >
              {coin.cta.label}
              <span aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-1">
                ▶
              </span>
            </Button>
          </div>

          <Stage
            image={coin.image}
            imageSmall={coin.imageSmall}
            coins={coins}
            target={target}
            poweredUp={poweredUp}
            bumps={bumps}
            onHit={hitBlock}
          />
        </div>
      </Container>
    </section>
  )
}

/** Score, coins and hole, across the top like an arcade HUD. */
function Hud({ coins }: { coins: number }) {
  const score = String(coins * 100).padStart(6, '0')
  const count = String(coins).padStart(2, '0')
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 text-white" aria-hidden="true">
      <div className="flex items-center gap-3">
        <PixelText text="SCORE" shadow={1} shadowColor="var(--color-pixel-ink)" className="h-4 w-auto sm:h-5" />
        <PixelText text={score} shadow={1} shadowColor="var(--color-pixel-ink)" className="h-4 w-auto sm:h-5" />
      </div>
      <div className="flex items-center gap-2.5">
        <PixelCoin className="h-5 w-4 motion-safe:animate-[coin-spin_1.2s_steps(4)_infinite] sm:h-6 sm:w-5" />
        <PixelText text={`×${count}`} shadow={1} shadowColor="var(--color-pixel-ink)" className="h-4 w-auto sm:h-5" />
      </div>
      <div className="flex items-center gap-3">
        <PixelText text="HOLE" shadow={1} shadowColor="var(--color-pixel-ink)" className="h-4 w-auto sm:h-5" />
        <PixelText text="18" shadow={1} shadowColor="var(--color-pixel-ink)" className="h-4 w-auto sm:h-5" />
      </div>
    </div>
  )
}

/** The cover on a pixel-framed screen, with the bonus block to hit and the power-up burst. */
function Stage({
  image,
  imageSmall,
  coins,
  target,
  poweredUp,
  bumps,
  onHit,
}: {
  image: string
  imageSmall?: string
  coins: number
  target: number
  poweredUp: boolean
  bumps: number
  onHit: () => void
}) {
  const remaining = Math.max(0, target - coins)
  return (
    <div className="relative order-1 mx-auto w-full max-w-[20rem] pt-28 sm:max-w-[24rem] lg:order-2 lg:max-w-[27rem]">
      {/* Bonus block */}
      <div className="absolute top-0 left-[8%] flex flex-col items-center">
        <div className="relative">
          {/* Each hit pops a fresh coin (keyed so the animation restarts). */}
          {bumps > 0 ? (
            <PixelCoin
              key={bumps}
              className="pointer-events-none absolute top-0 left-1/2 h-9 w-7 -translate-x-1/2 animate-[coin-pop_0.7s_ease-out_forwards] motion-reduce:hidden"
            />
          ) : null}
          <button
            type="button"
            onClick={onHit}
            aria-label="Hit the bonus block to collect a coin"
            className="group relative block focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-pixel-ink"
          >
            <span
              key={bumps}
              className={cn(
                'block h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem]',
                bumps > 0 && 'motion-safe:animate-[block-bump_0.25s_ease-out]',
              )}
            >
              <BonusBlock />
            </span>
          </button>
        </div>
        <p className="mt-3 font-mono text-[0.7rem] font-bold tracking-widest text-pixel-ink uppercase" aria-live="polite">
          {poweredUp ? 'Power up!' : coins === 0 ? 'Hit me!' : `${remaining} more`}
        </p>
      </div>

      {/* Floating coins around the screen. */}
      <PixelCoin className="absolute top-[18%] right-[6%] h-7 w-5 motion-safe:animate-[coin-spin_1.1s_steps(4)_infinite]" />
      <PixelCoin className="absolute top-[24%] right-[20%] h-7 w-5 motion-safe:animate-[coin-spin_1.1s_steps(4)_-0.4s_infinite]" />

      {/* Power-up burst */}
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute -inset-6 top-[22%] transition-[opacity,transform] duration-500',
          poweredUp ? 'scale-100 opacity-100' : 'scale-90 opacity-0',
        )}
      >
        <div className="h-full w-full [background:repeating-conic-gradient(from_0deg_at_50%_50%,rgba(255,210,63,0.75)_0deg_10deg,transparent_10deg_22deg)] [mask-image:radial-gradient(closest-side,black_55%,transparent_100%)] motion-safe:animate-[pixel-burst-turn_14s_linear_infinite]" />
      </div>

      {/* Screen */}
      <div className={cn('relative bg-white p-3 sm:p-4 motion-safe:animate-[pixel-float_3s_steps(6)_infinite]', PIXEL_BOX)}>
        <div className="relative aspect-square overflow-hidden bg-[#e7decd] shadow-[0_0_0_3px_var(--color-pixel-ink)]">
          <img
            src={assetUrl(image)}
            srcSet={imageSmall ? `${assetUrl(imageSmall)} 720w, ${assetUrl(image)} 1200w` : undefined}
            sizes="(min-width: 1024px) 25rem, (min-width: 640px) 22rem, 18rem"
            alt="Coin Collector putter cover for L.A.B. OZ.1i and Mezz.1"
            width={1200}
            height={1200}
            fetchPriority="low"
            decoding="async"
            className="h-full w-full object-cover"
          />
          {/* Scanlines */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-25 [background-image:repeating-linear-gradient(180deg,rgba(20,20,31,0.18)_0_1px,transparent_1px_3px)]" />
          {poweredUp ? (
            <div aria-hidden="true" className="absolute inset-x-0 top-[8%] flex justify-center">
              <PixelText
                text="POWER UP!"
                shadow={1}
                shadowColor="var(--color-pixel-ink)"
                className="h-8 w-auto text-pixel-gold motion-safe:animate-[pixel-float_0.8s_steps(3)_infinite] sm:h-10"
              />
            </div>
          ) : null}
        </div>
        <div className="mt-3 flex items-center justify-between font-mono text-[0.7rem] font-bold tracking-widest uppercase">
          <span>Player 1</span>
          <span className="text-pixel-brick">Coin Collector</span>
        </div>
      </div>
    </div>
  )
}

/** Pixel sky bands, clouds, stepped hills, bushes, a flag and a brick ground with grass on top. */
function PixelWorld() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {/* Dithered sky: hard colour steps, lighter toward the horizon. */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#46b6ea_0%,#46b6ea_30%,#5ec6f2_30%,#5ec6f2_58%,#78d2f5_58%,#78d2f5_78%,#94ddf7_78%)]" />

      <svg viewBox="0 0 360 225" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full" shapeRendering="crispEdges">
        {/* Clouds */}
        <PixelCloud x={20} y={26} />
        <PixelCloud x={150} y={14} scale={0.8} />
        <PixelCloud x={268} y={40} />
        {/* Hills */}
        <path d="M0 196 h10 v-8 h8 v-8 h8 v-6 h16 v6 h8 v8 h8 v8 h10 Z" fill="#3fa56a" />
        <path d="M250 196 h8 v-6 h8 v-8 h8 v-8 h20 v8 h8 v8 h8 v6 h8 Z" fill="#3fa56a" />
        <path d="M300 196 h6 v-5 h6 v-6 h14 v6 h6 v5 h6 Z" fill="#4dbb79" />
        {/* Bushes */}
        <path d="M80 196 h4 v-4 h4 v-3 h10 v3 h4 v-3 h10 v3 h4 v4 h4 Z" fill="var(--color-pixel-grass)" />
        <path d="M190 196 h4 v-4 h4 v-3 h12 v3 h4 v4 h4 Z" fill="var(--color-pixel-grass)" />
        {/* Flag */}
        <rect x="338" y="150" width="2" height="46" fill="#f3f3f3" />
        <path d="M340 150 h14 v3 h-3 v3 h-3 v3 h-8 Z" fill="#e5383b" />
        <rect x="336" y="194" width="6" height="2" fill="var(--color-pixel-ink)" />
      </svg>

      {/* Ground: grass strip on bricks. */}
      <div className="absolute inset-x-0 bottom-0 h-16 sm:h-20">
        <div className="h-2 bg-pixel-grass shadow-[inset_0_-2px_0_rgba(20,20,31,0.35)]" />
        <div className="h-full bg-pixel-brick [background-image:linear-gradient(0deg,rgba(20,20,31,0.55)_2px,transparent_2px),linear-gradient(90deg,rgba(20,20,31,0.55)_2px,transparent_2px),linear-gradient(90deg,rgba(20,20,31,0.55)_2px,transparent_2px)] [background-position:0_0,0_0,16px_14px] [background-size:32px_14px,32px_28px,32px_28px]" />
      </div>
    </div>
  )
}

function PixelCloud({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path d="M8 8 h4 v-4 h4 v-4 h12 v4 h4 v4 h8 v4 h4 v8 h-48 v-8 h4 v-4 h8 Z" fill="#ffffff" />
      <path d="M0 20 h48 v2 h-48 Z" fill="#cfeefb" />
    </g>
  )
}

/** The bonus block: a riveted gold block with a coin on its face. */
function BonusBlock() {
  return (
    <svg viewBox="0 0 16 16" className="h-full w-full" shapeRendering="crispEdges">
      <rect x="0" y="0" width="16" height="16" fill="var(--color-pixel-ink)" />
      <rect x="1" y="1" width="14" height="14" fill="#f0a63a" />
      <rect x="1" y="1" width="14" height="1" fill="#ffd27a" />
      <rect x="1" y="1" width="1" height="14" fill="#ffd27a" />
      <rect x="1" y="14" width="14" height="1" fill="#b3631d" />
      <rect x="14" y="1" width="1" height="14" fill="#b3631d" />
      {/* Rivets */}
      {[[2, 2], [13, 2], [2, 13], [13, 13]].map(([rx, ry]) => (
        <rect key={`${rx}-${ry}`} x={rx} y={ry} width="1" height="1" fill="#7a3f12" />
      ))}
      {/* Coin face */}
      <path d="M6 4 h4 v1 h1 v6 h-1 v1 h-4 v-1 h-1 v-6 h1 Z" fill="var(--color-pixel-gold)" />
      <rect x="7" y="6" width="2" height="4" fill="#d99a13" />
    </svg>
  )
}

function PixelCoin({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 8 10" className={className} shapeRendering="crispEdges" aria-hidden="true">
      <path d="M2 0 h4 v1 h1 v1 h1 v6 h-1 v1 h-1 v1 h-4 v-1 h-1 v-1 h-1 v-6 h1 v-1 h1 Z" fill="var(--color-pixel-ink)" />
      <path d="M2 1 h4 v1 h1 v6 h-1 v1 h-4 v-1 h-1 v-6 h1 Z" fill="var(--color-pixel-gold)" />
      <rect x="3" y="3" width="2" height="4" fill="#d99a13" />
      <rect x="2" y="2" width="1" height="2" fill="#fff3b0" />
    </svg>
  )
}

/** Split a title into two lines at the space nearest the middle. */
function splitInTwo(title: string): string[] {
  const words = title.trim().split(/\s+/)
  if (words.length < 2) return [title]
  let best = 1
  let bestDiff = Infinity
  for (let i = 1; i < words.length; i += 1) {
    const diff = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length)
    if (diff < bestDiff) {
      bestDiff = diff
      best = i
    }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')]
}
