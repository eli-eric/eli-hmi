import { describe, it, expect } from 'vitest'
import { resolveUnits } from './units'

describe('resolveUnits', () => {
  it('is undefined when no source specifies a unit', () => {
    expect(resolveUnits({})).toBeUndefined()
    expect(resolveUnits({ metadata: null })).toBeUndefined()
  })

  it('prefers config over everything', () => {
    expect(
      resolveUnits({ config: 'K', metadata: '°C', fallback: 'a.u.' }),
    ).toBe('K')
  })

  it('prefers PV metadata over the component fallback', () => {
    expect(resolveUnits({ metadata: '°C', fallback: 'a.u.' })).toBe('°C')
  })

  it('falls back to the component default when the others are absent', () => {
    expect(resolveUnits({ metadata: null, fallback: 'a.u.' })).toBe('a.u.')
  })

  it('treats blank strings as unspecified, not as an empty unit', () => {
    expect(resolveUnits({ config: '  ', metadata: '°C' })).toBe('°C')
    expect(resolveUnits({ config: '', fallback: 'ns' })).toBe('ns')
  })

  it('trims a specified unit', () => {
    expect(resolveUnits({ config: ' °C ' })).toBe('°C')
  })
})
