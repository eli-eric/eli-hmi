/**
 * Schema + parser for the L4 OPCPA per-laser config
 * (`config/zones/<ZONE_CODE>.yaml`, one file per zone).
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
 * delay in ns, a waveform name, a YDFA current — so a configured `value`
 * would be silently discarded. Rejected in validation rather than ignored.
 */
const OPERATOR_VALUED_COMMANDS: readonly LaserCommand[] = [
  'SET_DELAY',
  'LOAD_WAVEFORM',
  'SEND_YDFA_CURRENT',
]

/**
 * One signal: the PV, and what the panel should do with it.
 *
 * A reading is one thing, so it is configured in one place — the row's
 * wording, its rounding and its unit live in the same `pvs:` entry as the name
 * they describe. They used to be three parallel blocks keyed by role, which
 * meant four places to look for one readout and two vocabularies to keep in
 * step (the bias row's PVs were `modboxMbc1/2` while its label was
 * `biasValue`).
 *
 * A bare string is the shorthand for `{pv}`, which is what most signals are.
 */
const signal = z.union([
  pvName,
  z.strictObject({
    pv: pvName.describe('Full EPICS PV name (from controls).'),
    label: label
      .optional()
      .describe(
        "What this row is called. Defaults to the reference laser's wording, which names NL2's hardware — set it on every laser whose device ids differ.",
      ),
    units: label
      .optional()
      .describe(
        "Engineering unit. Rarely needed: the component knows what each reading is measured in and the record's own EGU wins over that. This is the correction for a device reporting the wrong one.",
      ),
    format: valueFormatSchema
      .optional()
      .describe(
        'Display rounding: decimal places, or a {format, toFixed|toPrecision|toExponential} block. Display only — it never changes what is written.',
      ),
  }),
])

type RawSignal = z.infer<typeof signal>
type SignalOptions = {
  label?: string
  units?: string
  format?: FormatConfig[FormatRole]
}

/** The PV half of either form. */
const signalPv = (entry: RawSignal): string =>
  typeof entry === 'string' ? entry : entry.pv

/** The presentation half, empty for the shorthand. */
const signalOptions = (entry: RawSignal): SignalOptions =>
  typeof entry === 'string' ? {} : entry

/**
 * What each row on the panel is called, keyed by the role the row plays.
 *
 * Several of these default to NL2's own device ids (`PHD1K000:49/Mean`,
 * `Regen SY3PL50M:32`) because that is what the reference laser's operators
 * read them by — but the next laser along has different hardware with
 * different ids, and a row labelled with another laser's device is worse than
 * no label at all. A role means the same thing on every laser; the words do
 * not, so they are config.
 */
export const LABEL_DEFAULTS = {
  sequencer: 'Sequencer',
  overview: 'Overview',
  shutter: 'Shutter Position',
  phdMean: 'PHD1K000:49/Mean',
  regenState: 'Regen SY3PL50M:32',
  regenTemp: 'Regen Temp TK6:44',
  phd2Mean: 'PHD1K000:48/Mean',
  attenuator: 'Atten. SM5:ATT1:51',
  flashlampsState: 'Flashlamps State',
  triggerDelay: 'Trigger Delay',
  modboxState: 'Modbox State',
  biasValue: 'Bias Value MBC1 | MBC2',
  waveformPreset: 'Waveform Preset',
  waveformLatest: 'Waveform Latest',
} as const

/**
 * Which row each `pvs:` entry may rename. A row backed by one PV is named
 * where that PV is named; the three that differ are named after the record
 * rather than after what the row shows.
 *
 * The rows left out — Overview, Flashlamps State, Trigger Delay, Modbox State,
 * Bias Value — name a cluster rather than a device. No laser's hardware
 * appears in them, so they are the component's words and not configuration.
 */
const NAMEABLE_ROWS = {
  shutter: 'shutter',
  phdMean: 'phdMean',
  regenState: 'regenState',
  regenTemp: 'regenTemp',
  phd2Mean: 'phd2Mean',
  attenuator: 'attenuator',
  loadedWaveform: 'waveformPreset',
  latestWaveform: 'waveformLatest',
} as const satisfies Record<string, LabelRole>

