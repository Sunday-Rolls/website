import { afterEach, describe, expect, it, vi } from 'vitest'
import { submitContactForm } from './contact-api'
import { __resetExperimentsForTests, bootExperiments, recordExposure } from './experiments'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  __resetExperimentsForTests()
  delete window.__SR_EXP__
  localStorage.clear()
})

describe('submitContactForm', () => {
  it('sends visitorId and the exposure string with the message', async () => {
    vi.stubEnv('VITE_CONTACT_API_URL', 'https://api.test')
    Object.defineProperty(navigator, 'sendBeacon', { value: vi.fn(() => true), configurable: true })
    window.__SR_EXP__ = { vid: 'AbCdEfGhIjKlMnOpQrStUv', assignments: { 'home-banner': 'b' }, tracked: ['home-banner'], bot: false }
    bootExperiments({ search: '' })
    recordExposure('home-banner')
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true })))
    vi.stubGlobal('fetch', fetchMock)

    await submitContactForm({ name: 'A', email: 'a@b.co', subject: 'Hi', message: 'Hello' })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.test/contact')
    expect(JSON.parse(String(init.body))).toEqual({
      name: 'A',
      email: 'a@b.co',
      subject: 'Hi',
      message: 'Hello',
      visitorId: 'AbCdEfGhIjKlMnOpQrStUv',
      experiments: 'home-banner:b',
    })
  })
})
