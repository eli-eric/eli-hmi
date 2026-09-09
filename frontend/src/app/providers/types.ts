export interface ConnectionState {
  status: 'connecting' | 'connected' | 'disconnected'
  reconnectAttempts: number
  lastAttempt: Date | null
  nextAttemptInSeconds: number | null
  countdown: number | null
}

/** Per-subscription read options (see the gateway's `subscribe` message). */
export interface SubscribeOptions {
  /**
   * Gateway datatype alias. Unset = the PV's native type. Enum (mbbi) records
   * arrive as their numeric index natively; 'enum_string' asks Channel Access
   * for the state name instead.
   */
  datatype?: 'enum_string' | 'string' | 'integer' | 'float' | 'native'
}

export interface WebSocketContextValue {
  subscribe: <T>(
    channel: string,
    callback: (data: Message<T>) => void,
    opts?: SubscribeOptions,
  ) => () => void
  send: (message: unknown) => boolean
  reconnect: () => void
  isConnected: boolean
  connectionState: ConnectionState
}

export interface Message<T = unknown> {
  type: string
  name: string
  value: T | null
  severity: number
  /**
   * EPICS alarm status — *why* the record is alarmed, where `severity` says
   * how badly (`epicsAlarm.h`: 3 = HIHI, 5 = LOLO, 10 = TIMEOUT, 17 = UDF …).
   * Sent by the gateway in `metadata` at `detail: 'time'`.
   *
   * Typed to accept a string as well as the numeric code so the backend can
   * later send an operator-facing phrase instead, with no frontend change —
   * see `describeStatus` in `pv-tooltip.ts`.
   */
  status: number | string | null
  units: string | null
  timestamp: number
  ok: boolean
  error: string | null
  /**
   * Client-side only (attached by `useWebSocketData`, never sent by the
   * gateway): the last value seen while this PV was still trustworthy. Set
   * only on messages whose severity is INVALID / whose `ok` is false, where
   * `value` itself is typically `null` — it lets the UI say what the reading
   * was before it went bad. See `severity-presentation.ts`.
   */
  lastValid?: { value: T | null; timestamp: number }
}
