import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const useSession = vi.hoisted(() => vi.fn())

vi.mock('next-auth/react', () => ({
  useSession,
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('@/lib/runtime-config/context', () => ({
  useRuntimeConfig: () => ({
    status: 'ready',
    apiUrl: 'http://localhost:8080/pv',
    wsUrl: 'ws://localhost:8080/ws/pvs',
  }),
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
    expect(server.getSent()).toContainEqual(
      expect.objectContaining({
        type: 'subscribe',
        subscription_id: expect.any(String),
        pvs: ['AI_X'],
      }),
    )
  })

  it('batches PVs subscribed in the same tick into one wire message', async () => {
    const { result } = renderHook(() => useWebSocket())
    await waitFor(() => expect(result.current.isConnected).toBe(true))

    act(() => {
      result.current.subscribe('AI_X', () => undefined)
      result.current.subscribe('AI_Y', () => undefined)
      result.current.subscribe('AI_Z', () => undefined)
    })

    await server.waitForSubscribe('AI_Z')
    const subscribeMessages = server
      .getSent()
      .filter(
        (m): m is { type: string; pvs: string[] } =>
          typeof m === 'object' &&
          m !== null &&
          (m as { type?: unknown }).type === 'subscribe',
      )
    expect(subscribeMessages).toHaveLength(1)
    expect(subscribeMessages[0].pvs).toEqual(
      expect.arrayContaining(['AI_X', 'AI_Y', 'AI_Z']),
    )
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

  it('clears the countdown interval on mid-countdown unmount', async () => {
    // The pre-fix bug: countdownIntervalRef was only cleared from inside its
    // own callback or the reconnect timeout. If the component unmounted during
    // the countdown, the interval kept firing and called setState on a dead
    // hook. React 18+ no longer warns on setState-after-unmount, so we
    // verify the fix structurally: spy on clearInterval and assert one of the
    // intervals registered between the connect and the unmount got cleared.
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

    const { result, unmount } = renderHook(() => useWebSocket())
    await waitFor(() => expect(result.current.isConnected).toBe(true))

    // Force a disconnect — this triggers scheduleReconnect, which starts the
    // 1-second countdown interval inside the hook.
    await act(async () => {
      await server.close()
    })
    await waitFor(() =>
      expect(result.current.connectionState.countdown).not.toBeNull(),
    )

    const intervalIdsBeforeUnmount = setIntervalSpy.mock.results.map(
      (r) => r.value,
    )
    unmount()

    expect(
      intervalIdsBeforeUnmount.some((id) =>
        clearIntervalSpy.mock.calls.some(([cleared]) => cleared === id),
      ),
    ).toBe(true)
  })

  // TODO: integration test for token-rotation reconnect.
  //
  // The reviewer asked for a test that locks the contract "rotating
  // useSession's accessToken closes the old socket and opens a new one with
  // the new URL". Two approaches were tried:
  //   1. Stand up two mockWebSocketServer instances at distinct ?auth=
  //      URLs — mock-socket dedupes Server registrations by path (ignoring
  //      query) so the second `new WS(url)` throws "already listening".
  //   2. vi.spyOn(globalThis, 'WebSocket') — the spy wrapper interferes
  //      with mock-socket's internal references and the connection never
  //      reaches readyState=OPEN, so `isConnected` never flips.
  //
  // The structural fix in connect() (closeSocket() before `new WebSocket`)
  // and the url useMemo deps cover the rotation logic, but the integration
  // assertion is a known gap. Worth revisiting with a different mock library
  // or a dedicated jsdom WebSocket polyfill.
})
