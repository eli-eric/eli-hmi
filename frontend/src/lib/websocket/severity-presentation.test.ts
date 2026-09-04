import { describe, it, expect } from 'vitest'
import {
  severityPresentation,
  aggregateSeverityPresentation,
  INVALID_TEXT,
  DISCONNECTED_TEXT,
  UNKNOWN_TEXT,
} from './severity-presentation'
import type { Message } from '@/app/providers/types'

function msg(over: Partial<Message<number>> = {}): Message<number> {
  return {
    type: 'pv',
    name: 'AI_X',
    value: 1,
    severity: 0,
    units: null,
    timestamp: 0,
    ok: true,
    error: null,
    ...over,
  }
}

describe('severityPresentation', () => {
  it('leaves severity 0 completely unstyled', () => {
    expect(severityPresentation(msg())).toEqual({})
  })

  it('replaces the text and paints for no data yet', () => {
    expect(severityPresentation(undefined)).toEqual({
      tone: 'unknown',
      text: UNKNOWN_TEXT,
    })
  })

  it('keeps the real value for MINOR / MAJOR alarms, tinting only', () => {
    expect(severityPresentation(msg({ severity: 1 }))).toEqual({
      tone: 'warning',
    })
    expect(severityPresentation(msg({ severity: 2 }))).toEqual({
      tone: 'error',
    })
  })

  it('reads PV INV for INVALID severity and PV DSC for a disconnected PV', () => {
    expect(severityPresentation(msg({ severity: 3 }))).toMatchObject({
      tone: 'invalid',
      text: 'PV INV',
    })
    expect(severityPresentation(msg({ ok: false }))).toMatchObject({
      tone: 'invalid',
      text: 'PV DSC',
    })
  })

  it('calls a message that is both disconnected and INVALID a disconnect', () => {
    expect(severityPresentation(msg({ ok: false, severity: 3 })).text).toBe(
      DISCONNECTED_TEXT,
    )
  })

  it('names the PV and its last trustworthy value in the invalid tooltip', () => {
    const { title } = severityPresentation(
      msg({
        name: 'AI_NL2_CHILLER_11_FLOW',
        value: null,
        ok: false,
        error: 'CA disconnected',
        lastValid: { value: 4.2, timestamp: 1_700_000_000 },
      }),
    )
    expect(title).toContain('AI_NL2_CHILLER_11_FLOW')
    expect(title).toContain('Last known value: 4.2')
    expect(title).toContain('CA disconnected')
  })

  it('falls back to "unknown" when nothing was ever read successfully', () => {
    const { title } = severityPresentation(msg({ value: null, ok: false }))
    expect(title).toContain('Last known value: unknown')
  })
})

describe('aggregateSeverityPresentation', () => {
  it('is unstyled when every child is severity 0', () => {
    expect(aggregateSeverityPresentation([msg(), msg()])).toEqual({})
  })

  it('takes the worst child severity', () => {
    expect(
      aggregateSeverityPresentation([msg(), msg({ severity: 1 })]),
    ).toEqual({ tone: 'warning' })
    expect(
      aggregateSeverityPresentation([msg({ severity: 1 }), msg({ ok: false })]),
    ).toMatchObject({ tone: 'invalid', text: DISCONNECTED_TEXT })
  })

  it('only claims PV DSC when every offender is disconnected', () => {
    expect(
      aggregateSeverityPresentation([msg({ ok: false }), msg({ ok: false })])
        .text,
    ).toBe(DISCONNECTED_TEXT)
    // Mixed causes fall back to the generic invalid label.
    expect(
      aggregateSeverityPresentation([msg({ ok: false }), msg({ severity: 3 })])
        .text,
    ).toBe(INVALID_TEXT)
  })

  it('lists every offending PV in the aggregate tooltip', () => {
    const { title } = aggregateSeverityPresentation([
      msg({ name: 'BI_NL2_MSS_1' }),
      msg({ name: 'BI_NL2_MSS_2', ok: false }),
      msg({ name: 'BI_NL2_MSS_3', severity: 3 }),
    ])
    expect(title).toContain('2 of 3 readings unusable')
    expect(title).toContain('BI_NL2_MSS_2')
    expect(title).toContain('BI_NL2_MSS_3')
    expect(title).not.toContain('BI_NL2_MSS_1')
  })

  it('is unknown only while no child has reported', () => {
    expect(aggregateSeverityPresentation([undefined, undefined])).toEqual({
      tone: 'unknown',
      text: UNKNOWN_TEXT,
    })
    expect(aggregateSeverityPresentation([undefined, msg()])).toEqual({})
  })
})
