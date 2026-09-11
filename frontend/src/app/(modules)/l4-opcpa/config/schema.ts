/**
 * Schema + parser for the L4 OPCPA per-laser config (`lasers.yaml`).
 *
 * The config holds the **full PV name** for every signal — exactly the strings
 * the controls team / EPICS gateway provides (e.g. `SY3PL50M:32`). The frontend
 * does NOT assemble PV names from prefixes + ids any more; it reads them
 * verbatim from here. Command write targets are configurable too (`commands`
 * map): a real PV is written directly — with the value to write, when it is
 * not the default `1` — while a placeholder (value == key) falls back to the
 * code-built `CMD_<laser>_<NAME>` backend-sequence trigger.
 *
 * One zod schema is the single source for both the `LaserSpec` type the UI
 * consumes and runtime validation (`.strict()` rejects unknown keys; duplicate
 * ids rejected). The file format is documented in prose in `./README.md`.
 *
 * Free of `server-only` / `fs` so it stays unit-testable from a plain string;
 * the file read lives in `load-laser-specs.ts`.
 */

import { z } from 'zod'
import { parse as parseYaml } from 'yaml'

import { valueFormatSchema } from '@/lib/utils/value-format-schema'
import {
  LASER_COMMANDS,
  type CommandTarget,
  type LaserCommand,
} from '../lib/pv-names'

// `.trim()` before `.min(1)` so a whitespace-only string (a common
// copy/paste/edit slip) is rejected rather than passing validation and then
// failing at runtime as a subscription to an effectively empty PV.
const pvName = z.string().trim().min(1)
const label = z.string().trim().min(1)

const labeledPv = z.strictObject({
  label: label.describe('Display label shown in the UI.'),
  pv: pvName.describe('Full EPICS PV name (from controls).'),
})

/**
 * A labelled PV whose raw value is translated for display: `{0: OFF, 1: ON}`.
 *
 * Modbox states and MSS indicators are booleans, and a column of bare 1s and
 * 0s asks the operator to remember which is which. The wording is config, not
 * code, because what a bit means is domain knowledge that belongs beside the
 * PV it describes — and no single pair fits all of them (a Modbox subsystem is
 * ON/OFF, a software key ENABLED/DISABLED, an MSS interlock YES/NO).
 *
 * Keys are matched against the value converted to a string, so this works for
 * an enum's index (`{0: STANDBY}`) as well as a bit. A value with no entry
 * falls through to its raw form rather than disappearing — an unexpected
 * reading must stay visible.
 */
const mappedPv = labeledPv.extend({
  values: z
    .record(z.string(), label)
    .optional()
    .describe(
      'Display text per raw value, e.g. {0: OFF, 1: ON}. Unmapped values are shown as-is.',
    ),
})

/**
 * A command's write target: either just the PV (shorthand — the write is the
 * conventional `1`), or an explicit `{pv, value}` when the device expects
 * something else, e.g. `MODBOX_OFF: {pv: MOD:BOX:MODE, value: Sleep}`.
 */
const commandTarget = z.union([
  pvName,
  z.strictObject({
    pv: pvName.describe('PV the write goes to.'),
    value: z
      .union([z.string().trim().min(1), z.number()])
      .optional()
      .describe('Value written when the button is pressed. Defaults to 1.'),
  }),
])

type RawCommandTarget = z.infer<typeof commandTarget>

/** The PV half of either form. */
const targetPv = (target: RawCommandTarget): string =>
  typeof target === 'string' ? target : target.pv

/**
 * Commands whose written value comes from the operator at press time — a
 * delay in ns, a waveform name — so a configured `value` would be silently
 * discarded. Rejected in validation rather than ignored.
 */
const OPERATOR_VALUED_COMMANDS: readonly LaserCommand[] = [
  'SET_DELAY',
  'LOAD_WAVEFORM',
]

