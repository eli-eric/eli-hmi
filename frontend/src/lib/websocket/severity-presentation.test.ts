import { describe, it, expect } from 'vitest'
import {
  severityPresentation,
  aggregateSeverityPresentation,
  unreadableValuePresentation,
  INVALID_TEXT,
  DISCONNECTED_TEXT,
  UNKNOWN_TEXT,
  TRANSPORT_DOWN_TITLE,
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

describe('widget emphasis', () => {
  it('applies only when the control system reports nothing', () => {
    expect(
      severityPresentation(msg(), { emphasis: 'positive-important' }),
    ).toEqual({ tone: 'positive-important' })
  })

  it('never survives an alarm — the alarm is the more important news', () => {
    expect(
      severityPresentation(msg({ severity: 1 }), {
        emphasis: 'positive-important',
      }).tone,
    ).toBe('warning')
    expect(
      severityPresentation(msg({ severity: 2 }), {
        emphasis: 'positive-important',
      }).tone,
    ).toBe('error')
    expect(
      severityPresentation(msg({ ok: false }), {
        emphasis: 'positive-important',
      }).tone,
    ).toBe('invalid')
  })

  it('applies to aggregates the same way', () => {
    expect(
      aggregateSeverityPresentation([msg(), msg()], {
        emphasis: 'positive-important',
      }).tone,
    ).toBe('positive-important')
    expect(
      aggregateSeverityPresentation([msg(), msg({ severity: 2 })], {
        emphasis: 'positive-important',
      }).tone,
    ).toBe('error')
  })
})

describe('transport loss', () => {
  it('greys every reading and says why, whatever its severity was', () => {
    for (const m of [msg(), msg({ severity: 1 }), msg({ severity: 3 })]) {
      const p = severityPresentation(m, { isConnected: false })
      expect(p.tone).toBe('unknown')
      expect(p.title).toBe(TRANSPORT_DOWN_TITLE)
      // No replacement text: the last value stays on screen, greyed, rather
      // than blanking the panel during a gateway restart.
      expect(p.text).toBeUndefined()
    }
  })

  it('falls back to the placeholder for a readout that never reported', () => {
    expect(severityPresentation(undefined, { isConnected: false })).toEqual({
      tone: 'unknown',
      text: UNKNOWN_TEXT,
      title: TRANSPORT_DOWN_TITLE,
    })
  })

  it('outranks severity on aggregates too', () => {
    const p = aggregateSeverityPresentation([msg(), msg({ severity: 2 })], {
      isConnected: false,
    })
    expect(p.tone).toBe('unknown')
    expect(p.title).toBe(TRANSPORT_DOWN_TITLE)
  })
})

describe('unreadableValuePresentation', () => {
  it('wears the invalid tone, since the reading is unusable either way', () => {
    expect(unreadableValuePresentation('AI_X: expected a number.')).toEqual({
      tone: 'invalid',
      text: INVALID_TEXT,
      title: 'AI_X: expected a number.',
    })
  })
})
