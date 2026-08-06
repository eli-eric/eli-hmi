import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getToken = vi.hoisted(() =>
  vi.fn<() => Promise<unknown>>().mockResolvedValue(null),
)

vi.mock('next-auth/jwt', () => ({
  getToken,
}))

import { join } from 'node:path'

import { NextRequest } from 'next/server'

import { proxy } from './proxy'
import { clearZoneCache } from './lib/settings/zone-config-loader'

const FIXTURE_DIR = join(
  __dirname,
  'lib',
  'settings',
  '__fixtures__',
  'config-dir',
)

function makeRequest(pathname: string): NextRequest {
  const url = `http://localhost:8082${pathname}`
  return new NextRequest(new Request(url))
}

describe('proxy', () => {
  beforeEach(() => {
    vi.stubEnv('CONFIG_DIR', FIXTURE_DIR)
    vi.stubEnv('ZONE_CODE', 'test')
    clearZoneCache()
    getToken.mockResolvedValue(null)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    clearZoneCache()
  })

  it('redirects unauthenticated users to /auth/signin', async () => {
    const res = await proxy(makeRequest('/p3-controls'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/auth/signin')
  })

  it('lets unauthenticated users hit /auth/signin', async () => {
    const res = await proxy(makeRequest('/auth/signin'))
    expect(res.status).toBe(200)
  })

  it('redirects authenticated users on disallowed routes to /no-access', async () => {
    getToken.mockResolvedValue({ sub: 'user-1' })
    const res = await proxy(makeRequest('/some-other-route'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/no-access')
  })

  it('lets authenticated users hit allowed routes', async () => {
    getToken.mockResolvedValue({ sub: 'user-1' })
    const res = await proxy(makeRequest('/l4-opcpa'))
    expect(res.status).toBe(200)
  })

  it('lets authenticated users reach the root page redirect', async () => {
    getToken.mockResolvedValue({ sub: 'user-1' })
    const res = await proxy(makeRequest('/'))
    expect(res.status).toBe(200)
  })

  it('redirects authenticated users away from /auth/signin to default route', async () => {
    getToken.mockResolvedValue({ sub: 'user-1' })
    const res = await proxy(makeRequest('/auth/signin'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/l4-opcpa')
  })

  it('lets api routes bypass auth', async () => {
    const res = await proxy(makeRequest('/api/anything'))
    expect(res.status).toBe(200)
  })

  it('caches font files', async () => {
    const res = await proxy(makeRequest('/fonts/foo.ttf'))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toContain('max-age=31536000')
  })
})