const chillerSchema = z.strictObject({
  label: label.describe('Chiller display label, e.g. PS1225:11.'),
  flow: pvName.describe('Flow readout PV.'),
  temp: pvName.describe('Temperature readout PV.'),
  level: pvName.describe('Water-level readout PV.'),
})

/**
 * Engineering units for the numeric readouts, keyed by the signal each one
 * annotates (the `pvs.*` key, the top-level field, or the chiller quantity).
 * Every key is optional: a missing one falls back to the PV's own metadata and
 * then to the component's default (see `lib/websocket/units.ts`). Booleans,
 * status strings and bit indicators take no unit, so they have no key here.
 */
const unitsSchema = z
  .strictObject({
    phdMean: label.optional(),
    phd2Mean: label.optional(),
    regenTemp: label.optional(),
    attenuator: label.optional(),
    modboxMbc1: label.optional(),
    modboxMbc2: label.optional(),
    triggerDelay: label.optional(),
    chillerFlow: label.optional(),
    chillerTemp: label.optional(),
    chillerLevel: label.optional(),
  })
  .describe(
    'Engineering units per numeric signal. Set once at the top level and/or override per laser; the config value wins over the PV metadata and the component default.',
  )

/**
 * How each numeric readout is rounded, keyed by the same signal roles as
 * `units` above — the two are deliberately parallel, and every numeric readout
 * on the panel has a role here.
 *
 * Roles rather than PV names: a per-PV map would have to be rewritten in every
 * zone's file, since the PV names are exactly what differs between stations,
 * whereas a role means the same thing everywhere. Per-laser overrides still
 * target one specific PV.
 *
 * Values are decimal places (`regenTemp: 1`) or a full
 * `{format, toFixed|toPrecision|toExponential}` object.
 */
const formatSchema = z
  .strictObject({
    phdMean: valueFormatSchema.optional(),
    phd2Mean: valueFormatSchema.optional(),
    regenTemp: valueFormatSchema.optional(),
    attenuator: valueFormatSchema.optional(),
    modboxMbc1: valueFormatSchema.optional(),
    modboxMbc2: valueFormatSchema.optional(),
    triggerDelay: valueFormatSchema.optional(),
    chillerFlow: valueFormatSchema.optional(),
    chillerTemp: valueFormatSchema.optional(),
    chillerLevel: valueFormatSchema.optional(),
  })
  .describe(
    'Numeric display format per signal. Set once at the top level and/or override per laser; a role left unset falls back to DEFAULT_VALUE_FORMAT.',
  )

