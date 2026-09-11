import { beforeEach, describe, expect, it, vi } from 'vitest'

const parsers = vi.hoisted(() => ({
  parseLaserSpecs: vi.fn(),
  parseModuleConfig: vi.fn(),
}))

vi.mock('@/app/(modules)/l4-opcpa/config/schema', () => ({
  parseLaserSpecs: parsers.parseLaserSpecs,
}))
vi.mock('@/lib/modules/module-config-schema', () => ({
  parseModuleConfig: parsers.parseModuleConfig,
}))

import {
  listModuleConfigs,
  validateEnabledModuleConfigs,
  validateModuleConfig,
} from './module-config-validation'
import { parseGlobalConfig } from './zone-schema'

const ALL_MODULES = parseGlobalConfig(
  `
zones:
  test:
    modules:
      - { key: l4-opcpa }
      - { key: p3 }
      - { key: l3bt }
      - { key: l4fbt }
`,
  'config/global.yaml',
).zones.test

const ONE_MODULE = parseGlobalConfig(
  'zones:\n  test:\n    modules: [{ key: p3 }]\n',
  'config/global.yaml',
).zones.test

const read = () => vi.fn((key: string, zone: string) => `contents of ${key}@${zone}`)

describe('module-config-validation', () => {
  beforeEach(() => {
    parsers.parseLaserSpecs.mockReset()
    parsers.parseModuleConfig.mockReset()
  })

  describe('listModuleConfigs', () => {
    it('lists every module with its path, flagging which the zone enables', () => {
      // Every module is listed, not just the enabled ones, so config for a
      // disabled page still gets validated instead of rotting unnoticed.
      expect(listModuleConfigs('test', ONE_MODULE)).toEqual([
        {
          moduleKey: 'l4-opcpa',
          config: 'src/app/(modules)/l4-opcpa/config/zones/test.yaml',
          enabled: false,
        },
        {
          moduleKey: 'p3',
          config: 'src/app/(modules)/p3-controls/config/zones/test.yaml',
          enabled: true,
        },
        {
          moduleKey: 'l3bt',
          config: 'src/app/(modules)/l3bt-controls/config/zones/test.yaml',
          enabled: false,
        },
        {
          moduleKey: 'l4fbt',
          config: 'src/app/(modules)/l4fbt-controls/config/zones/test.yaml',
          enabled: false,
        },
      ])
    })

    it('treats every module as disabled without a zone', () => {
      expect(listModuleConfigs('test').every((r) => !r.enabled)).toBe(true)
    })
  })

  describe('validateModuleConfig', () => {
    it('dispatches l4-opcpa to the laser parser with its path as the name', () => {
      validateModuleConfig('l4-opcpa', 'test', read())
      expect(parsers.parseLaserSpecs).toHaveBeenCalledWith(
        'contents of l4-opcpa@test',
        'src/app/(modules)/l4-opcpa/config/zones/test.yaml',
      )
    })

    it('dispatches vacuum modules to the shared parser', () => {
      validateModuleConfig('l3bt', 'l4', read())
      expect(parsers.parseModuleConfig).toHaveBeenCalledWith(
        'contents of l3bt@l4',
        'src/app/(modules)/l3bt-controls/config/zones/l4.yaml',
      )
    })

    it('identifies the module and path when parsing fails', () => {
      parsers.parseModuleConfig.mockImplementation(() => {
        throw new Error('missing roughing.sensorBar')
      })
      expect(() => validateModuleConfig('l3bt', 'test', read())).toThrow(
        /l3bt \(src\/app\/\(modules\)\/l3bt-controls\/config\/zones\/test\.yaml\): missing roughing\.sensorBar/,
      )
    })
  })

  describe('validateEnabledModuleConfigs', () => {
    it('validates only the modules the zone turns on', () => {
      const readConfig = read()
      expect(
        validateEnabledModuleConfigs('test', ONE_MODULE, readConfig).map(
          (r) => r.moduleKey,
        ),
      ).toEqual(['p3'])
      expect(readConfig).toHaveBeenCalledTimes(1)
    })

    it('validates every module when the zone enables them all', () => {
      const readConfig = read()
      expect(
        validateEnabledModuleConfigs('test', ALL_MODULES, readConfig).map(
          (r) => r.moduleKey,
        ),
      ).toEqual(['l4-opcpa', 'p3', 'l3bt', 'l4fbt'])
      expect(parsers.parseLaserSpecs).toHaveBeenCalledTimes(1)
      expect(parsers.parseModuleConfig).toHaveBeenCalledTimes(3)
    })
  })
})