/**
 * What each reading is measured in. Intrinsic to the signal, not to the
 * station: every zone's config carried the same seven lines before this. A
 * record's own EGU still wins — this is what shows when it has none.
 */
export const UNIT_DEFAULTS: Readonly<UnitsConfig> = {
  regenTemp: '°C',
  triggerDelay: 'ns',
  modboxMbc1: 'mV',
  modboxMbc2: 'mV',
  chillerFlow: 'l/min',
  chillerTemp: '°C',
  chillerLevel: '%',
}

/**
 * Rounding that follows from what the record is rather than from local taste:
 * a bias controller reports whole millivolts.
 */
export const FORMAT_DEFAULTS: Readonly<FormatConfig> = {
  modboxMbc1: { format: 'fixed', toFixed: 0 },
  modboxMbc2: { format: 'fixed', toFixed: 0 },
  // Unrounded: a photodiode mean is the reading an operator compares shot to
  // shot, so the cell shows exactly what the record sent rather than a
  // three-decimal view of it.
  phdMean: { format: 'raw' },
  phd2Mean: { format: 'raw' },
  // A chiller cell is ~3.9rem wide, so every digit has to earn its place: a
  // loop temperature is read to a hundredth, and a water level is a whole
  // percent — a thousandth of one is three characters of noise.
  chillerTemp: { format: 'fixed', toFixed: 2 },
  chillerLevel: { format: 'fixed', toFixed: 0 },
  // Two decimals, not the shared three: more digits than a regen loop's sensor
  // can mean, and a station reading 22.456 invites a conclusion about the
  // third one.
  regenTemp: { format: 'fixed', toFixed: 2 },
}

/** The unit for somewhere there is no reading to ask — a column header. */
export const shownUnit = (
  units: Readonly<UnitsConfig>,
  role: UnitRole,
): string | undefined => units[role] ?? UNIT_DEFAULTS[role]

/**
 * One sequence the control system can run, as the Sequencer row lists it.
 *
 * A real device needs only the name and the PV: its control system sets that
 * PV while the sequence runs, and the panel reads it. `command` is for the
 * deployments that have no control system — the mock backend — where nothing
 * would otherwise move the PV. Omit it everywhere else.
 */
