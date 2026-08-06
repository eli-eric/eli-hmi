import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stringify as stringifyYaml } from 'yaml'

vi.mock('server-only', () => ({}))

import {
  clearZoneCache,
  ZoneConfigError,
} from '@/lib/settings/zone-config-loader'
import {
  clearModuleConfigCache,
  loadModuleConfig,
  MODULE_CONFIG_KEYS,
  type ModuleConfigKey,
} from './module-config-loader'

function moduleFile(heading: string): string {
  return stringifyYaml({
    schemaVersion: 1,
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

describe('loadModuleConfig', () => {
  let configDir: string
  let p3Path: string

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'module-config-'))
    mkdirSync(join(configDir, 'zones'), { recursive: true })
    mkdirSync(join(configDir, 'modules', 'p3'), { recursive: true })
    p3Path = join(configDir, 'modules', 'p3', 'config.yaml')
    writeFileSync(p3Path, moduleFile('P3'))
    writeFileSync(
      join(configDir, 'zones', 'test.yaml'),
      stringifyYaml({
        schemaVersion: 1,
        navigationItems: [],
        allowedRoutes: [],
        modules: { p3: { config: 'modules/p3/config.yaml' } },
      }),
    )
    vi.stubEnv('CONFIG_DIR', configDir)
    vi.stubEnv('ZONE_CODE', 'test')
    clearZoneCache()
    clearModuleConfigCache()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    clearZoneCache()
    clearModuleConfigCache()
    rmSync(configDir, { recursive: true, force: true })
  })

  it('exposes every shared ModuleConfig key', () => {
    expect(MODULE_CONFIG_KEYS).toEqual(['p3', 'l3bt', 'l4fbt'])
  })

  it('resolves a module key through the current zone reference', () => {
    const key: ModuleConfigKey = 'p3'
    const config = loadModuleConfig(key)

    expect(config.heading).toBe('P3')
    expect(config.interlocks.items[0].pvname).toBe('P3:INTERLOCK')
  })

  it('throws an actionable error when ZONE_CODE is not set', () => {
    vi.stubEnv('ZONE_CODE', '')
    expect(() => loadModuleConfig('p3')).toThrow(ZoneConfigError)
    expect(() => loadModuleConfig('p3')).toThrow(
      /ZONE_CODE is not set.*p3 module config/,
    )
  })

  it('throws an actionable error when the zone has no requested module reference', () => {
    expect(() => loadModuleConfig('l3bt')).toThrow(ZoneConfigError)
    expect(() => loadModuleConfig('l3bt')).toThrow(
      /zone "test" has no modules\.l3bt config reference/,
    )
  })

  it('includes the referenced path when module YAML is invalid', () => {
    writeFileSync(p3Path, 'heading: [unclosed')
    expect(() => loadModuleConfig('p3')).toThrow(
      /modules\/p3\/config\.yaml is not valid YAML/,
    )
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

  it('development: reloads the mounted file on every request', () => {
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
