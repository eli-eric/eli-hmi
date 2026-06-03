import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stringify } from 'yaml'
import { parseLaserSpecs } from './schema'

const realYaml = readFileSync(
  join(process.cwd(), 'src/app/(modules)/l4-opcpa/config/lasers.yaml'),
  'utf8',
)

/** A minimal valid laser object; override any field. */
function laser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'NL9',
    pvs: {
      connection: 'BI_NL9_CONN',
      fullPower: 'BI_NL9_FULLP',
      shutter: 'BI_NL9_SHUTTER',
      phdMean: 'AI_NL9_PHD_MEAN',
      regenState: 'SY:1',
      regenTemp: 'TK:1',
      phd2Mean: 'PHD:2',
      attenuator: 'ATT:1',
      loadedWaveform: 'WF:1',
    },
    triggerDelay: ['AI_NL9_TRIG_DELAY_CH1', 'AI_NL9_TRIG_DELAY_CH2'],
    mss: ['BI_NL9_MSS_1'],
    moduleErrors: [{ label: 'REGEN', pv: 'BI_NL9_ERR_REGEN' }],
    chillers: [
      { label: 'C1', flow: 'f', temp: 't', level: 'l' },
    ],
    flashlamps: [{ label: 'F1', pv: 'SI_NL9_FL_1' }],
    modbox: ['BI_NL9_MODBOX_1'],
    delayPresets: [50],
    commands: ['START_LASER'],
    ...overrides,
  }
}

const doc = (lasers: unknown[]) => stringify({ lasers })

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

  // Detailed shape is asserted on a fixture (not the real file) so editing
  // lasers.yaml — the file's whole purpose — doesn't break these checks.
  it('renames id → laser and passes every signal through verbatim', () => {
    const spec = parseLaserSpecs(doc([laser({ id: 'NLX' })]))[0]
    expect(spec.laser).toBe('NLX')
    expect('id' in spec).toBe(false)
    expect(spec.pvs.regenState).toBe('SY:1')
    expect(spec.pvs.loadedWaveform).toBe('WF:1')
    expect(spec.triggerDelay).toEqual([
      'AI_NL9_TRIG_DELAY_CH1',
      'AI_NL9_TRIG_DELAY_CH2',
    ])
    expect(spec.chillers[0]).toEqual({
      label: 'C1',
      flow: 'f',
      temp: 't',
      level: 'l',
    })
    expect(spec.flashlamps[0]).toEqual({ label: 'F1', pv: 'SI_NL9_FL_1' })
    expect(spec.moduleErrors[0]).toEqual({
      label: 'REGEN',
      pv: 'BI_NL9_ERR_REGEN',
    })
  })

  it('the real lasers.yaml is structurally valid for every laser', () => {
    for (const spec of parseLaserSpecs(realYaml)) {
      expect(spec.pvs.connection.length).toBeGreaterThan(0)
      expect(spec.commands.length).toBeGreaterThan(0)
    }
  })

  it('accepts empty banks (laser lacking a subsystem)', () => {
    const spec = parseLaserSpecs(
      doc([laser({ chillers: [], flashlamps: [], modbox: [] })]),
    )[0]
    expect(spec.chillers).toEqual([])
    expect(spec.flashlamps).toEqual([])
    expect(spec.modbox).toEqual([])
  })

  it('rejects unknown/misspelled keys', () => {
    expect(() =>
      parseLaserSpecs(doc([laser({ chiller: [] })])),
    ).toThrow(/lasers\.yaml is invalid/)
  })

  it('rejects duplicate laser ids', () => {
    expect(() => parseLaserSpecs(doc([laser(), laser()]))).toThrow(
      /duplicate laser id/,
    )
  })

  it('rejects duplicate PV names within a laser (copy-paste typo)', () => {
    expect(() =>
      parseLaserSpecs(
        doc([
          laser({
            chillers: [
              { label: 'C1', flow: 'DUP', temp: 't1', level: 'l1' },
              { label: 'C2', flow: 'DUP', temp: 't2', level: 'l2' },
            ],
          }),
        ]),
      ),
    ).toThrow(/duplicate PV name/)
  })

  it('still flags a duplicate when an optional pvs field collides with another PV', () => {
    expect(() =>
      parseLaserSpecs(
        doc([laser({ pvs: { ...laser().pvs, mbc1: 'BI_NL9_CONN' } })]),
      ),
    ).toThrow(/duplicate PV name/)
  })

  it('rejects unknown commands', () => {
    expect(() =>
      parseLaserSpecs(doc([laser({ commands: ['NOT_A_COMMAND'] })])),
    ).toThrow(/lasers\.yaml is invalid/)
  })

  it('rejects whitespace-only PV names', () => {
    expect(() =>
      parseLaserSpecs(doc([laser({ modbox: ['   '] })])),
    ).toThrow(/lasers\.yaml is invalid/)
  })

  it('rejects malformed YAML with a readable message', () => {
    expect(() => parseLaserSpecs('lasers: [unclosed')).toThrow(
      /not valid YAML/,
    )
  })
})
