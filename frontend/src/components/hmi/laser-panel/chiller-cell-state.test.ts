import { describe, it, expect } from 'vitest'
import { deriveCellState, CHILLER_LIMITS } from './chiller-cell-state'
import type { Message } from '@/app/providers/types'

const NOW = 1_700_000_000_000 // fixed ms
const fresh = NOW / 1000

function msg(over: Partial<Message<number | null>> = {}): Message<number | null> {
  return {
    type: 'pv',
    name: 'AI_NL2_CHILLER_11_FLOW',
    value: 50,
    severity: 0,
    units: null,
    timestamp: fresh,
    ok: true,
    error: null,
    ...over,
  }
}

const base = { isConnected: true, nowMs: NOW, limits: CHILLER_LIMITS.flow }

describe('deriveCellState (CSI-783)', () => {
  it('OK: finite, in-range, fresh, severity 0', () => {
    const v = deriveCellState({ ...base, msg: msg() })
    expect(v.kind).toBe('ok')
    expect(v.text).toBe('50.000')
    expect(v.actionEnabled).toBe(true)
  })

  it('device_off blocks actions regardless of value', () => {
    const v = deriveCellState({ ...base, msg: msg(), deviceOff: true })
    expect(v.kind).toBe('device_off')
    expect(v.actionEnabled).toBe(false)
    expect(v.actionBlockedReason).toMatch(/device is off/i)
  })

  it('disconnected overrides a present value', () => {
    const v = deriveCellState({ ...base, isConnected: false, msg: msg() })
    expect(v.kind).toBe('disconnected')
    expect(v.text).toBe('<>')
  })

  it('unknown when no message yet', () => {
    const v = deriveCellState({ ...base, msg: undefined })
    expect(v.kind).toBe('unknown')
  })

  it('pv_error when ok=false (surfaces error text)', () => {
    const v = deriveCellState({ ...base, msg: msg({ ok: false, error: 'CA disconnected' }) })
    expect(v.kind).toBe('pv_error')
    expect(v.title).toMatch(/CA disconnected/)
  })

  it('pv_error on INVALID severity (3) even if ok', () => {
    expect(deriveCellState({ ...base, msg: msg({ severity: 3 }) }).kind).toBe('pv_error')
  })

  it('no_value when value is null', () => {
    expect(deriveCellState({ ...base, msg: msg({ value: null }) }).kind).toBe('no_value')
  })

  it('invalid_type when value is not a number', () => {
    const v = deriveCellState({
      ...base,
      // simulate a contract violation (string in a numeric PV)
      msg: msg({ value: 'oops' as unknown as number }),
    })
    expect(v.kind).toBe('invalid_type')
    expect(v.text).toBe('TYPE')
  })

  it('non_finite for NaN', () => {
    expect(deriveCellState({ ...base, msg: msg({ value: NaN }) }).kind).toBe('non_finite')
  })

  it('non_finite for Infinity', () => {
    const v = deriveCellState({ ...base, msg: msg({ value: Infinity }) })
    expect(v.kind).toBe('non_finite')
    expect(v.text).toBe('FAULT')
  })

  it('stale when the reading is too old', () => {
    const old = msg({ timestamp: fresh - 999 })
    const v = deriveCellState({ ...base, msg: old, staleSec: 10 })
    expect(v.kind).toBe('stale')
    expect(v.text).toBe('50.000') // still shows last value, dimmed
  })

  it('out_of_range below min and above max', () => {
    expect(
      deriveCellState({ ...base, msg: msg({ value: -1 }), limits: { min: 0, max: 100 } }).kind,
    ).toBe('out_of_range')
    expect(
      deriveCellState({ ...base, msg: msg({ value: 999 }), limits: { min: 0, max: 100 } }).kind,
    ).toBe('out_of_range')
  })

  it('alarm_major (sev 2) and alarm_minor (sev 1)', () => {
    expect(deriveCellState({ ...base, msg: msg({ severity: 2 }) }).kind).toBe('alarm_major')
    const minor = deriveCellState({ ...base, msg: msg({ severity: 1 }) })
    expect(minor.kind).toBe('alarm_minor')
    expect(minor.actionEnabled).toBe(true) // minor still actionable
  })

  it('disconnected takes priority over a stale/old message', () => {
    const v = deriveCellState({
      ...base,
      isConnected: false,
      msg: msg({ timestamp: fresh - 999 }),
    })
    expect(v.kind).toBe('disconnected')
  })
})
