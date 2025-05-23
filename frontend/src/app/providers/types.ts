export interface ConnectionState {
  status: 'connecting' | 'connected' | 'disconnected'
  reconnectAttempts: number
  lastAttempt: Date | null
  nextAttemptInSeconds: number | null
  countdown: number | null
}

export interface WebSocketContextValue {
  subscribe: <T>(
    channel: string,
    callback: (data: Message<T>) => void,
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
  units: string | null
  timestamp: number
  ok: boolean
  error: string | null
}
