/**
 * Pure builder for `lasers.schema.json` — no side effects, so the drift test
 * can import `buildSchema` without triggering a file write. The actual write
 * lives in `gen-laser-schema.ts` (run via `npm run gen:schema`).
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { configSchema } from '../src/app/(modules)/l4-opcpa/config/schema'

const HERE = dirname(fileURLToPath(import.meta.url))

export const SCHEMA_PATH = join(
  HERE,
  '../src/app/(modules)/l4-opcpa/config/lasers.schema.json',
)

export function buildSchema(): string {
  const jsonSchema = z.toJSONSchema(configSchema, { io: 'input' })
  return JSON.stringify(jsonSchema, null, 2) + '\n'
}
