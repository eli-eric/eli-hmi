import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `server-only` throws outside a React Server environment — neutralize it for
// unit tests; the import stays effective in the real app.
vi.mock('server-only', () => ({}))

import {
  clearConfigCache,
  ConfigError,
  setConfigRootForTests,
} from '@/lib/settings/config-loader'
import { moduleConfigPath } from '@/lib/settings/zone-schema'
import { clearLaserSpecsCache, loadLaserSpecs } from './load-laser-specs'

const LASERS = `
lasers:
  - id: TST
    pvs:
      connection: BI_TST_CONN
      fullPower: BI_TST_FULLP
      shutter: BI_TST_SHUTTER
      phdMean: AI_TST_PHD_MEAN
      regenState: BI_TST_REGEN_STATE
      regenTemp: AI_TST_REGEN_TEMP
      phd2Mean: AI_TST_PHD2_MEAN
      attenuator: AI_TST_ATT
      loadedWaveform: SI_TST_LOADED_WAVEFORM
    triggerDelay: [AI_TST_TRIG_DELAY_CH1]
    mss: []
    moduleErrors: []
    chillers: []
    flashlamps: []
    modbox: []
    delayPresets: [50]
    commands:
      START_LASER: START_LASER
`

const TEST_CONFIG = moduleConfigPath('l4-opcpa', 'test')

describe('loadLaserSpecs', () => {
  let root: string
  let specsPath: string

  beforeEach(() => {
    vi.unstubAllEnvs()
    // The path comes from the module registry, so the fixture root mirrors it.
    root = mkdtempSync(join(tmpdir(), 'laser-specs-'))
    specsPath = join(root, TEST_CONFIG)
    mkdirSync(dirname(specsPath), { recursive: true })
    writeFileSync(specsPath, LASERS)
    setConfigRootForTests(root)
    vi.stubEnv('ZONE_CODE', 'test')
    clearConfigCache()
    clearLaserSpecsCache()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    setConfigRootForTests(undefined)
    clearConfigCache()
    clearLaserSpecsCache()
    rmSync(root, { recursive: true, force: true })
  })

  it('resolves the zone laser config into specs', () => {
    const specs = loadLaserSpecs()
    expect(specs).toHaveLength(1)
    expect(specs[0].laser).toBe('TST')
    expect(specs[0].pvs.connection).toBe('BI_TST_CONN')
  })

  it('throws when ZONE_CODE is not set', () => {
    vi.stubEnv('ZONE_CODE', '')
    expect(() => loadLaserSpecs()).toThrow(/ZONE_CODE is not set/)
  })

  it('throws when this zone has no laser config — there is no default fallback', () => {
    vi.stubEnv('ZONE_CODE', 'l4')
    expect(() => loadLaserSpecs()).toThrow(ConfigError)
    expect(() => loadLaserSpecs()).toThrow(/module config not found/)
  })

  it('names the resolved path when the file is invalid', () => {
    writeFileSync(specsPath, 'lasers: [unclosed')
    expect(() => loadLaserSpecs()).toThrow(TEST_CONFIG)
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