const sequenceSchema = z.strictObject({
  label: label.describe('Sequence name, e.g. "Start Laser".'),
  pv: pvName.describe("This sequence's state PV (1 = RUNNING, 0 = IDLE)."),
  command: z
    .enum(LASER_COMMANDS)
    .optional()
    .describe(
      'Mock backend only: the command whose press holds this sequence at RUNNING. A real control system does that itself, so a real zone leaves this out.',
    ),
})

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
export const unitsSchema = z
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
export const formatSchema = z
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
        connection: signal.describe('Connection bool (Overview CONN).'),
        fullPower: signal.describe('At-full-power bool (Overview FULLP).'),
        shutter: signal.describe(
          'Shutter position bool (read + direct write).',
        ),
        phdMean: signal.describe('PHD mean intensity readout.'),
        regenState: signal.describe('Regen status string.'),
        regenTemp: signal.describe('Regen temperature readout.'),
        phd2Mean: signal
          .optional()
          .describe(
            'Second PHD mean readout. Omit on a laser that has one photodiode: the row goes with it.',
          ),
        attenuator: signal.describe('Attenuator value (read + direct write).'),
        loadedWaveform: signal
          .optional()
          .describe(
            'Current waveform preset. Belongs to the Modbox, so it is required alongside `modbox` and omitted only together with it.',
          ),
        latestWaveform: signal
          .optional()
          .describe(
            'Previous waveform name shown in Waveform Latest after a new preset is applied.',
          ),
        modboxMbc1: signal
          .optional()
          .describe('Modbox MBC1 bias readout (Bias Value row).'),
        modboxMbc2: signal
          .optional()
          .describe('Modbox MBC2 bias readout (Bias Value row).'),
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
    sequences: z
      .array(sequenceSchema)
      .default([])
      .describe(
        'Sequences this laser can run. Omitted or empty hides the Sequencer section; the row above them reads RUNNING while any of them does.',
      ),
    modbox: z
      .array(mappedPv)
      .default([])
      .describe(
        'Modbox state indicators (label + PV, optional per-value display text). Omitted or empty on a laser with no Modbox, which hides the whole section; a laser that has one shows every Modbox row, so `pvs.loadedWaveform` is required alongside it.',
      ),
    delayPresets: z
      .array(z.number().int())
      .describe(
        'Trigger-delay preset values (ns) offered by the Set Trigger Delay control.',
      ),
    waveformsUrl: z
      .url()
      .optional()
      .describe(
        "Absolute URL of this laser's waveform catalog, e.g. https://modbox-nl2.lcs.local/api/waveforms. Served by the modbox itself, so it differs per laser; the browser fetches it directly and expects a JSON array of names. Omit to fall back to the gateway's own /waveforms (what the mock backend serves).",
      ),
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
    // A Modbox is one device, not a bag of optional rows: either the laser
    // has one — and then it has everything a Modbox has, including the
    // waveform record the section always shows — or it has none and the
    // section is absent. A `modbox` list with no waveform PV is a
    // half-configured screen that would render a row reading `<>` for a
    // record nobody named.
    if (laser.modbox.length > 0 && !laser.pvs.loadedWaveform) {
      ctx.addIssue({
        code: 'custom',
        message: `laser ${laser.id}: pvs.loadedWaveform is required when the laser has a modbox (omit "modbox" for a laser that has none)`,
        path: ['pvs', 'loadedWaveform'],
      })
    }
  })
  .superRefine((laser, ctx) => {
    // Catch the most common edit mistake: two signals pointing at the same PV
    // (copy a block, forget to change the name). Real PV names are unique per
    // signal, so a duplicate is almost certainly a typo. This is design-aligned
    // (does not assume any naming convention) — it cannot catch a *wrong but
    // unique* name, which only the live system / mock can reveal as `<>`.
    const all = [
      ...Object.values(laser.pvs).map((entry) =>
        entry === undefined ? undefined : signalPv(entry),
      ),
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
      ...laser.sequences.map((s) => s.pv),
    ]
    const seen = new Set<string>()
    const dupes = new Set<string>()
    for (const name of all) {
      if (name === undefined) continue
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
export type LabelRole = keyof typeof LABEL_DEFAULTS
/** Row labels after defaults are filled in: every role has a word. */
export type ResolvedLabels = Readonly<Record<LabelRole, string>>

/**
 * Resolved per-laser config consumed by the UI (`id` renamed to `laser`).
 * The raw `commands` map is normalised into two views: `commands` (the keys —
 * feeds the visibility gate unchanged) and `commandTargets` (the real
 * overrides as `{pvName, value}`; placeholder entries are dropped so
 * `makeCommandPv` falls back to `CMD_<laser>_<NAME>` for them).
 */
/** Each signal as the UI consumes it: the PV name, with its presentation
 * already lifted out into the resolved `units` / `format` / `labels` below. */
type PvNames = {
  readonly [
    R in keyof RawLaserConfig['pvs']
  ]: undefined extends RawLaserConfig['pvs'][R] ? string | undefined : string
}

export type LaserSpec = Omit<RawLaserConfig, 'id' | 'commands' | 'pvs'> & {
  readonly pvs: PvNames
  readonly laser: string
  readonly commands: readonly LaserCommand[]
  readonly commandTargets: Readonly<
    Partial<Record<LaserCommand, CommandTarget>>
  >
  /** Module-wide units with this laser's overrides merged over them. */
  readonly units: Readonly<UnitsConfig>
  /** Module-wide formats with this laser's overrides merged over them. */
  readonly format: Readonly<FormatConfig>
  /** Every row label, defaults filled in — the UI never falls back itself. */
  readonly labels: ResolvedLabels
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

  rejectTheBlocksThatWereSplitUp(data, name)

  const result = configSchema.safeParse(data)
  if (!result.success) {
    throw new Error(`${name} is invalid:\n${z.prettifyError(result.error)}`)
  }

  return result.data.lasers.map(({ id, commands, pvs: rawPvs, ...rest }) => {
    // The PV names on one side, what each signal says about itself on the
    // other, so the panel keeps reading `spec.pvs.phdMean` as a name.
    const pvs = Object.fromEntries(
      Object.entries(rawPvs).map(([role, entry]) => [
        role,
        entry === undefined ? undefined : signalPv(entry),
      ]),
    ) as { [R in keyof typeof rawPvs]: string }
    const options = Object.entries(rawPvs).flatMap(([role, entry]) =>
      entry === undefined
        ? []
        : ([[role, signalOptions(entry)]] as [string, SignalOptions][]),
    )
    const pick = <T>(
      read: (o: SignalOptions) => T | undefined,
    ): Record<string, T> =>
      Object.fromEntries(
        options.flatMap(([role, o]) => {
          const value = read(o)
          return value === undefined ? [] : [[role, value]]
        }),
      )
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
    // A row backed by one PV is named where that PV is named; the rest are
    // the component's words. Resolved here rather than in each row, so the
    // panel can simply print what it is given.
    const labels: Record<LabelRole, string> = { ...LABEL_DEFAULTS }
    for (const [role, row] of Object.entries(NAMEABLE_ROWS) as [
      string,
      LabelRole,
    ][]) {
      const named = options.find(([r]) => r === role)?.[1].label
      if (named) labels[row] = named
    }

    return {
      laser: id,
      ...rest,
      pvs,
      commands: entries.map(([command]) => command),
      commandTargets,
      // Configured units only: the record's own EGU sits between these and
      // `UNIT_DEFAULTS`, and is applied where the reading is.
      units: pick((o) => o.units) as UnitsConfig,
      format: { ...FORMAT_DEFAULTS, ...pick((o) => o.format) } as FormatConfig,
      labels,
    }
  })
}

/**
 * `units:`, `format:` and `labels:` were three parallel blocks keyed by role,
 * which put one readout in four places and two vocabularies. A config still
 * written that way is refused by name, because silently ignoring it would
 * leave a screen rendering something nobody asked for.
 */
const MOVED_BLOCKS: Record<string, string> = {
  units: 'units',
  format: 'format',
  labels: 'label',
}

/**
 * Keys that no longer describe anything, with what replaced them. A screen
 * that still carries one is told so rather than quietly losing a row.
 */
const RETIRED_PVS: Record<string, string> = {
  sequencerRunning:
    'the Sequencer row now reads RUNNING while any of the `sequences:` below it does, so it needs no PV of its own',
}

function rejectTheBlocksThatWereSplitUp(data: unknown, name: string): void {
  const places: [string, unknown][] = [['', data]]
  if (data && typeof data === 'object' && Array.isArray((data as A).lasers)) {
    for (const laser of (data as A).lasers as unknown[]) {
      places.push([` of laser ${(laser as A)?.id ?? '?'}`, laser])
    }
  }
  for (const [where, block] of places) {
    if (!block || typeof block !== 'object') continue
    const pvs = (block as A).pvs
    if (pvs && typeof pvs === 'object') {
      for (const [retired, why] of Object.entries(RETIRED_PVS)) {
        if (retired in (pvs as A)) {
          throw new Error(`${name}: \`pvs.${retired}\`${where}: ${why}`)
        }
      }
    }
    for (const [key, moved] of Object.entries(MOVED_BLOCKS)) {
      if (key in (block as A)) {
        throw new Error(
          `${name}: \`${key}:\`${where} is no longer a block of its own. ` +
            `Write \`${moved}:\` inside each \`pvs:\` entry, beside the PV it ` +
            `describes — \`pvs: {regenTemp: {pv: …, ${moved}: …}}\`. Units and ` +
            `rounding that follow from the signal itself are now the ` +
            `component's, so most lasers need neither.`,
        )
      }
    }
  }
}

type A = Record<string, unknown>
