import WS from 'vitest-websocket-mock'

const DEFAULT_URL = 'ws://localhost:8080/ws/pvs'

export interface PushPVOptions {
  severity?: number
  units?: string | null
  ok?: boolean
  error?: string | null
  timestamp?: number
}

export interface MockWebSocketServer {
  url: string
  pushPV: (name: string, value: unknown, opts?: PushPVOptions) => void
  setStatus: (status: 'open' | 'closed' | 'error') => Promise<void>
  getSent: () => unknown[]
  waitForSubscribe: (name: string) => Promise<void>
  close: () => Promise<void>
}

type SubscribeMessage = { type: 'subscribe'; pvs: Record<string, boolean> }

function isSubscribeFor(msg: unknown, name: string): boolean {
  if (msg === null || typeof msg !== 'object') return false
  const m = msg as Partial<SubscribeMessage>
  return m.type === 'subscribe' && !!m.pvs && name in m.pvs
}

export function mockWebSocketServer(url: string = DEFAULT_URL): MockWebSocketServer {
  const server = new WS(url, { jsonProtocol: true })

  return {
    url,
    pushPV(name, value, opts = {}) {
      server.send({
        type: 'pv',
        name,
        value,
        severity: opts.severity ?? 0,
        units: opts.units ?? null,
        timestamp: opts.timestamp ?? Date.now(),
        ok: opts.ok ?? true,
        error: opts.error ?? null,
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
