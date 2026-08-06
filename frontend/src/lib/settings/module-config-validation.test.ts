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

import { validateReferencedModuleConfigs } from './module-config-validation'
import { parseZoneFile, ZONE_SCHEMA_VERSION } from './zone-schema'

const ALL_MODULES = parseZoneFile(
  `
schemaVersion: ${ZONE_SCHEMA_VERSION}
navigationItems: []
allowedRoutes:
  - /l4-opcpa
modules:
  l4-opcpa:
    config: modules/l4-opcpa/lasers.yaml
  p3:
    config: modules/p3/config.yaml
  l3bt:
    config: modules/l3bt/config.yaml
  l4fbt:
    config: modules/l4fbt/config.yaml
`,
  'zones/all-modules.yaml',
)

describe('validateReferencedModuleConfigs', () => {
  beforeEach(() => {
    parsers.parseLaserSpecs.mockReset()
    parsers.parseModuleConfig.mockReset()
  })

  it('reads and validates every referenced module, even when its route is disabled', () => {
    const read = vi.fn((path: string) => `contents of ${path}`)

    expect(validateReferencedModuleConfigs(ALL_MODULES, read)).toEqual([
      {
        moduleKey: 'l4-opcpa',
        config: 'modules/l4-opcpa/lasers.yaml',
      },
      { moduleKey: 'p3', config: 'modules/p3/config.yaml' },
      { moduleKey: 'l3bt', config: 'modules/l3bt/config.yaml' },
      { moduleKey: 'l4fbt', config: 'modules/l4fbt/config.yaml' },
    ])
    expect(read.mock.calls.map(([path]) => path)).toEqual([
      'modules/l4-opcpa/lasers.yaml',
      'modules/p3/config.yaml',
      'modules/l3bt/config.yaml',
      'modules/l4fbt/config.yaml',
    ])
    expect(parsers.parseLaserSpecs).toHaveBeenCalledWith(
      'contents of modules/l4-opcpa/lasers.yaml',
    )
    expect(parsers.parseModuleConfig.mock.calls).toEqual([
      ['contents of modules/p3/config.yaml', 'modules/p3/config.yaml'],
      ['contents of modules/l3bt/config.yaml', 'modules/l3bt/config.yaml'],
      ['contents of modules/l4fbt/config.yaml', 'modules/l4fbt/config.yaml'],
    ])
  })

  it('identifies the module key and config path when parsing fails', () => {
    const read = vi.fn((path: string) => `contents of ${path}`)
    parsers.parseModuleConfig.mockImplementation((_text, name) => {
      if (name === 'modules/l3bt/config.yaml') {
        throw new Error('missing roughing.sensorBar')
      }
    })

    expect(() => validateReferencedModuleConfigs(ALL_MODULES, read)).toThrow(
      /modules\.l3bt \(modules\/l3bt\/config\.yaml\): missing roughing\.sensorBar/,
    )
  })
})
