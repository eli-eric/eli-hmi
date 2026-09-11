import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConfigRoot, GLOBAL_BROKEN } from '@/test/config-root'
import {
  clearConfigCache,
  setConfigRootForTests,
} from './lib/settings/config-loader'
import { register } from './instrumentation'

describe('instrumentation register (startup config check)', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    vi.stubEnv('ZONE_CODE', 'test')
    clearConfigCache()
    exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never)
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    setConfigRootForTests(undefined)
    clearConfigCache()
  })

  it('does nothing outside the nodejs runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge')
    await register()
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('logs a zone summary for the real shipped config', async () => {
    // Deliberately not a fixture: this is the check that the config actually
    // in the image comes up, so it fails if someone breaks config/global.yaml.
    await register()
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('zone "test" OK'))
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('reports a missing global config without exiting', async () => {
    const root = new ConfigRoot()
    setConfigRootForTests(root.path)
    await register()
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('global config not found'),
    )
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it('reports an unset ZONE_CODE and names the valid zones', async () => {
    vi.stubEnv('ZONE_CODE', '')
    await register()
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringMatching(/ZONE_CODE is not set[\s\S]*Valid zones: test/),
    )
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it('reports an unknown ZONE_CODE and names the valid zones', async () => {
    vi.stubEnv('ZONE_CODE', 'tset')
    await register()
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringMatching(/ZONE_CODE="tset"[\s\S]*valid zones: test/),
    )
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it('reports a broken global config without exiting', async () => {
    const root = new ConfigRoot().global(GLOBAL_BROKEN)
    setConfigRootForTests(root.path)
    await register()
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('global.yaml is invalid'),
    )
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it('never exits, in production either', async () => {
    // Crash-looping a container on a config typo is invisible to operators
    // ("the port is dead"); /no-access plus this log is not. The build-time
    // validator is what refuses to ship broken config in the first place.
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ZONE_CODE', 'nope')
    await register()
    expect(errorSpy).toHaveBeenCalled()
    expect(exitSpy).not.toHaveBeenCalled()
  })
})
