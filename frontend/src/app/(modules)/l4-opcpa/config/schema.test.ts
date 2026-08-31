import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stringify } from 'yaml'
import { parseLaserSpecs } from './schema'

// The real config moved to the in-repo template dir (CSI-861) — validate the
// template so a broken example never ships to the controls-team config repo.
const realYaml = readFileSync(
  join(process.cwd(), '..', 'eli-hmi-config/modules/l4-opcpa/lasers.yaml'),
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
    mss: [{ label: 'MSS 1', pv: 'BI_NL9_MSS_1' }],
    moduleErrors: [{ label: 'REGEN', pv: 'BI_NL9_ERR_REGEN' }],
    chillers: [{ label: 'C1', flow: 'f', temp: 't', level: 'l' }],
    flashlamps: [{ label: 'F1', pv: 'SI_NL9_FL_1' }],
    modbox: [{ label: 'Modbox 1', pv: 'BI_NL9_MODBOX_1' }],
    delayPresets: [50],
    commands: { START_LASER: 'START_LASER' },
    ...overrides,
  }
}

const doc = (lasers: unknown[]) => stringify({ lasers })

describe('parseLaserSpecs', () => {
  it('parses the real lasers.yaml into a non-empty set of unique laser ids', () => {
    const specs = parseLaserSpecs(realYaml)
    const laserIds = specs.map((s) => s.laser)

    expect(laserIds.length).toBeGreaterThan(0)
    expect(new Set(laserIds).size).toBe(laserIds.length)
    expect(laserIds.every((id) => id.trim().length > 0)).toBe(true)
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
    expect(spec.mss[0]).toEqual({ label: 'MSS 1', pv: 'BI_NL9_MSS_1' })
    expect(spec.modbox[0]).toEqual({ label: 'Modbox 1', pv: 'BI_NL9_MODBOX_1' })
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
    expect(() => parseLaserSpecs(doc([laser({ chiller: [] })]))).toThrow(
      /lasers\.yaml is invalid/,
    )
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

  it('rejects unknown commands', () => {
    expect(() =>
      parseLaserSpecs(
        doc([laser({ commands: { NOT_A_COMMAND: 'NOT_A_COMMAND' } })]),
      ),
    ).toThrow(/lasers\.yaml is invalid/)
  })

  it('normalises the commands map into commands (keys) + commandPvs (overrides only)', () => {
    const spec = parseLaserSpecs(
      doc([
        laser({
          commands: {
            START_LASER: 'START_LASER',
            ALIGNMENT_MODE: 'L4-OPCPA-NL9:SetAlignmentMode',
            SET_DELAY: 'L4-OPCPA-NL9:PS5059:22:SetBothChannelsTrigDelay',
          },
        }),
      ]),
    )[0]
    expect([...spec.commands].sort()).toEqual([
      'ALIGNMENT_MODE',
      'SET_DELAY',
      'START_LASER',
    ])
    expect(spec.commandPvs).toEqual({
      ALIGNMENT_MODE: 'L4-OPCPA-NL9:SetAlignmentMode',
      SET_DELAY: 'L4-OPCPA-NL9:PS5059:22:SetBothChannelsTrigDelay',
    })
  })

  it('rejects a command value that is neither the placeholder nor a PV (no ":")', () => {
    expect(() =>
      parseLaserSpecs(
        doc([laser({ commands: { ALIGNMENT_MODE: 'SetAlignmentMode' } })]),
      ),
    ).toThrow(/neither the placeholder/)
  })

  it('rejects duplicate command override PVs (copy-paste typo)', () => {
    expect(() =>
      parseLaserSpecs(
        doc([
          laser({
            commands: {
              ALIGNMENT_MODE: 'L4:DUP',
              SYSTEM_STANDBY: 'L4:DUP',
            },
          }),
        ]),
      ),
    ).toThrow(/duplicate PV name/)
  })

  it('placeholders do not trip the duplicate-PV check across commands', () => {
    const spec = parseLaserSpecs(
      doc([
        laser({
          commands: {
            START_LASER: 'START_LASER',
            STOP_LASER: 'STOP_LASER',
          },
        }),
      ]),
    )[0]
    expect(spec.commandPvs).toEqual({})
  })

  it('rejects whitespace-only PV names', () => {
    expect(() =>
      parseLaserSpecs(doc([laser({ triggerDelay: ['   '] })])),
    ).toThrow(/lasers\.yaml is invalid/)
  })

  it('rejects malformed YAML with a readable message', () => {
    expect(() => parseLaserSpecs('lasers: [unclosed')).toThrow(/not valid YAML/)
  })
})
