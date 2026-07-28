import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getToken = vi.hoisted(() =>
  vi.fn<() => Promise<unknown>>().mockResolvedValue(null),
)

vi.mock('next-auth/jwt', () => ({
  getToken,
}))

import { NextRequest } from 'next/server'

import { middleware } from './middleware'

function makeRequest(pathname: string): NextRequest {
  const url = `http://localhost:8082${pathname}`
  return new NextRequest(new Request(url))
}

describe('middleware', () => {
  beforeEach(() => {
    vi.stubEnv('ZONE_CODE', 'test')
    getToken.mockResolvedValue(null)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('redirects unauthenticated users to /auth/signin', async () => {
    const res = await middleware(makeRequest('/p3-controls'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/auth/signin')
  })

  it('lets unauthenticated users hit /auth/signin', async () => {
    const res = await middleware(makeRequest('/auth/signin'))
    expect(res.status).toBe(200)
  })

  it('redirects authenticated users on disallowed routes to /no-access', async () => {
    getToken.mockResolvedValue({ sub: 'user-1' })
    const res = await middleware(makeRequest('/some-other-route'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/no-access')
  })

  it('lets authenticated users hit allowed routes', async () => {
    getToken.mockResolvedValue({ sub: 'user-1' })
    const res = await middleware(makeRequest('/l4-opcpa'))
    expect(res.status).toBe(200)
  })

  it('redirects authenticated users away from /auth/signin to default route', async () => {
    getToken.mockResolvedValue({ sub: 'user-1' })
    const res = await middleware(makeRequest('/auth/signin'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/l4-opcpa')
  })

  it('lets api routes bypass auth', async () => {
    const res = await middleware(makeRequest('/api/anything'))
    expect(res.status).toBe(200)
  })

  it('caches font files', async () => {
    const res = await middleware(makeRequest('/fonts/foo.ttf'))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toContain('max-age=31536000')
  })
})
