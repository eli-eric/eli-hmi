/**
 * Schema + parser for the L4 OPCPA per-laser config (`lasers.yaml`).
 *
 * The config holds the **full PV name** for every signal — exactly the strings
 * the controls team / EPICS gateway provides (e.g. `SY3PL50M:32`). The frontend
 * does NOT assemble PV names from prefixes + ids any more; it reads them
 * verbatim from here. Only command PVs (`CMD_<laser>_<NAME>`) are still built in
 * code, because a command maps to a backend sequence of writes, not one PV.
 *
 * One zod schema is the single source for both the `LaserSpec` type the UI
 * consumes and runtime validation (`.strict()` rejects unknown keys; duplicate
 * ids rejected). The file format is documented in prose in
 * `eli-hmi-config/modules/l4-opcpa/README.md`.
 *
 * Free of `server-only` / `fs` so it stays unit-testable from a plain string;
 * the file read lives in `load-laser-specs.ts`.
 */

import { z } from 'zod'
import { parse as parseYaml } from 'yaml'
import { LASER_COMMANDS, type LaserCommand } from '../lib/pv-names'

// `.trim()` before `.min(1)` so a whitespace-only string (a common
// copy/paste/edit slip) is rejected rather than passing validation and then
// failing at runtime as a subscription to an effectively empty PV.
const pvName = z.string().trim().min(1)
const label = z.string().trim().min(1)

const labeledPv = z.strictObject({
  label: label.describe('Display label shown in the UI.'),
  pv: pvName.describe('Full EPICS PV name (from controls).'),
})

const chillerSchema = z.strictObject({
  label: label.describe('Chiller display label, e.g. PS1225:11.'),
  flow: pvName.describe('Flow readout PV.'),
  temp: pvName.describe('Temperature readout PV.'),
  level: pvName.describe('Water-level readout PV.'),
})

export const rawLaserSchema = z.strictObject({
  id: label.describe(
    'Laser id, e.g. NL2. Panel title; also the <LASER> in command PVs (CMD_<id>_<NAME>).',
  ),
  pvs: z
    .strictObject({
      connection: pvName.describe('Connection bool (Overview CONN).'),
      fullPower: pvName.describe('At-full-power bool (Overview FULLP).'),
      shutter: pvName.describe('Shutter position bool (read + direct write).'),
      phdMean: pvName.describe('PHD mean intensity readout.'),
      regenState: pvName.describe('Regen on/off bool.'),
      regenTemp: pvName.describe('Regen temperature readout.'),
      phd2Mean: pvName.describe('Second PHD mean readout.'),
      attenuator: pvName.describe('Attenuator value (read + direct write).'),
      loadedWaveform: pvName.describe('Current waveform preset.'),
      latestWaveform: pvName
        .optional()
        .describe('Previous waveform name shown in Waveform Latest after a new preset is applied.'),
      modboxMbc1: pvName
        .optional()
        .describe('Modbox MBC1 readout (Modbox State row).'),
      modboxMbc2: pvName
        .optional()
        .describe('Modbox MBC2 readout (Modbox State row).'),
      sequencerRunning: pvName
        .optional()
        .describe('Sequencer running bool (Sequencer row: 1=RUNNING, 0=IDLE).'),
    })
    .describe('Single-signal read/write PVs.'),
  triggerDelay: z
    .array(pvName)
    .min(1)
    .describe('Trigger-delay readout PVs; all should read equal (mismatch flagged).'),
  mss: z
    .array(labeledPv)
    .describe('MSS sub-indicators (label + PV) counted in the General overview.'),
  moduleErrors: z
    .array(labeledPv)
    .describe('Module-error indicators (label + PV) counted in the Overview.'),
  chillers: z
    .array(chillerSchema)
    .describe('Chillers. Empty array hides the Chillers section.'),
  flashlamps: z
    .array(labeledPv)
    .describe('Flashlamp channels (label + PV). Empty array hides the Flashlamps section.'),
  modbox: z
    .array(pvName)
    .describe('Modbox state PVs. Empty array hides the Modbox section.'),
  delayPresets: z
    .array(z.number().int())
    .describe('Trigger-delay preset values (ns) offered by the Set Trigger Delay control.'),
  commands: z
    .array(z.enum(LASER_COMMANDS))
    .describe(
      'Commands this laser exposes (closed LASER_COMMANDS vocabulary; map to backend sequences). Unlisted → button hidden.',
    ),
}).superRefine((laser, ctx) => {
  // Catch the most common edit mistake: two signals pointing at the same PV
  // (copy a block, forget to change the name). Real PV names are unique per
  // signal, so a duplicate is almost certainly a typo. This is design-aligned
  // (does not assume any naming convention) — it cannot catch a *wrong but
  // unique* name, which only the live system / mock can reveal as `<>`.
  const all = [
    ...Object.values(laser.pvs),
    ...laser.triggerDelay,
    ...laser.mss.map((m) => m.pv),
    ...laser.moduleErrors.map((m) => m.pv),
    ...laser.chillers.flatMap((c) => [c.flow, c.temp, c.level]),
    ...laser.flashlamps.map((f) => f.pv),
    ...laser.modbox,
  ]
  const seen = new Set<string>()
  const dupes = new Set<string>()
  for (const name of all) {
    if (seen.has(name)) dupes.add(name)
    seen.add(name)
  }
  if (dupes.size > 0) {
    ctx.addIssue({
      code: 'custom',
      message: `laser ${laser.id}: duplicate PV name(s) — likely a copy-paste typo: ${[...dupes].join(', ')}`,
    })
  }
})

export const configSchema = z
  .strictObject({
    lasers: z.array(rawLaserSchema).min(1),
  })
  .superRefine((cfg, ctx) => {
    const seen = new Set<string>()
    cfg.lasers.forEach((laser, i) => {
      if (seen.has(laser.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `duplicate laser id "${laser.id}"`,
          path: ['lasers', i, 'id'],
        })
      }
      seen.add(laser.id)
    })
  })

export type RawLaserConfig = z.infer<typeof rawLaserSchema>
export type ChillerSpec = z.infer<typeof chillerSchema>
export type LabeledPv = z.infer<typeof labeledPv>

/** Resolved per-laser config consumed by the UI (`id` renamed to `laser`). */
export type LaserSpec = Omit<RawLaserConfig, 'id' | 'commands'> & {
  readonly laser: string
  readonly commands: readonly LaserCommand[]
}

/**
 * Parse + validate raw YAML text into `LaserSpec[]`. Throws an `Error` with an
 * operator-readable message on malformed YAML or schema violations.
 */
export function parseLaserSpecs(text: string): LaserSpec[] {
  let data: unknown
  try {
    data = parseYaml(text)
  } catch (e) {
    throw new Error(`lasers.yaml is not valid YAML: ${(e as Error).message}`)
  }

  const result = configSchema.safeParse(data)
  if (!result.success) {
    throw new Error(`lasers.yaml is invalid:\n${z.prettifyError(result.error)}`)
  }

  return result.data.lasers.map(({ id, ...rest }) => ({ laser: id, ...rest }))
}
