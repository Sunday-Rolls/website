import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Variant, useExperimentContent, useVariant } from '@/components/experiments'
import { __resetExperimentsForTests, bootExperiments, experimentString } from '@/lib/experiments'
import { applyExperimentOverrides, deepMerge } from '@/lib/experiment-content'

const VID = 'AbCdEfGhIjKlMnOpQrStUv'

function boot(assignments: Record<string, string>, tracked = Object.keys(assignments)) {
  window.__SR_EXP__ = { vid: VID, assignments, tracked, bot: false }
  bootExperiments({ search: '' })
}

function Arm({ k }: { k: string }) {
  return <span>arm:{useVariant(k)}</span>
}

beforeEach(() => {
  __resetExperimentsForTests()
  localStorage.clear()
  sessionStorage.clear()
  delete window.__SR_EXP__
  window.dataLayer = []
  Object.defineProperty(navigator, 'sendBeacon', { value: vi.fn(() => true), configurable: true })
})

describe('useVariant / <Variant>', () => {
  it('renders the assigned arm and records the exposure', () => {
    boot({ 'home-banner': 'b' })
    render(
      <>
        <Arm k="home-banner" />
        <Variant experiment="home-banner" is="b" fallback={<p>current hero</p>}>
          <p>splat banner</p>
        </Variant>
      </>,
    )
    expect(screen.getByText('arm:b')).toBeInTheDocument()
    expect(screen.getByText('splat banner')).toBeInTheDocument()
    expect(screen.queryByText('current hero')).toBeNull()
    expect(experimentString()).toBe('home-banner:b')
  })

  it('renders control (fallback) for unknown experiments and accepts an array of arms', () => {
    boot({ 'cart-upsell': 'c' })
    render(
      <>
        <Variant experiment="home-banner" is="b" fallback={<p>current hero</p>}>
          <p>splat banner</p>
        </Variant>
        <Variant experiment="cart-upsell" is={['b', 'c']}>
          <p>upsell</p>
        </Variant>
      </>,
    )
    expect(screen.getByText('current hero')).toBeInTheDocument()
    expect(screen.getByText('upsell')).toBeInTheDocument()
    // home-banner isn't assigned: no exposure; cart-upsell is.
    expect(experimentString()).toBe('cart-upsell:c')
  })

  it('counts the control arm as exposed too', () => {
    boot({ 'home-banner': 'control' })
    render(
      <Variant experiment="home-banner" is="b">
        <p>splat banner</p>
      </Variant>,
    )
    expect(screen.queryByText('splat banner')).toBeNull()
    expect(experimentString()).toBe('home-banner:control')
  })

  it('re-renders when the fallback config arrives', async () => {
    let resolve!: (r: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((r) => (resolve = r))))
    vi.stubEnv('VITE_CONTACT_API_URL', 'https://api.test')
    bootExperiments({ search: '' })
    render(<Arm k="home-banner" />)
    expect(screen.getByText('arm:control')).toBeInTheDocument()
    await act(async () => {
      resolve(
        new Response(
          JSON.stringify({
            ok: true,
            experiments: [
              {
                key: 'home-banner',
                seed: 's',
                status: 'running',
                trafficPct: 100,
                variants: [
                  { key: 'control', weight: 0 },
                  { key: 'b', weight: 100 },
                ],
                winner: null,
              },
            ],
          }),
        ),
      )
    })
    await screen.findByText('arm:b')
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })
})

describe('content overrides', () => {
  const page = {
    hero: { headline: 'Rolled on Sunday', subheadline: 'Headcovers', cta: { href: '/shop' } },
    values: { items: [{ label: 'a' }, { label: 'b' }] },
    experiments: {
      'home-banner': { b: { hero: { headline: 'Built for the walk' }, values: { items: [{ label: 'z' }] } } },
    },
  }

  it('deep-merges objects and replaces arrays', () => {
    expect(deepMerge({ a: { x: 1, y: 2 }, l: [1, 2] }, { a: { y: 3 }, l: [9] })).toEqual({
      a: { x: 1, y: 3 },
      l: [9],
    })
    const merged = applyExperimentOverrides(page, () => 'b')
    expect(merged).toEqual({
      hero: { headline: 'Built for the walk', subheadline: 'Headcovers', cta: { href: '/shop' } },
      values: { items: [{ label: 'z' }] },
    })
    expect(applyExperimentOverrides(page, () => 'control')).not.toHaveProperty('experiments')
    expect(page.hero.headline).toBe('Rolled on Sunday')
  })

  function Hero() {
    const content = useExperimentContent(page)
    return <h1>{content.hero.headline}</h1>
  }

  it('renders the arm override and counts as exposure', () => {
    boot({ 'home-banner': 'b' })
    render(<Hero />)
    expect(screen.getByRole('heading')).toHaveTextContent('Built for the walk')
    expect(experimentString()).toBe('home-banner:b')
  })

  it('renders base content for control and still records the exposure', () => {
    boot({ 'home-banner': 'control' })
    render(<Hero />)
    expect(screen.getByRole('heading')).toHaveTextContent('Rolled on Sunday')
    expect(experimentString()).toBe('home-banner:control')
  })
})
