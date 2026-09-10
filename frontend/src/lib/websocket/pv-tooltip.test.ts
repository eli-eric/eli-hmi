import { describe, it, expect } from 'vitest'
import { describePv, describeStatus, describeSeverity } from './pv-tooltip'
import type { Message } from '@/app/providers/types'

function msg(over: Partial<Message<number>> = {}): Message<number> {
  return {
    type: 'pv',
    name: 'AI_NL2_REGEN_TEMP',
    value: 24.81,
    severity: 0,
    status: null,
    units: null,
    timestamp: 0,
    ok: true,
    error: null,
    ...over,
  }
}

const lines = (m: Message<number>, opts?: Parameters<typeof describePv>[1]) =>
  (describePv(m, opts) ?? '').split('\n')

describe('describePv', () => {
  it('names the PV even when there is nothing wrong', () => {
    expect(describePv(msg())).toBe('AI_NL2_REGEN_TEMP')
  })

  it('names the PV before any message has arrived', () => {
    expect(describePv(undefined, { pvName: 'AI_NL2_REGEN_TEMP' })).toBe(
      'AI_NL2_REGEN_TEMP',
    )
    // Nothing identifies the readout at all — better no tooltip than an empty one.
    expect(describePv(undefined)).toBeUndefined()
  })

  it('adds severity and status once the record is alarmed', () => {
    expect(lines(msg({ severity: 1, status: 4 }))).toEqual([
      'AI_NL2_REGEN_TEMP',
      'Severity: MINOR',
      'Status: HIGH',
    ])
    expect(lines(msg({ severity: 2, status: 3 }))).toEqual([
      'AI_NL2_REGEN_TEMP',
      'Severity: MAJOR',
      'Status: HIHI',
    ])
  })

  it('omits the status line when the gateway sent none', () => {
    expect(lines(msg({ severity: 2 }))).toEqual([
      'AI_NL2_REGEN_TEMP',
      'Severity: MAJOR',
    ])
  })

  it('adds the last good value for INVALID, since the reading is replaced', () => {
    const at = 1_700_000_000
    const text = describePv(
      msg({
        severity: 3,
        status: 17,
        value: null,
        lastValid: { value: 24.81, timestamp: at },
      }),
    )
    expect(text).toContain('Severity: INVALID')
    expect(text).toContain('Status: UDF')
    expect(text).toContain('Last good value: 24.81')
    expect(text).toContain(new Date(at * 1000).toLocaleTimeString())
  })

  it('drops severity and status for a disconnected PV, keeping the last value', () => {
    const text = describePv(
      msg({
        ok: false,
        severity: 3,
        status: 10,
        value: null,
        error: 'CA disconnected',
        lastValid: { value: 24.81, timestamp: 0 },
      }),
    )
    // A dead channel's alarm fields describe the past, not the present.
    expect(text).not.toContain('Severity')
    expect(text).not.toContain('Status')
    expect(text).not.toContain('TIMEOUT')
    expect(text).toContain('PV disconnected')
    expect(text).toContain('CA disconnected')
    expect(text).toContain('Last known value: 24.81')
  })

  it('reports the backend link as the cause when the socket is down', () => {
    const text = describePv(msg({ severity: 2, status: 3 }), {
      isConnected: false,
    })
    expect(text).toContain('AI_NL2_REGEN_TEMP')
    expect(text).toContain('Backend disconnected')
    // The alarm belonged to a live link; with the link gone it is stale.
    expect(text).not.toContain('Severity')
  })
})

describe('describeStatus', () => {
  it('names the EPICS codes', () => {
    expect(describeStatus(0)).toBe('NO_ALARM')
    expect(describeStatus(5)).toBe('LOLO')
    expect(describeStatus(21)).toBe('WRITE_ACCESS')
  })

  it('passes a phrase through, so the gateway can send words later', () => {
    expect(describeStatus('above high-high limit')).toBe(
      'above high-high limit',
    )
  })

  it('does not invent a name for an unknown code, or for none at all', () => {
    expect(describeStatus(99)).toBe('status 99')
    expect(describeStatus(null)).toBeNull()
  })
})

describe('describeSeverity', () => {
  it('names the four EPICS severities', () => {
    expect([0, 1, 2, 3].map(describeSeverity)).toEqual([
      'NO_ALARM',
      'MINOR',
      'MAJOR',
      'INVALID',
    ])
  })
})
