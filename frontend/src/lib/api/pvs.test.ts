import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { pvWrite, listWaveforms } from './pvs'
import { mockUnauthenticated, resetSessionMock } from '@/test/setup'
import { getRuntimeConfig } from '@/lib/runtime-config/client'

vi.mock('@/lib/runtime-config/client', () => ({
  getRuntimeConfig: vi.fn(),
}))

const ORIGINAL_FETCH = globalThis.fetch

function mockFetch(impl: (...args: Parameters<typeof fetch>) => Response | Promise<Response>) {
  const spy = vi.fn(impl)
  globalThis.fetch = spy as unknown as typeof fetch
  return spy
}

beforeEach(() => {
  vi.mocked(getRuntimeConfig).mockReturnValue({
    apiUrl: 'localhost:8080',
    apiScheme: null,
    zoneCode: null,
  })
})

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  vi.unstubAllEnvs()
})

describe('pvWrite', () => {
  it('POSTs to /pv/:name with JSON body {value: ...}', async () => {
    const spy = mockFetch(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )

    await pvWrite('BI_NL2_SHUTTER', 1)

    expect(spy).toHaveBeenCalledOnce()
    const [url, init] = spy.mock.calls[0]
    expect(url).toBe('http://localhost:8080/pv/BI_NL2_SHUTTER')
    expect(init).toMatchObject({ method: 'POST' })
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      value: 1,
    })
  })

  it('URL-encodes PV names with special characters', async () => {
    const spy = mockFetch(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    await pvWrite('SI_NL2/LOADED:WAVEFORM', 'std-100ps')
    expect(spy.mock.calls[0][0]).toBe(
      'http://localhost:8080/pv/SI_NL2%2FLOADED%3AWAVEFORM',
    )
  })

  it('writes a string value', async () => {
    const spy = mockFetch(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    await pvWrite('CMD_NL2_LOAD_WAVEFORM', 'std-100ps')
    const init = spy.mock.calls[0][1] as RequestInit
    expect(JSON.parse(init.body as string)).toEqual({ value: 'std-100ps' })
  })

  it('rejects when the response reports {ok:false} with the server error', async () => {
    mockFetch(
      async () =>
        new Response(JSON.stringify({ ok: false, error: 'EPICS gone' }), {
          status: 200,
        }),
    )
    await expect(pvWrite('BI_NL2_SHUTTER', 1)).rejects.toThrow(/EPICS gone/)
  })

  it('rejects when HTTP status is not 2xx', async () => {
    mockFetch(async () => new Response('nope', { status: 500 }))
    await expect(pvWrite('BI_NL2_SHUTTER', 1)).rejects.toThrow(/500/)
  })

  it('propagates network errors (e.g. fetch rejection)', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('NetworkError when fetching')
    }) as unknown as typeof fetch
    await expect(pvWrite('BI_NL2_SHUTTER', 1)).rejects.toThrow(/NetworkError/)
  })

  it('sends Authorization header when a session is available', async () => {
    const spy = mockFetch(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    await pvWrite('BI_NL2_SHUTTER', 1)
    const init = spy.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toMatch(
      /^Bearer /,
    )
  })

  it('sends a placeholder Authorization when there is no session', async () => {
    await mockUnauthenticated()
    const spy = mockFetch(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    await pvWrite('BI_NL2_SHUTTER', 1)
    const init = spy.mock.calls[0][1] as RequestInit
    // Placeholder rather than empty so the mock backend (which requires
    // any non-empty auth) still accepts the request.
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer dev-no-session',
    )
    await resetSessionMock()
  })
})

describe('listWaveforms', () => {
  it('GETs /waveforms and returns the catalog array', async () => {
    mockFetch(
      async () =>
        new Response(JSON.stringify(['std-100ps', 'narrow-50ps']), {
          status: 200,
        }),
    )
    await expect(listWaveforms()).resolves.toEqual([
      'std-100ps',
      'narrow-50ps',
    ])
  })
})

describe('apiBase fallback', () => {
  it('falls back to localhost:8080 in dev when runtime config has not resolved yet', async () => {
    vi.mocked(getRuntimeConfig).mockReturnValue(null)
    const spy = mockFetch(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    await pvWrite('BI_NL2_SHUTTER', 1)
    expect(spy.mock.calls[0][0]).toBe('http://localhost:8080/pv/BI_NL2_SHUTTER')
  })
})
