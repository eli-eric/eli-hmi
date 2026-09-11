/**
 * Schema + parser for the global config file (`config/global.yaml`).
 *
 * One file is the single source of truth for every deployment environment
 * ("zone"): what the header calls it, and which module pages it turns on. A
 * zone exists iff it is a key under `zones:`.
 *
 * Routes are NOT written in the config — they are derived from the `MODULES`
 * registry below, so a route cannot be misspelled and the three lists that
 * used to say the same thing (navigationItems / allowedRoutes / modules)
 * collapse into one ordered list per zone. Order is menu order, and the first
 * entry is the zone's home route.
 *
 * One zod schema is the single source for both the `GlobalConfig` type and
 * runtime validation (`strictObject` rejects unknown keys).
 *
 * Free of `server-only` / `fs` so it stays unit-testable from a plain string;
 * the file read lives in `config-loader.ts`.
 */

import { z } from 'zod'
import { parse as parseYaml } from 'yaml'

import { deepFreeze } from '@/lib/utils/deep-freeze'

/**
 * Every module page the app knows: its route, and the directory holding its
 * per-zone config. Keeping the keys here as the source of `ModuleKey` makes
 * parser dispatch exhaustive at compile time (see `module-config-validation`).
 *
 * `dir` is relative to the frontend project root (`process.cwd()`).
 */
export const MODULES = {
  'l4-opcpa': { route: '/l4-opcpa', dir: 'src/app/(modules)/l4-opcpa' },
  p3: { route: '/p3-controls', dir: 'src/app/(modules)/p3-controls' },
  l3bt: { route: '/l3bt-controls', dir: 'src/app/(modules)/l3bt-controls' },
  l4fbt: { route: '/l4fbt-controls', dir: 'src/app/(modules)/l4fbt-controls' },
} as const

export type ModuleKey = keyof typeof MODULES

export const MODULE_KEYS = Object.keys(MODULES) as ModuleKey[]

/**
 * Where a module's config for one zone lives. There is no fallback to a
 * shared default file: a zone that enables a module must ship that module's
 * file, because silently serving another station's PV names is worse in a
 * control system than failing the build.
 */
export function moduleConfigPath(key: ModuleKey, zoneCode: string): string {
  return `${MODULES[key].dir}/config/zones/${zoneCode}.yaml`
}

/** Zone codes are free-form but must be usable as a filename stem. */
export const ZONE_CODE_RE = /^[A-Za-z0-9_-]+$/

const zoneModuleSchema = z.strictObject({
  key: z
    .enum(MODULE_KEYS as [ModuleKey, ...ModuleKey[]])
    .describe('Module to enable in this zone; its route comes from MODULES.'),
  text: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      'Label in the top navigation. Omit to make the route reachable but hidden from the menu.',
    ),
})

const zoneSchema = z.strictObject({
  title: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      'Name shown in the header, e.g. "L4 OPCPA". Defaults to DEFAULT_ZONE_TITLE.',
    ),
  modules: z
    .array(zoneModuleSchema)
    .min(1)
    .describe(
      'Modules this zone turns on, in menu order. The first entry is the home route.',
    ),
})

export const globalConfigSchema = z.strictObject({
  zones: z
    .record(z.string().regex(ZONE_CODE_RE), zoneSchema)
    .describe('Every deployment zone, keyed by ZONE_CODE.'),
})

export type ZoneEntry = z.infer<typeof zoneSchema>
export type GlobalConfig = z.infer<typeof globalConfigSchema>

/**
 * Parse + validate raw YAML text into a `GlobalConfig`. Throws an `Error` with
 * an operator-readable message on malformed YAML or schema violations. `name`
 * is used in error messages (e.g. "config/global.yaml").
 */
export function parseGlobalConfig(text: string, name: string): GlobalConfig {
  let data: unknown
  try {
    data = parseYaml(text)
  } catch (e) {
    throw new Error(`${name} is not valid YAML: ${(e as Error).message}`)
  }

  const result = globalConfigSchema.safeParse(data)
  if (!result.success) {
    throw new Error(`${name} is invalid:\n${z.prettifyError(result.error)}`)
  }

  // A module listed twice would put the same route in the menu twice; zod has
  // no built-in for "unique by field", so it is checked here where the error
  // can name the zone and the key.
  for (const [zoneCode, zone] of Object.entries(result.data.zones)) {
    const seen = new Set<string>()
    for (const entry of zone.modules) {
      if (seen.has(entry.key)) {
        throw new Error(
          `${name} is invalid:\n  zone "${zoneCode}" lists module "${entry.key}" more than once`,
        )
      }
      seen.add(entry.key)
    }
  }

  // The parsed file is cached for the process lifetime and shared by
  // reference across requests — freeze so mutation fails loudly.
  return deepFreeze(result.data)
}
