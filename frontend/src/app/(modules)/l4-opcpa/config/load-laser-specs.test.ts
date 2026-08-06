import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `server-only` throws outside a React Server environment — neutralize it for
// unit tests; the import stays effective in the real app.
vi.mock('server-only', () => ({}))

import { clearZoneCache } from '@/lib/settings/zone-config-loader'
import { clearLaserSpecsCache, loadLaserSpecs } from './load-laser-specs'

const FIXTURE_DIR = join(
  process.cwd(),
  'src/lib/settings/__fixtures__/config-dir',
)

describe('loadLaserSpecs', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.stubEnv('CONFIG_DIR', FIXTURE_DIR)
    vi.stubEnv('ZONE_CODE', 'test')
    clearZoneCache()
    clearLaserSpecsCache()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    clearZoneCache()
    clearLaserSpecsCache()
  })

  it('resolves the zone-referenced laser config into specs', () => {
    const specs = loadLaserSpecs()
    expect(specs).toHaveLength(1)
    expect(specs[0].laser).toBe('TST')
    expect(specs[0].pvs.connection).toBe('BI_TST_CONN')
  })

  it('throws when ZONE_CODE is not set', () => {
    vi.stubEnv('ZONE_CODE', '')
    expect(() => loadLaserSpecs()).toThrow(/ZONE_CODE is not set/)
  })

  it('throws when the zone has no l4-opcpa module reference', () => {
    vi.stubEnv('ZONE_CODE', 'empty')
    expect(() => loadLaserSpecs()).toThrow(
      /no modules\.l4-opcpa config reference/,
    )
  })

  it('propagates zone loader errors for an unknown zone', () => {
    vi.stubEnv('ZONE_CODE', 'nope')
    expect(() => loadLaserSpecs()).toThrow(/zone config not found/)
  })

  it('production: caches per zone (same reference back) and clearLaserSpecsCache resets', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const first = loadLaserSpecs()
    expect(loadLaserSpecs()).toBe(first)
    clearLaserSpecsCache()
    const fresh = loadLaserSpecs()
    expect(fresh).not.toBe(first)
    expect(fresh).toEqual(first)
  })

  it('development: does not cache (config edits reload per request)', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(loadLaserSpecs()).not.toBe(loadLaserSpecs())
  })

  it('returns frozen specs (cached and shared by reference)', () => {
    const specs = loadLaserSpecs()
    expect(Object.isFrozen(specs)).toBe(true)
    expect(Object.isFrozen(specs[0])).toBe(true)
    expect(() => {
      ;(specs as unknown as unknown[]).push('hacked')
    }).toThrow()
  })
})
