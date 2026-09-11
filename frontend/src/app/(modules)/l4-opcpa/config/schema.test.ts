import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stringify } from 'yaml'
import { moduleConfigPath } from '@/lib/settings/zone-schema'
import { parseLaserSpecs } from './schema'

// Parse the file this repo actually ships for the `test` zone, so a config
// edit that breaks the schema fails here as well as in `validate:config`.
const realYaml = readFileSync(
  join(process.cwd(), moduleConfigPath('l4-opcpa', 'test')),
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
const docWithUnits = (units: unknown, lasers: unknown[]) =>
  stringify({ units, lasers })

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
      /laser config is invalid/,
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
    ).toThrow(/laser config is invalid/)
  })

  it('normalises the commands map into commands (keys) + commandTargets (overrides only)', () => {
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
    // The shorthand form means "write 1", the command-PV trigger convention.
    expect(spec.commandTargets).toEqual({
      ALIGNMENT_MODE: { pvName: 'L4-OPCPA-NL9:SetAlignmentMode', value: 1 },
      SET_DELAY: {
        pvName: 'L4-OPCPA-NL9:PS5059:22:SetBothChannelsTrigDelay',
        value: 1,
      },
    })
  })

  it('accepts an explicit {pv, value} target, e.g. MODBOX_OFF writing "Sleep"', () => {
    const spec = parseLaserSpecs(
      doc([
        laser({
          commands: {
            MODBOX_ON: { pv: 'L4-OPCPA-NL9:ModboxMode', value: 'Run' },
            MODBOX_OFF: { pv: 'L4-OPCPA-NL9:ModboxMode', value: 'Sleep' },
            SYSTEM_STANDBY: { pv: 'L4-OPCPA-NL9:Standby' },
          },
        }),
      ]),
    )[0]
    expect(spec.commandTargets).toEqual({
      MODBOX_ON: { pvName: 'L4-OPCPA-NL9:ModboxMode', value: 'Run' },
      MODBOX_OFF: { pvName: 'L4-OPCPA-NL9:ModboxMode', value: 'Sleep' },
      // Object form without a value still means the default trigger.
      SYSTEM_STANDBY: { pvName: 'L4-OPCPA-NL9:Standby', value: 1 },
    })
  })

  it('lets two commands share one PV when the values differ, but not when they repeat', () => {
    // One mode record driven to two different states is normal wiring, not a
    // copy-paste slip — the duplicate check keys on PV *and* value.
    expect(() =>
      parseLaserSpecs(
        doc([
          laser({
            commands: {
              MODBOX_ON: { pv: 'L4:MODE', value: 'Run' },
              MODBOX_OFF: { pv: 'L4:MODE', value: 'Sleep' },
            },
          }),
        ]),
      ),
    ).not.toThrow()

    expect(() =>
      parseLaserSpecs(
        doc([
          laser({
            commands: {
              MODBOX_ON: { pv: 'L4:MODE', value: 'Run' },
              MODBOX_OFF: { pv: 'L4:MODE', value: 'Run' },
            },
          }),
        ]),
      ),
    ).toThrow(/duplicate PV name\(s\)[\s\S]*L4:MODE/)
  })

  it('rejects a value on a command whose value comes from the operator', () => {
    expect(() =>
      parseLaserSpecs(
        doc([
          laser({
            commands: { SET_DELAY: { pv: 'L4:DELAY', value: 500 } },
          }),
        ]),
      ),
    ).toThrow(/takes its value from the operator/)
  })

  it('rejects an unknown key inside a command target', () => {
    expect(() =>
      parseLaserSpecs(
        doc([
          laser({
            commands: { MODBOX_OFF: { pv: 'L4:MODE', val: 'Sleep' } },
          }),
        ]),
      ),
    ).toThrow(/laser config is invalid/)
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
    expect(spec.commandTargets).toEqual({})
  })

  it('rejects whitespace-only PV names', () => {
    expect(() =>
      parseLaserSpecs(doc([laser({ triggerDelay: ['   '] })])),
    ).toThrow(/laser config is invalid/)
  })

  it('defaults units to an empty map when the file specifies none', () => {
    expect(parseLaserSpecs(doc([laser()]))[0].units).toEqual({})
  })

  it('merges per-laser unit overrides over the module-wide defaults', () => {
    const [spec] = parseLaserSpecs(
      docWithUnits({ regenTemp: '°C', triggerDelay: 'ns' }, [
        laser({ units: { regenTemp: 'K' } }),
      ]),
    )
    expect(spec.units).toEqual({ regenTemp: 'K', triggerDelay: 'ns' })
  })

  it('applies module-wide units to every laser', () => {
    const specs = parseLaserSpecs(
      docWithUnits({ attenuator: 'counts' }, [
        laser({ id: 'NLA' }),
        laser({ id: 'NLB' }),
      ]),
    )
    expect(specs.map((s) => s.units.attenuator)).toEqual(['counts', 'counts'])
  })

  it('rejects an unknown unit key', () => {
    expect(() =>
      parseLaserSpecs(docWithUnits({ regenTemperature: '°C' }, [laser()])),
    ).toThrow(/laser config is invalid/)
  })

  it('rejects malformed YAML with a readable message', () => {
    expect(() => parseLaserSpecs('lasers: [unclosed')).toThrow(/not valid YAML/)
  })
})
