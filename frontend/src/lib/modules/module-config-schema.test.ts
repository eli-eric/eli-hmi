import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { stringify as stringifyYaml } from 'yaml'

import type {
  BackingConfig,
  CDAVolume,
  CleanDryAirConfig,
  InterlockGroupConfig,
  InterlockItem,
  LockingConfig,
  ModuleConfig,
  PumpConfig,
  RoughingConfig,
  SensorEntry,
  SensorGroup,
} from './types'
import {
  MODULE_CONFIG_SCHEMA_VERSION,
  parseModuleConfig,
} from './module-config-schema'

const VALID_FILE = {
  schemaVersion: 1,
  heading: 'P3',
  interlocks: {
    title: 'P3 Interlocks',
    width: '12rem',
    checkClearPv: 'P3:INTERLOCK',
    items: [{ pvname: 'P3:INTERLOCK', title: 'P3 Chamber' }],
  },
  safetyPermission: {
    title: 'P3 Machine Safety Permissions',
    items: [{ pvname: 'P3:PERMISSION', title: 'P3 Roughing' }],
  },
  cleanDryAir: {
    title: 'P3 Clean Dry Air',
    width: '100%',
    volumes: [
      {
        title: 'P3 CDA Valve Actuation',
        width: '10rem',
        pressure: {
          pvName: 'P3:CDA_PRESSURE',
          label: 'PPS801',
          options: {
            format: 'precision',
            toExponential: 2,
            toPrecision: 3,
          },
        },
        flow: { pvName: 'P3:FLOW', label: 'PPFS801' },
      },
    ],
  },
  backing: {
    title: 'P3 Backing',
    width: '100%',
    containerWidth: '9rem',
    sensorBar: {
      title: 'P3 Backing Line',
      label: 'Pressure',
      height: '20rem',
      sensorPVs: [{ pvName: 'P3:BACKING', label: 'APG802' }],
    },
    pump: {
      title: 'Backing Pump',
      rpmPV: 'P3:RPM',
      valvePv: 'P3:VALVE',
      valveLabel: 'P028',
    },
  },
  roughing: {
    title: 'P3 Roughing',
    width: '100%',
    containerWidth: '9rem',
    sensorBar: {
      title: 'P3 Roughing Line',
      label: 'Pressure',
      height: '20rem',
      sensorPVs: [{ pvName: 'P3:ROUGHING', label: 'APG801' }],
    },
    pump: {
      title: 'Roughing Pump',
      rpmPV: 'P3:ROUGHING_RPM',
      valvePv: 'P3:ROUGHING_VALVE',
      valveLabel: 'GV000',
    },
    locking: { label: 'Used and Locked By', pvName: 'P3:LOCKED' },
  },
} as const

function validYaml(): string {
  return stringifyYaml(VALID_FILE)
}

