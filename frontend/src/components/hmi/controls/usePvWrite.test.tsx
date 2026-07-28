import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { usePvWrite } from './usePvWrite'

const ORIGINAL_FETCH = globalThis.fetch

function mockOk() {
  globalThis.fetch = vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
  ) as unknown as typeof fetch
}

function mockFail(status = 500) {
  globalThis.fetch = vi.fn<typeof fetch>(
    async () => new Response('nope', { status }),
  ) as unknown as typeof fetch
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('usePvWrite', () => {
  it('starts idle with null error', () => {
    const { result } = renderHook(() => usePvWrite())
    expect(result.current.state).toBe('idle')
    expect(result.current.error).toBeNull()
  })

  it('transitions idle → pending → success', async () => {
    mockOk()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { result } = renderHook(() => usePvWrite({ flashMs: 0 }))

    await act(async () => {
      await result.current.write('BI_NL2_SHUTTER', 1)
    })

    expect(result.current.state).toBe('success')
    expect(result.current.error).toBeNull()
  })

  it('transitions to error and exposes the message on HTTP failure', async () => {
    mockFail(500)
    const { result } = renderHook(() => usePvWrite())

    await act(async () => {
      await result.current.write('BI_NL2_SHUTTER', 1)
    })

    expect(result.current.state).toBe('error')
    expect(result.current.error).toMatch(/500/)
  })

  it('returns to idle after flashMs (default 1000ms)', async () => {
    mockOk()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { result } = renderHook(() => usePvWrite())

    await act(async () => {
      await result.current.write('BI_NL2_SHUTTER', 1)
    })
    expect(result.current.state).toBe('success')

    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current.state).toBe('idle')
  })

  it('stays in success when flashMs=0', async () => {
    mockOk()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { result } = renderHook(() => usePvWrite({ flashMs: 0 }))

    await act(async () => {
      await result.current.write('BI_NL2_SHUTTER', 1)
    })
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    expect(result.current.state).toBe('success')
  })

  // CogToggle integration: close-on-success is covered by ActionButton tests
  // (which render the full DOM and click the cog open). Cannot be tested at
  // hook level because CogToggle only mounts its children when open=true.

  it('does not leak timers after unmount during pending', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let resolveFetch: (r: Response) => void = () => {}
    globalThis.fetch = vi.fn<typeof fetch>(
      () => new Promise<Response>((r) => (resolveFetch = r)),
    ) as unknown as typeof fetch

    const { result, unmount } = renderHook(() => usePvWrite())
    act(() => {
      void result.current.write('BI_NL2_SHUTTER', 1)
    })
    expect(result.current.state).toBe('pending')

    unmount()
    // Resolving after unmount must not throw "setState on unmounted".
    await act(async () => {
      resolveFetch(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      vi.advanceTimersByTime(2000)
    })
    // No assertion — test passes if no warning thrown.
  })
})
