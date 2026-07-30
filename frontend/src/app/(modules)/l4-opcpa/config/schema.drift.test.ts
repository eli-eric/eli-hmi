import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildSchema, SCHEMA_PATH } from '../../../../../scripts/build-laser-schema'

const committed = readFileSync(SCHEMA_PATH, 'utf8')

describe('l4-opcpa-lasers.schema.json', () => {
  it('is up to date with the zod schema (run `npm run gen:schema` if this fails)', () => {
    expect(committed).toBe(buildSchema())
  })
})
