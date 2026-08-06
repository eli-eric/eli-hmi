import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearZoneCache } from './lib/settings/zone-config-loader'
import { register } from './instrumentation'

const FIXTURE_DIR = join(
  process.cwd(),
  'src/lib/settings/__fixtures__/config-dir',
)

describe('instrumentation register (startup fail-fast)', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>
  let warnSpy: ReturnType<typeof vi.spyOn>
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    vi.stubEnv('CONFIG_DIR', FIXTURE_DIR)
    vi.stubEnv('ZONE_CODE', 'test')
    clearZoneCache()
    exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never)
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    clearZoneCache()
  })

  it('does nothing outside the nodejs runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge')
    await register()
    expect(logSpy).not.toHaveBeenCalled()
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it('logs a zone summary for a valid config', async () => {
    await register()
    expect(exitSpy).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('zone "test" OK'),
    )
  })

  it('production: exits 1 when the config dir is missing', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('CONFIG_DIR', '/nonexistent-config-dir')
    await register()
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('config directory not found'),
    )
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('production: exits 1 when ZONE_CODE is unset', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ZONE_CODE', '')
    await register()
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('ZONE_CODE is not set'),
    )
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('production: exits 1 for a broken zone file', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ZONE_CODE', 'broken')
    await register()
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('broken.yaml is invalid'),
    )
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('production: validates referenced module config even when its route is disabled', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ZONE_CODE', 'invalid-module')
    await register()
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringMatching(
        /modules\.p3 \(modules\/p3\/invalid\.yaml\).*invalid/,
      ),
    )
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('production: exits 1 for an unknown zone', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ZONE_CODE', 'nope')
    await register()
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('zone config not found'),
    )
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('development: warns but does not exit on a broken config', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('ZONE_CODE', 'broken')
    await register()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('continuing (development mode)'),
    )
    expect(exitSpy).not.toHaveBeenCalled()
  })
})
