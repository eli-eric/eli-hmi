/**
 * Pure builder for the p3/l3bt/l4fbt module-page config JSON Schema.
 * File output stays in `gen-schemas.ts`; tests can import this without side
 * effects to detect drift between the runtime Zod schema and committed file.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

import { moduleConfigFileSchema } from '../src/lib/modules/module-config-schema'

const HERE = dirname(fileURLToPath(import.meta.url))

export const MODULE_CONFIG_SCHEMA_PATH = join(
  HERE,
  '../../eli-hmi-config/schemas/module-config.schema.json',
)

export function buildModuleConfigSchema(): string {
  const jsonSchema = z.toJSONSchema(moduleConfigFileSchema, { io: 'input' })
  return JSON.stringify(jsonSchema, null, 2) + '\n'
}