export const rawLaserSchema = z
  .strictObject({
    id: label.describe(
      'Laser id, e.g. NL2. Panel title; also the <LASER> in command PVs (CMD_<id>_<NAME>).',
    ),
    pvs: z
      .strictObject({
        connection: pvName.describe('Connection bool (Overview CONN).'),
        fullPower: pvName.describe('At-full-power bool (Overview FULLP).'),
        shutter: pvName.describe(
          'Shutter position bool (read + direct write).',
        ),
        phdMean: pvName.describe('PHD mean intensity readout.'),
        regenState: pvName.describe('Regen status string.'),
        regenTemp: pvName.describe('Regen temperature readout.'),
        phd2Mean: pvName.describe('Second PHD mean readout.'),
        attenuator: pvName.describe('Attenuator value (read + direct write).'),
        loadedWaveform: pvName.describe('Current waveform preset.'),
        latestWaveform: pvName
          .optional()
          .describe(
            'Previous waveform name shown in Waveform Latest after a new preset is applied.',
          ),
        modboxMbc1: pvName
          .optional()
          .describe('Modbox MBC1 bias readout (Bias Value row).'),
        modboxMbc2: pvName
          .optional()
          .describe('Modbox MBC2 bias readout (Bias Value row).'),
        sequencerRunning: pvName
          .optional()
          .describe(
            'Sequencer running bool (Sequencer row: 1=RUNNING, 0=IDLE).',
          ),
      })
      .describe('Single-signal read/write PVs.'),
    triggerDelay: z
      .array(pvName)
      .min(1)
      .describe(
        'Trigger-delay readout PVs; all should read equal (mismatch flagged).',
      ),
    mss: z
      .array(mappedPv)
      .describe(
        'MSS sub-indicators (label + PV, optional per-value display text) counted in the General overview.',
      ),
    moduleErrors: z
      .array(labeledPv)
      .describe(
        'Module-error indicators (label + PV) counted in the Overview.',
      ),
    chillers: z
      .array(chillerSchema)
      .describe('Chillers. Empty array hides the Chillers section.'),
    flashlamps: z
      .array(labeledPv)
      .describe(
        'Flashlamp channels (label + PV). Empty array hides the Flashlamps section.',
      ),
    modbox: z
      .array(mappedPv)
      .describe(
        'Modbox state indicators (label + PV, optional per-value display text). Empty array hides the Modbox section.',
      ),
    delayPresets: z
      .array(z.number().int())
      .describe(
        'Trigger-delay preset values (ns) offered by the Set Trigger Delay control.',
      ),
    units: unitsSchema
      .optional()
      .describe('Per-laser unit overrides, merged over the top-level `units`.'),
    format: formatSchema
      .optional()
      .describe('Per-laser format overrides, merged over the top-level `format`.'),
    commands: z
      .partialRecord(z.enum(LASER_COMMANDS), commandTarget)
      .describe(
        'Commands this laser exposes, as a map SYMBOL: <write PV> or SYMBOL: {pv, value}. Keys come from the closed LASER_COMMANDS vocabulary; a missing key hides the button. The shorthand writes 1 to the PV; the object form writes `value` instead. A placeholder PV equal to the key means "no real PV yet" and falls back to CMD_<laser>_<SYMBOL>.',
      ),
  })
  .superRefine((laser, ctx) => {
    // Command values: either the placeholder (== key) or something that looks
    // like a real EPICS PV (contains ':'). Anything else is almost certainly a
    // typo (e.g. `ALIGNMENT_MODE: SetAlignmentMode`) that would otherwise be
    // written verbatim and fail only at runtime.
    for (const [command, target] of Object.entries(laser.commands)) {
      const name = targetPv(target)
      if (name !== command && !name.includes(':')) {
        ctx.addIssue({
          code: 'custom',
          message: `laser ${laser.id}: commands.${command}: "${name}" is neither the placeholder "${command}" nor a full PV name (must contain ':')`,
          path: ['commands', command],
        })
      }
      // The operator supplies these values, so a configured one would never
      // be written — say so instead of quietly dropping it.
      if (
        typeof target !== 'string' &&
        target.value !== undefined &&
        OPERATOR_VALUED_COMMANDS.includes(command as LaserCommand)
      ) {
        ctx.addIssue({
          code: 'custom',
          message: `laser ${laser.id}: commands.${command}: takes its value from the operator, so "value" here would never be written`,
          path: ['commands', command, 'value'],
        })
      }
    }
  })
  .superRefine((laser, ctx) => {
    // Catch the most common edit mistake: two signals pointing at the same PV
    // (copy a block, forget to change the name). Real PV names are unique per
    // signal, so a duplicate is almost certainly a typo. This is design-aligned
    // (does not assume any naming convention) — it cannot catch a *wrong but
    // unique* name, which only the live system / mock can reveal as `<>`.
    const all = [
      ...Object.values(laser.pvs),
      // Command PV overrides only — placeholders (value == key) are not PVs.
      // Two commands may legitimately share one PV when they write different
      // values (MODBOX_ON/OFF on a single mode record), so a command target is
      // identified by PV *and* value here; only an exact repeat is a typo.
      ...Object.entries(laser.commands)
        .filter(([command, target]) => targetPv(target) !== command)
        .map(([, target]) =>
          typeof target === 'string'
            ? target
            : `${target.pv}\u0000${target.value ?? 1}`,
        ),
      ...laser.triggerDelay,
      ...laser.mss.map((m) => m.pv),
      ...laser.moduleErrors.map((m) => m.pv),
      ...laser.chillers.flatMap((c) => [c.flow, c.temp, c.level]),
      ...laser.flashlamps.map((f) => f.pv),
      ...laser.modbox.map((m) => m.pv),
    ]
    const seen = new Set<string>()
    const dupes = new Set<string>()
    for (const name of all) {
      if (seen.has(name)) dupes.add(name)
      seen.add(name)
    }
    if (dupes.size > 0) {
      const shown = [...dupes].map((d) => d.split('\u0000')[0])
      ctx.addIssue({
        code: 'custom',
        message: `laser ${laser.id}: duplicate PV name(s) — likely a copy-paste typo: ${shown.join(', ')}`,
      })
    }
  })

