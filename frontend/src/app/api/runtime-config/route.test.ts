import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearZoneCache } from '@/lib/settings/zone-config-loader'
import { GET } from './route'

const FIXTURE_DIR = join(
  process.cwd(),
  'src/lib/settings/__fixtures__/config-dir',
)

describe('GET /api/runtime-config', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.stubEnv('CONFIG_DIR', FIXTURE_DIR)
    clearZoneCache()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    clearZoneCache()
  })

  it('returns nav items + home route resolved from the zone file', async () => {
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
