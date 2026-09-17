import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConfigRoot, GLOBAL_TWO_ZONES } from '@/test/config-root'

import {
  clearConfigCache,
  setConfigRootForTests,
} from '@/lib/settings/config-loader'
import { GET } from './route'

describe('GET /api/runtime-config', () => {
  let root: ConfigRoot

  beforeEach(() => {
    vi.unstubAllEnvs()
    root = new ConfigRoot().global(GLOBAL_TWO_ZONES)
    setConfigRootForTests(root.path)
    clearConfigCache()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    setConfigRootForTests(undefined)
    clearConfigCache()
    root.cleanup()
  })

  it('returns nav items + home route resolved from the global config', async () => {
    vi.stubEnv('ZONE_CODE', 'test')
    const body = await (await GET()).json()

    expect(body.zoneCode).toBe('test')
    expect(body.navigationItems).toEqual([
      { text: 'L4 OPCPA Controls', href: '/l4-opcpa' },
    ])
    expect(body.homeRoute).toBe('/l4-opcpa')
  })

  it('returns empty nav + /no-access home for an unconfigured zone', async () => {
    vi.stubEnv('ZONE_CODE', '')
    const body = await (await GET()).json()

    expect(body.navigationItems).toEqual([])
    expect(body.homeRoute).toBe('/no-access')
  })
})
