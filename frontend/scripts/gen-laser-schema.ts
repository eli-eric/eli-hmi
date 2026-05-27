/**
 * Regenerates `lasers.schema.json` from the zod schema in `config/schema.ts`.
 * The committed JSON Schema powers editor autocomplete / inline validation for
 * `lasers.yaml` (via its `# yaml-language-server` line).
 *
 * Run with `npm run gen:schema`. This file is only ever executed (never
 * imported), so it writes unconditionally — `schema.drift.test.ts` imports the
 * pure `buildSchema` from `build-laser-schema.ts` instead, which has no side
 * effects.
 */
import { writeFileSync } from 'node:fs'
import { buildSchema, SCHEMA_PATH } from './build-laser-schema'

writeFileSync(SCHEMA_PATH, buildSchema())
console.log(`wrote ${SCHEMA_PATH}`)
