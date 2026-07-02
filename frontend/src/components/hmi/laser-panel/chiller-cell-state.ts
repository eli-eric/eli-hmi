import type { Message } from '@/app/providers/types'

/**
 * CSI-783 — explicit component states for a Flow / Temp / Water cell.
 *
 * Pure logic (no React) so every branch is unit-testable. Given the latest
 * `Message`, the transport state and per-quantity limits, it resolves exactly
 * one {@link CellKind}. The renderer ({@link ChillerCell}) maps the result to
 * text + tone + tooltip.
 *
 * NOTE on data sources: `value`, `ok`, `severity`, `error`, `timestamp` come
 * from the gateway message; `isConnected` from the socket. `deviceOff` would
 * come from a per-device "enabled/on" PV — that PV does NOT exist in the mock
 * yet (open question for controls), so DEVICE_OFF / ACTION_BLOCKED are wired
 * and tested but only trigger when such a signal is supplied.
 */
export type CellKind =
  | 'ok'
  | 'disconnected'
  | 'unknown'
  | 'no_value'
  | 'stale'
  | 'pv_error'
  | 'invalid_type'
  | 'non_finite'
  | 'alarm_minor'
  | 'alarm_major'
  | 'out_of_range'
  | 'device_off'

export type CellTone = 'ok' | 'warn' | 'error' | 'unknown' | 'muted'

export interface CellView {
  kind: CellKind
  /** Text shown in the cell. */
  text: string
  tone: CellTone
  /** Tooltip explaining the state (hover/title). */
  title: string
  /** Whether an action that depends on this cell being healthy may run. */
  actionEnabled: boolean
  /** When actionEnabled is false, a human reason ("device off", …). */
  actionBlockedReason?: string
}

export interface Limits {
  min: number
  max: number
}

/** EPICS alarm severities. */
const SEV_MINOR = 1
const SEV_MAJOR = 2
const SEV_INVALID = 3

const EMPTY = '<>'

export interface DeriveArgs {
  msg: Message<number | null> | undefined
  isConnected: boolean
  /** Now in ms (defaults to Date.now()). */
  nowMs?: number
  /** Max age before a reading is considered stale, in seconds. */
  staleSec?: number
  /** Physical limits for this quantity (out-of-range detection). */
  limits?: Limits
  /** From a per-device enable PV (not in the mock); true → device is off. */
  deviceOff?: boolean
  precision?: number
}

const fmt = (v: number, p: number) => v.toFixed(p)

/**
 * Resolve the single cell state. Order matters: hardest/most-specific failures
 * win first, so e.g. a disconnected socket never shows a stale number as if live.
 */
export function deriveCellState({
  msg,
  isConnected,
  nowMs = Date.now(),
  staleSec = 10,
  limits,
  deviceOff = false,
  precision = 3,
}: DeriveArgs): CellView {
  // 1. Device intentionally off → dependent actions blocked.
  if (deviceOff) {
    return {
      kind: 'device_off',
      text: 'OFF',
      tone: 'muted',
      title: 'Device is off — readings unavailable and dependent actions are disabled.',
      actionEnabled: false,
      actionBlockedReason: 'required device is off',
    }
  }

  // 2. Transport down → everything is unknown/stale at the panel level.
  if (!isConnected) {
    return {
      kind: 'disconnected',
      text: EMPTY,
      tone: 'unknown',
      title: 'Backend disconnected — value unknown.',
      actionEnabled: false,
      actionBlockedReason: 'backend disconnected',
    }
  }

  // 3. No message received yet (cold start).
  if (!msg) {
    return {
      kind: 'unknown',
      text: EMPTY,
      tone: 'unknown',
      title: 'Awaiting first update from PV.',
      actionEnabled: false,
      actionBlockedReason: 'no data yet',
    }
  }

  // 4. Gateway flagged the PV bad, or EPICS INVALID severity.
  if (!msg.ok || msg.severity === SEV_INVALID) {
    return {
      kind: 'pv_error',
      text: 'ERR',
      tone: 'error',
      title: msg.error
        ? `PV error: ${msg.error}`
        : 'PV reported an error / INVALID severity.',
      actionEnabled: false,
      actionBlockedReason: 'PV in error',
    }
  }

  // 5. Record up but no value.
  if (msg.value === null) {
    return {
      kind: 'no_value',
      text: EMPTY,
      tone: 'unknown',
      title: 'PV connected but no value present.',
      actionEnabled: false,
      actionBlockedReason: 'no value',
    }
  }

  // 6. Value present but not a number (contract violation, incl. long strings).
  if (typeof msg.value !== 'number') {
    return {
      kind: 'invalid_type',
      text: 'TYPE',
      tone: 'error',
      title: `Expected a number, got ${typeof msg.value}.`,
      actionEnabled: false,
      actionBlockedReason: 'invalid value type',
    }
  }

  // 7. Non-finite number (NaN / ±Infinity) — never render the raw token.
  if (!Number.isFinite(msg.value)) {
    return {
      kind: 'non_finite',
      text: 'FAULT',
      tone: 'error',
      title: 'Non-finite reading (NaN/Infinity).',
      actionEnabled: false,
      actionBlockedReason: 'faulty value',
    }
  }

  const value = msg.value
  const shown = fmt(value, precision)

  // 8. Stale: a real-looking value that hasn't refreshed. timestamp is seconds.
  if (Number.isFinite(msg.timestamp) && msg.timestamp > 0) {
    const ageSec = nowMs / 1000 - msg.timestamp
    if (ageSec > staleSec) {
      return {
        kind: 'stale',
        text: shown,
        tone: 'muted',
        title: `Stale: last update ${Math.round(ageSec)}s ago.`,
        actionEnabled: false,
        actionBlockedReason: 'reading is stale',
      }
    }
  }

  // 9. Out of physical range.
  if (limits && (value < limits.min || value > limits.max)) {
    return {
      kind: 'out_of_range',
      text: shown,
      tone: 'error',
      title: `Out of range (${limits.min}–${limits.max}).`,
      actionEnabled: false,
      actionBlockedReason: 'reading out of range',
    }
  }

  // 10. EPICS alarm on an otherwise valid number.
  if (msg.severity === SEV_MAJOR) {
    return {
      kind: 'alarm_major',
      text: shown,
      tone: 'error',
      title: 'MAJOR alarm severity.',
      actionEnabled: false,
      actionBlockedReason: 'major alarm',
    }
  }
  if (msg.severity === SEV_MINOR) {
    return {
      kind: 'alarm_minor',
      text: shown,
      tone: 'warn',
      title: 'MINOR alarm severity.',
      actionEnabled: true,
    }
  }

  // 11. Healthy.
  return {
    kind: 'ok',
    text: shown,
    tone: 'ok',
    title: 'OK.',
    actionEnabled: true,
  }
}

/**
 * Placeholder physical limits per quantity (PoC). Real min/max must come from
 * controls — see CSI-783 doc open questions. Wide bounds so the mock's ~50
 * autosim values read OK while still exercising the out-of-range branch in tests.
 */
export const CHILLER_LIMITS: Record<'flow' | 'temp' | 'level', Limits> = {
  flow: { min: 0, max: 200 },
  temp: { min: -50, max: 150 },
  level: { min: 0, max: 100 },
}
