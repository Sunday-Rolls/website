import { describe, expect, it } from 'vitest'
import { clientIdFromCookie, gaCartAttributes, readGaIds, sessionIdFromCookie } from './ga-ids'

describe('ga-ids', () => {
  it('parses the client ID from _ga', () => {
    expect(clientIdFromCookie('GA1.1.123456789.1700000000')).toBe('123456789.1700000000')
    expect(clientIdFromCookie('GA1.2.5.6')).toBe('5.6')
    expect(clientIdFromCookie('garbage')).toBe('')
    expect(clientIdFromCookie(undefined)).toBe('')
  })

  it('parses the session ID from both _ga_<id> formats', () => {
    expect(sessionIdFromCookie('GS2.1.s1731600000$o3$g1$t1731600100$j60$l0$h0')).toBe('1731600000')
    expect(sessionIdFromCookie('GS1.1.1731600000.3.1.1731600100.0.0.0')).toBe('1731600000')
    expect(sessionIdFromCookie('nope')).toBe('')
  })

  it('reads both IDs, preferring the session cookie for the measurement ID', () => {
    const cookie =
      'foo=bar; _ga=GA1.1.111.222; _ga_OTHER=GS2.1.s999$o1; _ga_YK0BB0TPM4=GS2.1.s1731600000$o3$g1'
    expect(readGaIds(cookie, 'G-YK0BB0TPM4')).toEqual({
      clientId: '111.222',
      sessionId: '1731600000',
    })
    expect(readGaIds(cookie).sessionId).toBe('999')
  })

  it('builds hidden cart attributes and skips missing values', () => {
    expect(gaCartAttributes('_ga=GA1.1.111.222; _ga_X=GS1.1.333.1.1', 'G-X')).toEqual([
      { key: '_sr_ga_cid', value: '111.222' },
      { key: '_sr_ga_sid', value: '333' },
    ])
    expect(gaCartAttributes('_ga=GA1.1.111.222', 'G-X')).toEqual([
      { key: '_sr_ga_cid', value: '111.222' },
    ])
    expect(gaCartAttributes('', 'G-X')).toEqual([])
  })
})
