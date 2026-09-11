import { describe, expect, it } from 'vitest'

import { getFormattedValue } from './pv-helpers'
import { valueFormatSchema } from './value-format-schema'

const parse = (input: unknown) => valueFormatSchema.parse(input)

describe('valueFormatSchema', () => {
  it('expands a bare number into fixed-decimal options', () => {
    expect(parse(1)).toEqual({ format: 'fixed', toFixed: 1 })
  })

  it('accepts 0 decimal places', () => {
    expect(parse(0)).toEqual({ format: 'fixed', toFixed: 0 })
  })

  it('passes a full object through unchanged', () => {
    expect(parse({ format: 'exponential', toExponential: 2 })).toEqual({
      format: 'exponential',
      toExponential: 2,
    })
  })

  it('round-trips into getFormattedValue', () => {
    // The point of sharing one definition: what validates is what formats.
    expect(getFormattedValue({ value: 23.456, options: parse(1) })).toBe('23.5')
    expect(
      getFormattedValue({
        value: 23.456,
        options: parse({ format: 'precision', toPrecision: 2 }),
      }),
    ).toBe('23')
  })

  it('rejects a negative or fractional shorthand', () => {
    expect(() => parse(-1)).toThrow()
    expect(() => parse(1.5)).toThrow()
  })

  it('rejects an unknown format name', () => {
    expect(() => parse({ format: 'rounded' })).toThrow()
  })

  it('rejects unknown keys (typo protection)', () => {
    expect(() => parse({ format: 'fixed', decimals: 2 })).toThrow()
  })

  it('rejects a string', () => {
    expect(() => parse('2')).toThrow()
  })
})
