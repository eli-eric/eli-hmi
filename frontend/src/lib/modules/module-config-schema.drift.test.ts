import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  buildModuleConfigSchema,
  MODULE_CONFIG_SCHEMA_PATH,
} from '../../../scripts/build-module-config-schema'

const committed = readFileSync(MODULE_CONFIG_SCHEMA_PATH, 'utf8')

describe('module-config.schema.json', () => {
  it('is up to date with the zod schema (run `npm run gen:schema` if this fails)', () => {
    expect(committed).toBe(buildModuleConfigSchema())
  })
})
