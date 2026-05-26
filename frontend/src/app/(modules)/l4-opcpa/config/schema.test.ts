import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseLaserSpecs } from './schema'

const realYaml = readFileSync(
  join(process.cwd(), 'src/app/(modules)/l4-opcpa/config/lasers.yaml'),
  'utf8',
)

/** Builds a one-laser YAML doc; override any field's raw YAML value. */
function oneLaser(overrides: Record<string, string> = {}): string {
  const fields: Record<string, string> = {
    id: 'NL9',
    mssCount: '1',
    modboxCount: '1',
    channelsPerBox: '2',
    chillerIds: "['11']",
    flashlampBoxes: "['22']",
    delayPresets: '[50]',
    moduleErrors: "['REGEN', 'CHILLER_11', 'FLASHLAMPS']",
    commands: '[START_LASER]',
    ...overrides,
  }
  const [first, ...rest] = Object.entries(fields)
  return [
    'lasers:',
    `  - ${first[0]}: ${first[1]}`,
    ...rest.map(([k, v]) => `    ${k}: ${v}`),
  ].join('\n')
}

describe('parseLaserSpecs', () => {
  it('parses the real lasers.yaml into NL1..NL5', () => {
    const specs = parseLaserSpecs(realYaml)
    expect(specs.map((s) => s.laser)).toEqual([
      'NL1',
      'NL2',
      'NL3',
      'NL4',
      'NL5',
    ])
  })

  it('maps friendly YAML keys onto LaserSpec fields (NL2 known-good)', () => {
    const nl2 = parseLaserSpecs(realYaml).find((s) => s.laser === 'NL2')!
    expect(nl2).toEqual({
      laser: 'NL2',
      mssCount: 6,
      moduleErrors: [
        'REGEN',
        'CHILLER_11',
        'CHILLER_12',
        'CHILLER_13',
        'CHILLER_14',
        'FLASHLAMPS',
      ],
      chillerIds: ['11', '12', '13', '14'],
      boxIds: ['22', '23', '24', '25', '26', '27', '28'], // from flashlampBoxes
      channelsPerBox: 2,
      delayPresets: [50, 500, 700, 790],
      modboxStateCount: 5, // from modboxCount
      commands: [
        'START_LASER',
        'STOP_LASER',
        'ALIGNMENT_MODE',
        'SYSTEM_STANDBY',
        'FLASHLAMPS_RUN',
        'FLASHLAMPS_STANDBY',
        'MODBOX_ON',
        'MODBOX_OFF',
        'SET_DELAY',
        'LOAD_WAVEFORM',
      ],
    })
  })

  it('allows per-laser topology to differ', () => {
    const yaml = `lasers:
  - id: NL1
    mssCount: 6
    modboxCount: 5
    channelsPerBox: 2
    chillerIds: ['11']
    flashlampBoxes: ['22']
    delayPresets: [50]
    moduleErrors: ['REGEN', 'CHILLER_11', 'FLASHLAMPS']
    commands: [START_LASER]
  - id: NL2
    mssCount: 2
    modboxCount: 3
    channelsPerBox: 2
    chillerIds: ['99']
    flashlampBoxes: ['22', '23']
    delayPresets: [10]
    moduleErrors: ['REGEN', 'CHILLER_99', 'FLASHLAMPS']
    commands: [STOP_LASER]`
    const specs = parseLaserSpecs(yaml)
    expect(specs).toHaveLength(2)
    expect(specs[0].chillerIds).toEqual(['11'])
    expect(specs[1].chillerIds).toEqual(['99'])
    expect(specs[1].boxIds).toEqual(['22', '23'])
    expect(specs[1].commands).toEqual(['STOP_LASER'])
  })

  it('accepts empty banks (laser lacking a subsystem)', () => {
    const spec = parseLaserSpecs(
      oneLaser({
        chillerIds: '[]',
        flashlampBoxes: '[]',
        modboxCount: '0',
        moduleErrors: "['REGEN', 'FLASHLAMPS']",
      }),
    )[0]
    expect(spec.chillerIds).toEqual([])
    expect(spec.boxIds).toEqual([])
    expect(spec.modboxStateCount).toBe(0)
  })

  it('rejects unknown/misspelled keys', () => {
    expect(() =>
      parseLaserSpecs(oneLaser({ chillerId: "['11']" })),
    ).toThrow(/chillerId/)
  })

  it('rejects duplicate laser ids', () => {
    // two identical NL9 blocks under one `lasers:` key
    const secondBlock = oneLaser().replace('lasers:\n  - ', '  - ')
    const dup = `${oneLaser()}\n${secondBlock}`
    expect(() => parseLaserSpecs(dup)).toThrow(/duplicate laser id/)
  })

  it('rejects chillerIds that do not match CHILLER_* module errors', () => {
    expect(() =>
      parseLaserSpecs(
        oneLaser({
          chillerIds: "['11', '12']",
          moduleErrors: "['REGEN', 'CHILLER_11', 'FLASHLAMPS']",
        }),
      ),
    ).toThrow(/do not match/)
  })

  it('rejects unknown commands', () => {
    expect(() =>
      parseLaserSpecs(oneLaser({ commands: '[NOT_A_COMMAND]' })),
    ).toThrow(/lasers\.yaml is invalid/)
  })

  it('rejects malformed YAML with a readable message', () => {
    expect(() => parseLaserSpecs('lasers: [unclosed')).toThrow(
      /not valid YAML/,
    )
  })
})
