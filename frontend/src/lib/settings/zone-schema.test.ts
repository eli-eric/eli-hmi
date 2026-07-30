import { describe, expect, it } from 'vitest'

import { parseZoneFile, ZONE_SCHEMA_VERSION } from './zone-schema'

const VALID = `
schemaVersion: ${ZONE_SCHEMA_VERSION}
navigationItems:
  - text: L4 OPCPA Controls
    href: /l4-opcpa
allowedRoutes:
  - /l4-opcpa
modules:
  l4-opcpa:
    config: modules/l4-opcpa/lasers.yaml
`

describe('parseZoneFile', () => {
  it('parses a valid zone file', () => {
    const zone = parseZoneFile(VALID, 'zones/test.yaml')
    expect(zone.schemaVersion).toBe(ZONE_SCHEMA_VERSION)
    expect(zone.navigationItems).toEqual([
      { text: 'L4 OPCPA Controls', href: '/l4-opcpa' },
    ])
    expect(zone.allowedRoutes).toEqual(['/l4-opcpa'])
    expect(zone.modules['l4-opcpa']?.config).toBe(
      'modules/l4-opcpa/lasers.yaml',
    )
  })

  it('parses an empty zone (no routes, no nav, no modules key)', () => {
    const zone = parseZoneFile(
      `schemaVersion: ${ZONE_SCHEMA_VERSION}\nnavigationItems: []\nallowedRoutes: []\n`,
      'zones/empty.yaml',
    )
    expect(zone.navigationItems).toEqual([])
    expect(zone.allowedRoutes).toEqual([])
    expect(zone.modules).toEqual({})
  })

  it('rejects malformed YAML with the file name in the message', () => {
    expect(() => parseZoneFile('foo: [unclosed', 'zones/broken.yaml')).toThrow(
      /zones\/broken\.yaml is not valid YAML/,
    )
  })

  it('rejects a wrong schemaVersion', () => {
    const text = VALID.replace(
      `schemaVersion: ${ZONE_SCHEMA_VERSION}`,
      'schemaVersion: 999',
    )
    expect(() => parseZoneFile(text, 'zones/test.yaml')).toThrow(
      /schemaVersion/,
    )
  })

  it('rejects a missing schemaVersion', () => {
    const text = VALID.replace(`schemaVersion: ${ZONE_SCHEMA_VERSION}\n`, '')
    expect(() => parseZoneFile(text, 'zones/test.yaml')).toThrow(
      /schemaVersion/,
    )
  })

  it('rejects unknown top-level keys', () => {
    expect(() =>
      parseZoneFile(`${VALID}\nbogus: 1\n`, 'zones/test.yaml'),
    ).toThrow(/bogus/)
  })

  it('rejects a navigation item pointing outside allowedRoutes', () => {
    const text = `
schemaVersion: ${ZONE_SCHEMA_VERSION}
navigationItems:
  - text: P3
    href: /p3-controls
allowedRoutes:
  - /l4-opcpa
modules:
  l4-opcpa:
    config: modules/l4-opcpa/lasers.yaml
`
    expect(() => parseZoneFile(text, 'zones/test.yaml')).toThrow(
      /not in allowedRoutes/,
    )
  })

  it('rejects duplicate allowedRoutes', () => {
    const text = VALID.replace(
      'allowedRoutes:\n  - /l4-opcpa',
      'allowedRoutes:\n  - /l4-opcpa\n  - /l4-opcpa',
    )
    expect(() => parseZoneFile(text, 'zones/test.yaml')).toThrow(
      /duplicate allowedRoutes/,
    )
  })

  it('rejects an allowed module route without a module config reference', () => {
    const text = `
schemaVersion: ${ZONE_SCHEMA_VERSION}
navigationItems: []
allowedRoutes:
  - /l4-opcpa
`
    expect(() => parseZoneFile(text, 'zones/test.yaml')).toThrow(
      /modules\.l4-opcpa has no config reference/,
    )
  })

  it('rejects a route not starting with /', () => {
    const text = VALID.replace('- /l4-opcpa\n', '- l4-opcpa\n')
    expect(() => parseZoneFile(text, 'zones/test.yaml')).toThrow(/route/)
  })
})
