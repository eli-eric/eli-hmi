/**
 * Regenerates the JSON Schemas in `eli-hmi-config/schemas/` from the zod
 * schemas (zone files + L4 OPCPA laser config). The committed schemas power
 * editor autocomplete / inline validation for the YAMLs (via their
 * `# yaml-language-server` lines) — both in the in-repo template and in the
 * controls team's copied-out config repo.
 *
 * Run with `npm run gen:schema`. This file is only ever executed (never
 * imported), so it writes unconditionally — the drift tests import the pure
 * builders instead, which have no side effects.
 */
import { writeFileSync } from 'node:fs'
import { buildSchema, SCHEMA_PATH } from './build-laser-schema'
import { buildZoneSchema, ZONE_SCHEMA_PATH } from './build-zone-schema'

writeFileSync(SCHEMA_PATH, buildSchema())
console.log(`wrote ${SCHEMA_PATH}`)
writeFileSync(ZONE_SCHEMA_PATH, buildZoneSchema())
console.log(`wrote ${ZONE_SCHEMA_PATH}`)
