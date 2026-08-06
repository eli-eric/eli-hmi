import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  buildZoneSchema,
  ZONE_SCHEMA_PATH,
} from '../../../scripts/build-zone-schema'

const committed = readFileSync(ZONE_SCHEMA_PATH, 'utf8')

describe('zone.schema.json', () => {
  it('is up to date with the zod schema (run `npm run gen:schema` if this fails)', () => {
    expect(committed).toBe(buildZoneSchema())
  })
})
