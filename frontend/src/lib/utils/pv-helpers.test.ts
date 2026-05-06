import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getFormattedValue, getPrefixedPV, PV_PREFIX_CONFIG } from './pv-helpers'

describe('PV_PREFIX_CONFIG declaration order', () => {
  it('CLOSED must precede CLOSE so substring matching does not pick CLOSE for *CLOSED PVs', () => {
    // getPrefixedPV iterates Object.keys(PV_PREFIX_CONFIG) and picks the first
    // key that is a substring of the input. CLOSE is a substring of CLOSED,
    // so reordering would silently break dev-mode subscriptions for any PV
    // whose name contains CLOSED. This test pins the invariant.
    const keys = Object.keys(PV_PREFIX_CONFIG)
    expect(keys.indexOf('CLOSED')).toBeGreaterThanOrEqual(0)
    expect(keys.indexOf('CLOSE')).toBeGreaterThanOrEqual(0)
    expect(keys.indexOf('CLOSED')).toBeLessThan(keys.indexOf('CLOSE'))
  })
})

describe('getPrefixedPV', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('prefixes CLOSED with BI_ in dev', () => {
    expect(getPrefixedPV('FOO:CLOSED')).toBe('BI_FOO:CLOSED')
  })

  it('prefixes CLOSE with BI_ in dev', () => {
    expect(getPrefixedPV('FOO:CLOSE')).toBe('BI_FOO:CLOSE')
  })

  it('prefixes PRESSURE with AI_MBAR_ in dev', () => {
    expect(getPrefixedPV('S1:PRESSURE')).toBe('AI_MBAR_S1:PRESSURE')
  })

  it('returns the original PV when no type matches', () => {
    expect(getPrefixedPV('UNKNOWN:THING')).toBe('UNKNOWN:THING')
  })

  it('returns the input unchanged outside dev', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(getPrefixedPV('S1:PRESSURE')).toBe('S1:PRESSURE')
  })
})

describe('getFormattedValue', () => {
  it('returns N/A for null', () => {
    expect(getFormattedValue({ value: null })).toBe('N/A')
  })

  it('formats with toExponential by default', () => {
    expect(getFormattedValue({ value: 0.001234 })).toBe('1.23e-3')
  })

  it('formats with precision', () => {
    expect(
      getFormattedValue({
        value: 1.23456,
        options: { format: 'precision', toPrecision: 4 },
      }),
    ).toBe('1.235')
  })

  it('formats raw', () => {
    expect(
      getFormattedValue({ value: 42, options: { format: 'raw' } }),
    ).toBe('42')
  })
})
