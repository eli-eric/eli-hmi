import WS from 'vitest-websocket-mock'

const DEFAULT_URL = 'ws://localhost:8080/ws/pvs'

export interface PushPVOptions {
  severity?: number
  /** EPICS alarm status; the gateway sends it in `metadata` at detail 'time'. */
  status?: number | string | null
  units?: string | null
  ok?: boolean
  error?: string | null
  timestamp?: number
}

export interface MockWebSocketServer {
  url: string
  pushPV: (name: string, value: unknown, opts?: PushPVOptions) => void
  /**
   * Pushes the batched-protocol shape the real gateway speaks (`event`, PV
   * name in `pv`, alarm fields nested under `metadata`) rather than the legacy
   * flat one, so the normalisation of that shape is covered too.
   */
  pushEvent: (name: string, value: unknown, opts?: PushPVOptions) => void
  setStatus: (status: 'open' | 'closed' | 'error') => Promise<void>
  getSent: () => unknown[]
  waitForSubscribe: (name: string) => Promise<void>
  close: () => Promise<void>
}

type LegacySubscribeMessage = {
  type: 'subscribe'
  pvs: Record<string, boolean>
}
type BatchedSubscribeMessage = { type: 'subscribe'; pvs: string[] }

function isSubscribeFor(msg: unknown, name: string): boolean {
  if (msg === null || typeof msg !== 'object') return false
  const m = msg as Partial<LegacySubscribeMessage & BatchedSubscribeMessage>
  if (m.type !== 'subscribe' || !m.pvs) return false
  if (Array.isArray(m.pvs)) return m.pvs.includes(name)
  return name in m.pvs
}

export function mockWebSocketServer(
  url: string = DEFAULT_URL,
): MockWebSocketServer {
  const server = new WS(url, { jsonProtocol: true })

  return {
    url,
    pushPV(name, value, opts = {}) {
      server.send({
        type: 'pv',
        name,
        value,
        severity: opts.severity ?? 0,
        status: opts.status ?? null,
        units: opts.units ?? null,
        timestamp: opts.timestamp ?? Date.now(),
        ok: opts.ok ?? true,
        error: opts.error ?? null,
      })
    },
    pushEvent(name, value, opts = {}) {
      server.send({
        type: 'event',
        operation: 'monitor',
        pv: name,
        detail: 'time',
        value,
        ok: opts.ok ?? true,
        error: opts.error ?? null,
        metadata: {
          severity: opts.severity ?? 0,
          status: opts.status ?? null,
          units: opts.units ?? null,
          timestamp: opts.timestamp ?? Date.now() / 1000,
        },
      })
    },
    async setStatus(status) {
      if (status === 'closed') server.close()
      else if (status === 'error') server.error()
      else if (status === 'open') await server.connected
    },
    getSent() {
      return server.messages.slice()
    },
    async waitForSubscribe(name) {
      while (!server.messages.some((m) => isSubscribeFor(m, name))) {
        await server.nextMessage
      }
    },
    async close() {
      server.close()
    },
  }
}

export function cleanupMockWebSocket(): void {
  try {
    WS.clean()
  } catch {
    // WS.clean iterates and closes every registered server; if a test has
    // already explicitly closed one, the iterator throws on a second close.
    // This helper is best-effort cleanup, so swallow.
  }
}