describe('parseModuleConfig', () => {
  it('parses the existing camelCase ModuleConfig shape and removes schemaVersion', () => {
    const config = parseModuleConfig(validYaml(), 'modules/p3/config.yaml')

    expect(config.heading).toBe('P3')
    expect(config.interlocks.checkClearPv).toBe('P3:INTERLOCK')
    expect(config.cleanDryAir.volumes[0].pressure.options).toEqual({
      format: 'precision',
      toExponential: 2,
      toPrecision: 3,
    })
    expect(config.roughing.locking?.pvName).toBe('P3:LOCKED')
    expect(config).not.toHaveProperty('schemaVersion')
    expectTypeOf(config).toEqualTypeOf<ModuleConfig>()
  })

  it('keeps every legacy type exported through types.ts', () => {
    expectTypeOf<InterlockItem>().toMatchTypeOf<
      ModuleConfig['interlocks']['items'][number]
    >()
    expectTypeOf<InterlockGroupConfig>().toMatchTypeOf<
      ModuleConfig['interlocks']
    >()
    expectTypeOf<SensorEntry>().toMatchTypeOf<
      ModuleConfig['backing']['sensorBar']['sensorPVs'][number]
    >()
    expectTypeOf<PumpConfig>().toMatchTypeOf<ModuleConfig['backing']['pump']>()
    expectTypeOf<SensorGroup>().toMatchTypeOf<
      ModuleConfig['backing']['sensorBar']
    >()
    expectTypeOf<BackingConfig>().toMatchTypeOf<ModuleConfig['backing']>()
    expectTypeOf<LockingConfig>().toMatchTypeOf<
      NonNullable<ModuleConfig['roughing']['locking']>
    >()
    expectTypeOf<RoughingConfig>().toMatchTypeOf<ModuleConfig['roughing']>()
    expectTypeOf<CDAVolume>().toMatchTypeOf<
      ModuleConfig['cleanDryAir']['volumes'][number]
    >()
    expectTypeOf<CleanDryAirConfig>().toMatchTypeOf<
      ModuleConfig['cleanDryAir']
    >()
  })

  it('rejects malformed YAML with the referenced file name', () => {
    expect(() =>
      parseModuleConfig('heading: [unclosed', 'modules/p3/config.yaml'),
    ).toThrow(/modules\/p3\/config\.yaml is not valid YAML/)
  })

  it('rejects missing and unsupported schema versions', () => {
    const withoutVersion = { ...VALID_FILE }
    Reflect.deleteProperty(withoutVersion, 'schemaVersion')

    expect(() =>
      parseModuleConfig(
        stringifyYaml(withoutVersion),
        'modules/p3/config.yaml',
      ),
    ).toThrow(/schemaVersion/)
    expect(() =>
      parseModuleConfig(
        stringifyYaml({ ...VALID_FILE, schemaVersion: 999 }),
        'modules/p3/config.yaml',
      ),
    ).toThrow(/schemaVersion/)
    expect(MODULE_CONFIG_SCHEMA_VERSION).toBe(1)
  })

  it('strictly rejects unknown top-level and nested keys', () => {
    expect(() =>
      parseModuleConfig(
        stringifyYaml({ ...VALID_FILE, unexpected: true }),
        'modules/p3/config.yaml',
      ),
    ).toThrow(/unexpected/)

    expect(() =>
      parseModuleConfig(
        stringifyYaml({
          ...VALID_FILE,
          backing: { ...VALID_FILE.backing, unexpected: true },
        }),
        'modules/p3/config.yaml',
      ),
    ).toThrow(/unexpected/)
  })

  it('rejects blank labels, PV names, and unsupported value formats', () => {
    const blankHeading = { ...VALID_FILE, heading: '   ' }
    expect(() =>
      parseModuleConfig(stringifyYaml(blankHeading), 'modules/p3/config.yaml'),
    ).toThrow(/heading/)

    const blankPv = {
      ...VALID_FILE,
      backing: {
        ...VALID_FILE.backing,
        pump: { ...VALID_FILE.backing.pump, rpmPV: '   ' },
      },
    }
    expect(() =>
      parseModuleConfig(stringifyYaml(blankPv), 'modules/p3/config.yaml'),
    ).toThrow(/rpmPV/)

    const [volume] = VALID_FILE.cleanDryAir.volumes
    const invalidFormat = {
      ...VALID_FILE,
      cleanDryAir: {
        ...VALID_FILE.cleanDryAir,
        volumes: [
          {
            ...volume,
            pressure: {
              ...volume.pressure,
              options: { ...volume.pressure.options, format: 'fixed' },
            },
          },
        ],
      },
    }
    expect(() =>
      parseModuleConfig(stringifyYaml(invalidFormat), 'modules/p3/config.yaml'),
    ).toThrow(/format/)
  })

  it('allows duplicate PV names because legacy placeholders are preserved verbatim', () => {
    const duplicate = {
      ...VALID_FILE,
      safetyPermission: {
        ...VALID_FILE.safetyPermission,
        items: [
          {
            ...VALID_FILE.safetyPermission.items[0],
            pvname: VALID_FILE.interlocks.items[0].pvname,
          },
        ],
      },
    }

    expect(
      parseModuleConfig(stringifyYaml(duplicate), 'modules/p3/config.yaml')
        .safetyPermission.items[0].pvname,
    ).toBe('P3:INTERLOCK')
  })

  it('parses all real module templates, including duplicate and placeholder PVs', () => {
    const modulesDir = join(process.cwd(), '..', 'eli-hmi-config', 'modules')
    const expectedHeadings = {
      p3: 'P3',
      l3bt: 'L3BT',
      l4fbt: 'L4fBT',
    } as const

    for (const [key, heading] of Object.entries(expectedHeadings)) {
      const name = `modules/${key}/config.yaml`
      const config = parseModuleConfig(
        readFileSync(join(modulesDir, key, 'config.yaml'), 'utf8'),
        name,
      )
      expect(config.heading).toBe(heading)
    }

    const p3 = parseModuleConfig(
      readFileSync(join(modulesDir, 'p3', 'config.yaml'), 'utf8'),
      'modules/p3/config.yaml',
    )
    expect(
      p3.interlocks.items.filter(
        ({ pvname }) => pvname === 'L3BT-VCS-EGV501:INTERLOCK',
      ),
    ).toHaveLength(2)

    const l4fbt = parseModuleConfig(
      readFileSync(join(modulesDir, 'l4fbt', 'config.yaml'), 'utf8'),
      'modules/l4fbt/config.yaml',
    )
    expect(l4fbt.interlocks.items[0].pvname).toBe('undefined:INTERLOCK')
  })

  it('returns a deeply frozen object suitable for the process cache', () => {
    const config = parseModuleConfig(validYaml(), 'modules/p3/config.yaml')

    expect(Object.isFrozen(config)).toBe(true)
    expect(Object.isFrozen(config.interlocks)).toBe(true)
    expect(Object.isFrozen(config.interlocks.items)).toBe(true)
    expect(
      Object.isFrozen(config.cleanDryAir.volumes[0].pressure.options),
    ).toBe(true)
    expect(() => {
      ;(config.interlocks.items as unknown as unknown[]).push('hacked')
    }).toThrow()
  })
})
