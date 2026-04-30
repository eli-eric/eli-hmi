import { act, render, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const useSession = vi.hoisted(() => vi.fn())

vi.mock('next-auth/react', () => ({
  useSession,
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('@/types/constants', () => ({
  WS_URL: 'ws://localhost:8080/ws/pvs',
  API_URL: 'http://localhost:8080/pv',
}))

import {
  cleanupMockWebSocket,
  mockWebSocketServer,
} from '@/test/ws-mock-server'

import { useWebSocket } from './use-websocket'

describe('useWebSocket', () => {
  let server: ReturnType<typeof mockWebSocketServer>

  beforeEach(() => {
    useSession.mockReturnValue({
      data: { accessToken: 'token-abc' },
      status: 'authenticated',
    })
    server = mockWebSocketServer('ws://localhost:8080/ws/pvs?auth=token-abc')
  })

  afterEach(async () => {
    await server.close()
    cleanupMockWebSocket()
  })

  it('does nothing when session has no accessToken', async () => {
    useSession.mockReturnValue({ data: null, status: 'unauthenticated' })
    const { result } = renderHook(() => useWebSocket())
    expect(result.current.isConnected).toBe(false)
  })

  it('connects when accessToken is present', async () => {
    const { result } = renderHook(() => useWebSocket())
    await waitFor(() => expect(result.current.isConnected).toBe(true))
  })

  it('subscribe sends a wire message when connected', async () => {
    const { result } = renderHook(() => useWebSocket())
    await waitFor(() => expect(result.current.isConnected).toBe(true))

    act(() => {
      result.current.subscribe('AI_X', () => undefined)
    })

    await server.waitForSubscribe('AI_X')
    expect(server.getSent()).toContainEqual({
      type: 'subscribe',
      pvs: { AI_X: true },
    })
  })

  it('delivers server-pushed Messages to subscribers', async () => {
    const { result } = renderHook(() => useWebSocket())
    await waitFor(() => expect(result.current.isConnected).toBe(true))

    const received: unknown[] = []
    act(() => {
      result.current.subscribe<number>('AI_X', (msg) => received.push(msg))
    })
    await server.waitForSubscribe('AI_X')

    act(() => {
      server.pushPV('AI_X', 7.7)
    })
    await waitFor(() => expect(received).toHaveLength(1))
    expect((received[0] as { value: number }).value).toBe(7.7)
  })

  it('unmount cleans up without unhandled setState warnings', async () => {
    const warnings: string[] = []
    const origWarn = console.error
    console.error = (msg: unknown, ...rest: unknown[]) => {
      warnings.push(String(msg))
      origWarn(msg as string, ...rest)
    }

    try {
      const { unmount } = render(<TestComponent />)
      await waitFor(() => server.connected)
      unmount()
      // Allow any pending intervals/timers a chance to fire post-unmount.
      await new Promise((r) => setTimeout(r, 50))
      expect(
        warnings.filter((w) => /unmounted/i.test(w)),
      ).toEqual([])
    } finally {
      console.error = origWarn
    }
  })
})

function TestComponent() {
  useWebSocket()
  return null
}
