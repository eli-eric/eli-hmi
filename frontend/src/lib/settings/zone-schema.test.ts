import { describe, expect, it } from 'vitest'

import {
  MODULE_KEYS,
  MODULES,
  moduleConfigPath,
  parseGlobalConfig,
  ZONE_CODE_RE,
} from './zone-schema'

const VALID = `
zones:
  test:
    title: L4 OPCPA
    modules:
      - { key: l4-opcpa, text: L4 OPCPA Controls }
`

const parse = (text: string) => parseGlobalConfig(text, 'config/global.yaml')

describe('MODULES registry', () => {
  it('gives every module a unique route', () => {
    const routes = MODULE_KEYS.map((k) => MODULES[k].route)
    expect(new Set(routes).size).toBe(routes.length)
  })

  it('derives a module config path from the module dir and the zone code', () => {
    expect(moduleConfigPath('p3', 'test')).toBe(
      'src/app/(modules)/p3-controls/config/zones/test.yaml',
    )
  })
})

describe('parseGlobalConfig', () => {
  it('parses a valid global config', () => {
    const config = parse(VALID)
    expect(config.zones.test.title).toBe('L4 OPCPA')
    expect(config.zones.test.modules).toEqual([
      { key: 'l4-opcpa', text: 'L4 OPCPA Controls' },
    ])
  })

  it('accepts every module key', () => {
    const modules = MODULE_KEYS.map((k) => `      - { key: ${k} }`).join('\n')
    const config = parse(`zones:\n  test:\n    modules:\n${modules}\n`)
    expect(config.zones.test.modules.map((m) => m.key)).toEqual(MODULE_KEYS)
  })

  it('accepts a module without `text` — reachable but hidden from the menu', () => {
    const config = parse(
      'zones:\n  test:\n    modules:\n      - { key: l4-opcpa }\n',
    )
    expect(config.zones.test.modules[0].text).toBeUndefined()
  })

  it('accepts several zones', () => {
    const config = parse(
      `zones:
  test:
    modules: [{ key: l4-opcpa }]
  l4:
    title: L4
    modules: [{ key: p3, text: P3 }]
`,
    )
    expect(Object.keys(config.zones).sort()).toEqual(['l4', 'test'])
  })

  it('freezes the result — it is cached and shared across requests', () => {
    const config = parse(VALID)
    expect(() => {
      config.zones.test.title = 'nope'
    }).toThrow()
  })

  it('rejects malformed YAML', () => {
    expect(() => parse('zones:\n  test: [')).toThrow(/is not valid YAML/)
  })

  it('rejects an unknown module key', () => {
    expect(() =>
      parse('zones:\n  test:\n    modules:\n      - { key: nope }\n'),
    ).toThrow(/is invalid/)
  })

  it('rejects a zone with no modules — it could only serve /no-access', () => {
    expect(() => parse('zones:\n  test:\n    modules: []\n')).toThrow(
      /is invalid/,
    )
  })

  it('rejects the same module listed twice, naming the zone and key', () => {
    // Two entries would put the same route in the menu twice.
    expect(() =>
      parse(
        'zones:\n  test:\n    modules:\n      - { key: p3 }\n      - { key: p3 }\n',
      ),
    ).toThrow(/zone "test" lists module "p3" more than once/)
  })

  it('rejects unknown keys (typo protection)', () => {
    expect(() =>
      parse(
        'zones:\n  test:\n    modules: [{ key: p3 }]\n    allowedRoutes: [/p3-controls]\n',
      ),
    ).toThrow(/is invalid/)
  })

  it('rejects a route written by hand — routes come from the registry', () => {
    expect(() =>
      parse(
        'zones:\n  test:\n    modules:\n      - { key: p3, href: /p3-controls }\n',
      ),
    ).toThrow(/is invalid/)
  })

  it('rejects a blank title', () => {
    expect(() =>
      parse('zones:\n  test:\n    title: "  "\n    modules: [{ key: p3 }]\n'),
    ).toThrow(/is invalid/)
  })

  it('rejects a zone code that is not usable as a filename stem', () => {
    // The code becomes `config/zones/<code>.yaml` under every module.
    expect(() =>
      parse('zones:\n  "../etc":\n    modules: [{ key: p3 }]\n'),
    ).toThrow(/is invalid/)
    expect(ZONE_CODE_RE.test('../etc')).toBe(false)
  })
})