export const configSchema = z
  .strictObject({
    units: unitsSchema
      .optional()
      .describe('Module-wide unit defaults for every laser in this file.'),
    format: formatSchema
      .optional()
      .describe('Module-wide format defaults for every laser in this file.'),
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
/** A labelled PV with optional per-value display text; see `mappedPv`. */
export type MappedPv = z.infer<typeof mappedPv>
/** Units by signal role; every role optional. */
export type UnitsConfig = z.infer<typeof unitsSchema>
export type UnitRole = keyof UnitsConfig
/** Numeric display format by signal role; every role optional. */
export type FormatConfig = z.infer<typeof formatSchema>
export type FormatRole = keyof FormatConfig

/**
 * Resolved per-laser config consumed by the UI (`id` renamed to `laser`).
 * The raw `commands` map is normalised into two views: `commands` (the keys —
 * feeds the visibility gate unchanged) and `commandTargets` (the real
 * overrides as `{pvName, value}`; placeholder entries are dropped so
 * `makeCommandPv` falls back to `CMD_<laser>_<NAME>` for them).
 */
export type LaserSpec = Omit<
  RawLaserConfig,
  'id' | 'commands' | 'units' | 'format'
> & {
  readonly laser: string
  readonly commands: readonly LaserCommand[]
  readonly commandTargets: Readonly<
    Partial<Record<LaserCommand, CommandTarget>>
  >
  /** Module-wide units with this laser's overrides merged over them. */
  readonly units: Readonly<UnitsConfig>
  /** Module-wide formats with this laser's overrides merged over them. */
  readonly format: Readonly<FormatConfig>
}

/**
 * Parse + validate raw YAML text into `LaserSpec[]`. Throws an `Error` with an
 * operator-readable message on malformed YAML or schema violations.
 */
export function parseLaserSpecs(
  text: string,
  name = 'laser config',
): LaserSpec[] {
  let data: unknown
  try {
    data = parseYaml(text)
  } catch (e) {
    throw new Error(`${name} is not valid YAML: ${(e as Error).message}`)
  }

  const result = configSchema.safeParse(data)
  if (!result.success) {
    throw new Error(`${name} is invalid:\n${z.prettifyError(result.error)}`)
  }

  const moduleUnits = result.data.units ?? {}
  const moduleFormat = result.data.format ?? {}
  return result.data.lasers.map(({ id, commands, units, format, ...rest }) => {
    const entries = Object.entries(commands) as [
      LaserCommand,
      RawCommandTarget,
    ][]
    const commandTargets = Object.fromEntries(
      entries
        .filter(([command, target]) => targetPv(target) !== command)
        .map(([command, target]): [LaserCommand, CommandTarget] => [
          command,
          typeof target === 'string'
            ? { pvName: target, value: 1 }
            : { pvName: target.pv, value: target.value ?? 1 },
        ]),
    ) as Partial<Record<LaserCommand, CommandTarget>>
    return {
      laser: id,
      ...rest,
      commands: entries.map(([command]) => command),
      commandTargets,
      // Per-laser overrides win over the module-wide defaults.
      units: { ...moduleUnits, ...units },
      format: { ...moduleFormat, ...format },
    }
  })
}
