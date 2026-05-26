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

  it('resolves NL2 with full PV strings and renames id → laser', () => {
    const nl2 = parseLaserSpecs(realYaml).find((s) => s.laser === 'NL2')!
    expect(nl2.pvs.regenState).toBe('BI_NL2_REGEN_STATE')
    expect(nl2.pvs.regenTemp).toBe('AI_TEMP_NL2_REGEN')
    expect(nl2.mss).toHaveLength(6)
    expect(nl2.modbox).toHaveLength(5)
    expect(nl2.chillers).toHaveLength(4)
    expect(nl2.chillers[0]).toEqual({
      label: 'PS1225:11',
      flow: 'AI_NL2_CHILLER_11_FLOW',
      temp: 'AI_NL2_CHILLER_11_TEMP',
      level: 'AI_NL2_CHILLER_11_LEVEL',
    })
    expect(nl2.flashlamps).toHaveLength(14)
    expect(nl2.flashlamps[0]).toEqual({ label: '22 Ch1', pv: 'SI_NL2_FL_22_CH1' })
    expect(nl2.moduleErrors[0]).toEqual({
      label: 'REGEN',
      pv: 'BI_NL2_ERR_REGEN',
    })
    expect(nl2.commands).toHaveLength(10)
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

  it('rejects unknown commands', () => {
    expect(() =>
      parseLaserSpecs(doc([laser({ commands: ['NOT_A_COMMAND'] })])),
    ).toThrow(/lasers\.yaml is invalid/)
  })

  it('rejects malformed YAML with a readable message', () => {
    expect(() => parseLaserSpecs('lasers: [unclosed')).toThrow(
      /not valid YAML/,
    )
  })
})
