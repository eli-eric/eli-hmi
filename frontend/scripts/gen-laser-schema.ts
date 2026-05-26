/**
 * Regenerates `lasers.schema.json` from the zod schema in
 * `config/schema.ts`. The committed JSON Schema powers editor autocomplete /
 * inline validation for `lasers.yaml` (via its `# yaml-language-server` line).
 *
 * Run with `npm run gen:schema`. `schema.drift.test.ts` fails if the committed
 * file is out of date.
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { configSchema } from '../src/app/(modules)/l4-opcpa/config/schema'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(
  HERE,
  '../src/app/(modules)/l4-opcpa/config/lasers.schema.json',
)

export function buildSchema(): string {
  const jsonSchema = z.toJSONSchema(configSchema, { io: 'input' })
  return JSON.stringify(jsonSchema, null, 2) + '\n'
}

// Only write when run directly (not when imported by the drift test).
if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(OUT, buildSchema())
  console.log(`wrote ${OUT}`)
}
