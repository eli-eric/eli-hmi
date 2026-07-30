/**
 * Pure builder for `zone.schema.json` — the JSON Schema for per-zone config
 * files (`zones/<ZONE_CODE>.yaml`). Same pattern as `build-laser-schema.ts`:
 * no side effects; the write lives in `gen-schemas.ts`.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { zoneFileSchema } from '../src/lib/settings/zone-schema'

const HERE = dirname(fileURLToPath(import.meta.url))

export const ZONE_SCHEMA_PATH = join(
  HERE,
  '../../eli-hmi-config/schemas/zone.schema.json',
)

export function buildZoneSchema(): string {
  const jsonSchema = z.toJSONSchema(zoneFileSchema, { io: 'input' })
  return JSON.stringify(jsonSchema, null, 2) + '\n'
}
