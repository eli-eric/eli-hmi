/**
 * Schema + parser for the L4 OPCPA per-laser config (`lasers.yaml`).
 *
 * This module is the single source of truth for the config SHAPE:
 *  - the zod schema validates the YAML (rejects unknown keys, bad types,
 *    drift between chillerIds and CHILLER_* module errors, duplicate ids),
 *  - the `LaserSpec` type the UI consumes is derived from it,
 *  - `lasers.schema.json` (committed, used for editor autocomplete) is
 *    generated from it via `npm run gen:schema`.
 *
 * It is intentionally FREE of `server-only` / `fs` so it can be unit-tested
 * from a plain string. The thin file-reading wrapper lives in
 * `load-laser-specs.ts`.
 */

import { z } from 'zod'
import { parse as parseYaml } from 'yaml'
import { LASER_COMMANDS, type LaserCommand } from '../lib/pv-names'

/** Closed command vocabulary — mirrors the typed builder in `pv-names.ts`. */
const commandSchema = z.enum(LASER_COMMANDS)

/**
 * One laser as written in YAML. Friendly keys (`modboxCount`, `flashlampBoxes`)
 * are mapped onto the TS `LaserSpec` field names in `parseLaserSpecs`.
 * `.strict()` (via strictObject) rejects unknown/misspelled keys.
 */
export const rawLaserSchema = z
  .strictObject({
    id: z
      .string()
      .min(1)
      .describe(
        'Laser id, e.g. NL1. Becomes the <LASER> segment of every PV (BI_<id>_CONN). Panels render in file order.',
      ),
    mssCount: z
      .number()
      .int()
      .min(0)
      .describe(
        'Number of MSS sub-indicators (BI_<id>_MSS_1..N) counted in the General overview bar.',
      ),
    modboxCount: z
      .number()
      .int()
      .min(0)
      .describe(
        'Number of Modbox state indicators (BI_<id>_MODBOX_1..N). 0 hides the Modbox section.',
      ),
    channelsPerBox: z
      .number()
      .int()
      .min(1)
      .describe(
        'Flashlamp channels per box (SI_<id>_FL_<box>_CH1..CHn). Almost always 2.',
      ),
    chillerIds: z
      .array(z.string().min(1))
      .describe(
        'Chiller ids. Each renders a row reading AI_<id>_CHILLER_<cid>_FLOW/TEMP/LEVEL. Empty array hides the Chillers section.',
      ),
    flashlampBoxes: z
      .array(z.string().min(1))
      .describe(
        'Flashlamp box ids (e.g. PS5059:22..28). Empty array hides the Flashlamps section.',
      ),
    delayPresets: z
      .array(z.number().int())
      .describe('Trigger-delay preset values (ns) offered by the Set Trigger Delay control.'),
    moduleErrors: z
      .array(z.string().min(1))
      .describe(
        'Module-error indicator names → BI_<id>_ERR_<name>. Must list every CHILLER_<cid> matching chillerIds, plus non-chiller errors (e.g. REGEN, FLASHLAMPS).',
      ),
    commands: z
      .array(commandSchema)
      .describe(
        'Commands this laser exposes. Buttons for commands not listed are hidden. Values are limited to the closed LASER_COMMANDS vocabulary.',
      ),
  })
  .superRefine((laser, ctx) => {
    // Cross-check: chillerIds and the CHILLER_* entries in moduleErrors must
    // describe the same set — catches the drift of adding a chiller but
    // forgetting its error indicator (or vice versa).
    const expected = new Set(laser.chillerIds.map((id) => `CHILLER_${id}`))
    const actual = new Set(laser.moduleErrors.filter((m) => m.startsWith('CHILLER_')))
    const missing = [...expected].filter((e) => !actual.has(e))
    const extra = [...actual].filter((a) => !expected.has(a))
    if (missing.length || extra.length) {
      ctx.addIssue({
        code: 'custom',
        message: `laser ${laser.id}: chillerIds ${JSON.stringify(
          laser.chillerIds,
        )} do not match CHILLER_* in moduleErrors (missing: ${
          missing.join(', ') || 'none'
        }; extra: ${extra.join(', ') || 'none'})`,
        path: ['moduleErrors'],
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

/** Resolved per-laser topology consumed by the UI (TS field names). */
export interface LaserSpec {
  readonly laser: string
  readonly mssCount: number
  readonly moduleErrors: readonly string[]
  readonly chillerIds: readonly string[]
  readonly boxIds: readonly string[]
  readonly channelsPerBox: number
  readonly delayPresets: readonly number[]
  readonly modboxStateCount: number
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

  return result.data.lasers.map((l) => ({
    laser: l.id,
    mssCount: l.mssCount,
    moduleErrors: l.moduleErrors,
    chillerIds: l.chillerIds,
    boxIds: l.flashlampBoxes,
    channelsPerBox: l.channelsPerBox,
    delayPresets: l.delayPresets,
    modboxStateCount: l.modboxCount,
    commands: l.commands,
  }))
}
