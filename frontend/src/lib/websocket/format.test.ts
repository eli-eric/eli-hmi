import { describe, expect, it } from 'vitest'

import { DEFAULT_VALUE_FORMAT } from '@/lib/utils/pv-helpers'
import { resolveFormat } from './format'

describe('resolveFormat', () => {
  it('prefers the config over everything', () => {
    expect(
      resolveFormat({
        config: { format: 'fixed', toFixed: 1 },
        fallback: { format: 'raw' },
      }),
    ).toEqual({ format: 'fixed', toFixed: 1 })
  })

  it("uses a component's fallback when the config is silent", () => {
    expect(resolveFormat({ fallback: { format: 'raw' } })).toEqual({
      format: 'raw',
    })
  })

  it('falls back to three decimal places when nobody says anything', () => {
    // The historical hardcoded behaviour of FloatValue, kept so adding this
    // config layer changed no existing readout.
    expect(resolveFormat({})).toBe(DEFAULT_VALUE_FORMAT)
    expect(DEFAULT_VALUE_FORMAT).toEqual({ format: 'fixed', toFixed: 3 })
  })
})
