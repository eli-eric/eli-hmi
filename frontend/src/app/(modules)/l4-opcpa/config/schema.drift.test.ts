import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildSchema } from '../../../../../scripts/build-laser-schema'

const committed = readFileSync(
  join(process.cwd(), 'src/app/(modules)/l4-opcpa/config/lasers.schema.json'),
  'utf8',
)

describe('lasers.schema.json', () => {
  it('is up to date with the zod schema (run `npm run gen:schema` if this fails)', () => {
    expect(committed).toBe(buildSchema())
  })
})
