import 'server-only'

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseLaserSpecs, type LaserSpec } from './schema'

/**
 * Server-only loader for the L4 OPCPA per-laser config. Reads + validates
 * `lasers.yaml` and returns resolved `LaserSpec[]`. Called from the server
 * `page.tsx`, which Next statically prerenders — so this runs at `next build`
 * and an invalid config fails the build (not a runtime 500).
 *
 * Path is resolved from `process.cwd()` (the project root, `frontend/`, under
 * `next build`/`dev`/`start` and vitest). Next bundles server components, so an
 * `import.meta.url`-relative read would point at the compiled chunk, not the
 * source file — `process.cwd()` is the reliable anchor. For
 * `output: 'standalone'`, `next.config.ts`'s `outputFileTracingIncludes` copies
 * the YAML to the same relative path.
 *
 * The actual parse/validation lives in `schema.ts` (no `server-only`), so it
 * stays unit-testable from a plain string.
 */
const YAML_PATH = join(
  process.cwd(),
  'src/app/(modules)/l4-opcpa/config/lasers.yaml',
)

export function loadLaserSpecs(): LaserSpec[] {
  return parseLaserSpecs(readFileSync(YAML_PATH, 'utf8'))
}
