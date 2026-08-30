import { describe, it, expect } from 'vitest'
import { severityTone } from './severity'
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

describe('severityTone', () => {
  it('is unknown when there is no message yet', () => {
    expect(severityTone(undefined)).toBe('unknown')
    expect(severityTone(null)).toBe('unknown')
  })

  it('is invalid when ok is false, regardless of severity', () => {
    expect(severityTone(msg({ ok: false, severity: 0 }))).toBe('invalid')
  })

  it('is invalid on EPICS severity 3 even when ok is true', () => {
    expect(severityTone(msg({ severity: 3 }))).toBe('invalid')
  })

  it('is error on EPICS severity 2 (MAJOR)', () => {
    expect(severityTone(msg({ severity: 2 }))).toBe('error')
  })

  it('is warning on EPICS severity 1 (MINOR)', () => {
    expect(severityTone(msg({ severity: 1 }))).toBe('warning')
  })

  it('is none on EPICS severity 0 — no style change', () => {
    expect(severityTone(msg({ severity: 0 }))).toBe('none')
  })
})
