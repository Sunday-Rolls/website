/**
 * A desk service bell "ding", synthesised with the Web Audio API: no audio file to download or
 * license. Bell-like (inharmonic) overtones strike together and ring out, each fading at its own
 * rate, with a tiny metallic tap at the start. Only ever called from a click, so browsers allow it.
 */

type AudioContextConstructor = typeof AudioContext

let context: AudioContext | null = null

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor: AudioContextConstructor | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext
  if (!Ctor) return null
  if (!context) context = new Ctor()
  return context
}

/** Overtones of a small desk bell: frequency ratio, loudness and how long it rings (seconds). */
const PARTIALS: Array<[ratio: number, gain: number, decay: number]> = [
  [1, 1, 1.6],
  [2.76, 0.5, 1.0],
  [5.4, 0.22, 0.55],
  [8.93, 0.1, 0.3],
]

const FUNDAMENTAL_HZ = 1750
const VOLUME = 0.18

export function playBell(): void {
  const ctx = getContext()
  if (!ctx) return
  // Some browsers start the context suspended until a user gesture; this call is inside one.
  if (ctx.state === 'suspended') void ctx.resume()

  const now = ctx.currentTime
  const master = ctx.createGain()
  master.gain.value = VOLUME
  master.connect(ctx.destination)

  for (const [ratio, gain, decay] of PARTIALS) {
    const osc = ctx.createOscillator()
    const amp = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = FUNDAMENTAL_HZ * ratio
    amp.gain.setValueAtTime(0.0001, now)
    amp.gain.exponentialRampToValueAtTime(gain, now + 0.004)
    amp.gain.exponentialRampToValueAtTime(0.0001, now + decay)
    osc.connect(amp)
    amp.connect(master)
    osc.start(now)
    osc.stop(now + decay + 0.05)
  }

  // The striker's tap: a very short burst of filtered noise.
  const length = Math.floor(ctx.sampleRate * 0.02)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length)
  const tap = ctx.createBufferSource()
  tap.buffer = buffer
  const filter = ctx.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.value = 3000
  const tapGain = ctx.createGain()
  tapGain.gain.value = 0.25
  tap.connect(filter)
  filter.connect(tapGain)
  tapGain.connect(master)
  tap.start(now)
}
