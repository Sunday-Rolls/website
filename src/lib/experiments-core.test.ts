import { describe, expect, it } from 'vitest'
import {
  assign,
  assignAll,
  fnv1a32,
  formatExpString,
  parseForce,
  unit,
  type ExperimentConfig,
} from './experiments-core'

// docs/EXPERIMENTS_CONTRACT.md test vectors: serve-spa and the server must produce the same.
const VECTORS: Array<[string, number, number]> = [
  ['', 2166136261, 0.504343],
  ['a', 3826002220, 0.890811],
  ['aa-check:abc123', 4002643900, 0.931938],
  ['seed1:vid-0001', 638855030, 0.148745],
  ['seed1:traffic:vid-0001', 486515007, 0.113276],
  ['héllo', 1252296000, 0.291573],
]

function exp(overrides: Partial<ExperimentConfig> = {}): ExperimentConfig {
  return {
    key: 'home-banner',
    seed: 'seed1',
    status: 'running',
    trafficPct: 100,
    variants: [
      { key: 'control', weight: 50 },
      { key: 'b', weight: 50 },
    ],
    winner: null,
    ...overrides,
  }
}

describe('fnv1a32 / unit', () => {
  it.each(VECTORS)('%j hashes to the contract value', (input, hash, u) => {
    expect(fnv1a32(input)).toBe(hash)
    expect(Number(unit(input).toFixed(6))).toBe(u)
  })
})

describe('assign', () => {
  // unit('seed1:traffic:vid-0001') ≈ 0.1133, unit('seed1:vid-0001') ≈ 0.1487
  it('picks the arm from cumulative weights', () => {
    expect(assign(exp(), 'vid-0001')).toBe('control')
    expect(
      assign(exp({ variants: [{ key: 'control', weight: 10 }, { key: 'b', weight: 90 }] }), 'vid-0001'),
    ).toBe('b')
  })
  it('leaves visitors outside the traffic split unassigned', () => {
    expect(assign(exp({ trafficPct: 11 }), 'vid-0001')).toBeNull()
    expect(assign(exp({ trafficPct: 12 }), 'vid-0001')).toBe('control')
  })
  it('gives everyone the winner once promoted', () => {
    expect(assign(exp({ status: 'promoted', winner: 'b', trafficPct: 0 }), 'vid-0001')).toBe('b')
  })
  it('falls back to the last arm when weights fall short of 100', () => {
    expect(
      assign(exp({ variants: [{ key: 'control', weight: 5 }, { key: 'b', weight: 5 }] }), 'vid-0001'),
    ).toBe('b')
  })
  it('assignAll tracks running experiments only', () => {
    expect(
      assignAll([exp(), exp({ key: 'old-test', status: 'promoted', winner: 'b' })], 'vid-0001'),
    ).toEqual({ assignments: { 'home-banner': 'control', 'old-test': 'b' }, tracked: ['home-banner'] })
  })
})

describe('parseForce / formatExpString', () => {
  it('parses key:arm pairs and drops invalid ones', () => {
    expect(parseForce('home-banner:b, other:control,BAD:x,nocolon,a:b:c')).toEqual({
      'home-banner': 'b',
      other: 'control',
    })
    expect(parseForce(null)).toEqual({})
  })
  it('sorts keys', () => {
    expect(formatExpString({ other: 'control', 'home-banner': 'b' })).toBe('home-banner:b|other:control')
    expect(formatExpString({})).toBe('')
  })
})
