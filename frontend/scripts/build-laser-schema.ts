/**
 * Pure builder for `l4-opcpa-lasers.schema.json` — no side effects, so the
 * drift test can import `buildSchema` without triggering a file write. The
 * actual write lives in `gen-schemas.ts` (run via `npm run gen:schema`).
 *
 * Output lands in the repo-root `eli-hmi-config/schemas/` — the config
 * template dir that the controls team copies out as their own repo — so the
 * `# yaml-language-server` lines in the template YAMLs resolve both here and
 * in the copied repo.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { configSchema } from '../src/app/(modules)/l4-opcpa/config/schema'

const HERE = dirname(fileURLToPath(import.meta.url))

export const SCHEMA_PATH = join(
  HERE,
  '../../eli-hmi-config/schemas/l4-opcpa-lasers.schema.json',
)

export function buildSchema(): string {
  const jsonSchema = z.toJSONSchema(configSchema, { io: 'input' })
  return JSON.stringify(jsonSchema, null, 2) + '\n'
}
