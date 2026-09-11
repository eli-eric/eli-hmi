import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stringify as stringifyYaml } from 'yaml'

vi.mock('server-only', () => ({}))

import {
  clearConfigCache,
  ConfigError,
  setConfigRootForTests,
} from '@/lib/settings/config-loader'
import { moduleConfigPath } from '@/lib/settings/zone-schema'
import {
  clearModuleConfigCache,
  loadModuleConfig,
  MODULE_CONFIG_KEYS,
  type ModuleConfigKey,
} from './module-config-loader'

function moduleFile(heading: string): string {
  return stringifyYaml({
    heading,
    interlocks: {
      title: `${heading} Interlocks`,
      items: [{ pvname: `${heading}:INTERLOCK`, title: 'Chamber' }],
    },
    safetyPermission: {
      title: `${heading} Safety Permissions`,
      items: [{ pvname: `${heading}:PERMISSION`, title: 'Roughing' }],
    },
    cleanDryAir: {
      title: `${heading} Clean Dry Air`,
      volumes: [
        {
          title: 'Valve Actuation',
          pressure: { pvName: `${heading}:PRESSURE`, label: 'PPS' },
          flow: { pvName: `${heading}:FLOW`, label: 'PFS' },
        },
      ],
    },
    backing: {
      title: `${heading} Backing`,
      sensorBar: {
        title: 'Backing Line',
        label: 'Pressure',
        sensorPVs: [{ pvName: `${heading}:BACKING`, label: 'APG' }],
      },
      pump: {
        title: 'Backing Pump',
        rpmPV: `${heading}:RPM`,
        valvePv: `${heading}:VALVE`,
        valveLabel: 'GV',
      },
    },
    roughing: {
      title: `${heading} Roughing`,
      sensorBar: {
        title: 'Roughing Line',
        label: 'Pressure',
        sensorPVs: [{ pvName: `${heading}:ROUGHING`, label: 'APG' }],
      },
      pump: {
        title: 'Roughing Pump',
        rpmPV: `${heading}:ROUGHING_RPM`,
        valvePv: `${heading}:ROUGHING_VALVE`,
        valveLabel: 'GV',
      },
    },
  })
}

const P3_CONFIG = moduleConfigPath('p3', 'test')

describe('loadModuleConfig', () => {
  let root: string
  let p3Path: string

  beforeEach(() => {
    // The path is derived from the module registry, not from the config, so
    // the fixture root mirrors the real tree.
    root = mkdtempSync(join(tmpdir(), 'module-config-'))
    p3Path = join(root, P3_CONFIG)
    mkdirSync(dirname(p3Path), { recursive: true })
    writeFileSync(p3Path, moduleFile('P3'))
    setConfigRootForTests(root)
    vi.stubEnv('ZONE_CODE', 'test')
    clearConfigCache()
    clearModuleConfigCache()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    setConfigRootForTests(undefined)
    clearConfigCache()
    clearModuleConfigCache()
    rmSync(root, { recursive: true, force: true })
  })

  it('exposes every shared ModuleConfig key', () => {
    expect(MODULE_CONFIG_KEYS).toEqual(['p3', 'l3bt', 'l4fbt'])
  })

  it('resolves a module key to its per-zone file', () => {
    const key: ModuleConfigKey = 'p3'
    const config = loadModuleConfig(key)

    expect(config.heading).toBe('P3')
    expect(config.interlocks.items[0].pvname).toBe('P3:INTERLOCK')
  })

  it('throws an actionable error when ZONE_CODE is not set', () => {
    vi.stubEnv('ZONE_CODE', '')
    expect(() => loadModuleConfig('p3')).toThrow(ConfigError)
    expect(() => loadModuleConfig('p3')).toThrow(
      /ZONE_CODE is not set[\s\S]*p3 module config/,
    )
  })

  it('throws an actionable error when this zone has no file for the module', () => {
    // Deliberately no fallback to a shared default: a station must never
    // silently come up on another station's PV names.
    expect(() => loadModuleConfig('l3bt')).toThrow(ConfigError)
    expect(() => loadModuleConfig('l3bt')).toThrow(
      /module config not found[\s\S]*zone "test"/,
    )
  })

  it('includes the resolved path when module YAML is invalid', () => {
    writeFileSync(p3Path, 'heading: [unclosed')
    expect(() => loadModuleConfig('p3')).toThrow(/is not valid YAML/)
    expect(() => loadModuleConfig('p3')).toThrow(P3_CONFIG)
  })

  it('production: caches successful parses until the cache is cleared', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const first = loadModuleConfig('p3')
    writeFileSync(p3Path, moduleFile('P3 edited'))

    expect(loadModuleConfig('p3')).toBe(first)
    expect(loadModuleConfig('p3').heading).toBe('P3')

    clearModuleConfigCache()
    const fresh = loadModuleConfig('p3')
    expect(fresh).not.toBe(first)
    expect(fresh.heading).toBe('P3 edited')
  })

  it('development: reloads the file on every request', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const first = loadModuleConfig('p3')
    writeFileSync(p3Path, moduleFile('P3 edited'))
    const second = loadModuleConfig('p3')

    expect(second).not.toBe(first)
    expect(second.heading).toBe('P3 edited')
  })

  it('returns a deeply frozen config', () => {
    const config = loadModuleConfig('p3')
    expect(Object.isFrozen(config)).toBe(true)
    expect(Object.isFrozen(config.backing.sensorBar.sensorPVs)).toBe(true)
  })
})
