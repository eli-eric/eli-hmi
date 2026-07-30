/**
 * Schema + parser for per-zone config files (`zones/<ZONE_CODE>.yaml` in the
 * config directory, see `zone-config-loader.ts`).
 *
 * A zone file is the single source of truth for one deployment environment:
 * which routes are reachable, what shows up in the top navigation, and where
 * each module's own config file lives (path relative to the config dir root).
 *
 * One zod schema is the single source for: the `ZoneFile` type, runtime
 * validation (`strictObject` rejects unknown keys), and `zone.schema.json`
 * (generated for editor autocomplete via `npm run gen:schema`).
 *
 * Free of `server-only` / `fs` so it stays unit-testable from a plain string;
 * the file read lives in `zone-config-loader.ts`.
 */

import { z } from 'zod'
import { parse as parseYaml } from 'yaml'

import { deepFreeze } from '@/lib/utils/deep-freeze'

/**
 * The one zone-file schema version this app build understands. Bumped on
 * breaking shape changes; a config written for another version fails fast with
 * a readable error instead of half-working. Config + image deploy together.
 */
export const ZONE_SCHEMA_VERSION = 1

/**
 * Route ↔ module-config mapping: if a zone allows the route, it must also say
 * where that module's config file is. Extend when migrating p3/l3bt/l4fbt.
 */
export const MODULE_ROUTES = {
  'l4-opcpa': '/l4-opcpa',
} as const

export type ModuleKey = keyof typeof MODULE_ROUTES

// "/" or "/"-separated non-empty segments — no trailing slash, no empty
// segment. Middleware matches pathnames exactly, so a "/l4-opcpa/" entry
// would validate but never match; reject it here instead.
const routePath = z
  .string()
  .regex(
    /^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/,
    'route must be "/" or "/"-separated segments of lowercase letters, digits and "-" (no trailing slash)',
  )

const moduleRef = z.strictObject({
  config: z
    .string()
    .trim()
    .min(1)
    .describe(
      'Path to this module\'s config file, relative to the config dir root, e.g. modules/l4-opcpa/lasers.yaml.',
    ),
})

const navigationItemSchema = z.strictObject({
  text: z.string().trim().min(1).describe('Label shown in the top navigation.'),
  href: routePath.describe('Route the item links to; must be in allowedRoutes.'),
})

export const zoneFileSchema = z
  .strictObject({
    schemaVersion: z
      .literal(ZONE_SCHEMA_VERSION)
      .describe(
        `Zone-file schema version understood by the app (currently ${ZONE_SCHEMA_VERSION}).`,
      ),
    navigationItems: z
      .array(navigationItemSchema)
      .describe('Items shown in the top navigation, in order.'),
    allowedRoutes: z
      .array(routePath)
      .describe(
        'Routes reachable in this zone; first entry is the home route. Anything else redirects to /no-access.',
      ),
    modules: z
      .strictObject({
        'l4-opcpa': moduleRef
          .optional()
          .describe('L4 OPCPA laser config reference.'),
      })
      .prefault({})
      .describe('Per-module config file references.'),
  })
  .superRefine((zone, ctx) => {
    const allowed = new Set(zone.allowedRoutes)
    if (allowed.size !== zone.allowedRoutes.length) {
      const seen = new Set<string>()
      const dupes = zone.allowedRoutes.filter((r) => {
        const dup = seen.has(r)
        seen.add(r)
        return dup
      })
      ctx.addIssue({
        code: 'custom',
        message: `duplicate allowedRoutes entries: ${[...new Set(dupes)].join(', ')}`,
        path: ['allowedRoutes'],
      })
    }

    zone.navigationItems.forEach((item, i) => {
      if (!allowed.has(item.href)) {
        ctx.addIssue({
          code: 'custom',
          message: `navigation item "${item.text}" points at ${item.href}, which is not in allowedRoutes`,
          path: ['navigationItems', i, 'href'],
        })
      }
    })

    for (const [moduleKey, route] of Object.entries(MODULE_ROUTES)) {
      if (allowed.has(route) && !zone.modules[moduleKey as ModuleKey]) {
        ctx.addIssue({
          code: 'custom',
          message: `route ${route} is allowed but modules.${moduleKey} has no config reference`,
          path: ['modules'],
        })
      }
    }
  })

export type ZoneFile = z.infer<typeof zoneFileSchema>

/**
 * Parse + validate raw YAML text into a `ZoneFile`. Throws an `Error` with an
 * operator-readable message on malformed YAML or schema violations. `name` is
 * used in error messages (e.g. "zones/TESTZ.yaml").
 */
export function parseZoneFile(text: string, name: string): ZoneFile {
  let data: unknown
  try {
    data = parseYaml(text)
  } catch (e) {
    throw new Error(`${name} is not valid YAML: ${(e as Error).message}`)
  }

  const result = zoneFileSchema.safeParse(data)
  if (!result.success) {
    throw new Error(`${name} is invalid:\n${z.prettifyError(result.error)}`)
  }

  // The parsed file is cached for the process lifetime and shared by
  // reference across requests — freeze so mutation fails loudly.
  return deepFreeze(result.data)
}
