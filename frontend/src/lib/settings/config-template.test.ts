/**
 * Guards the contract the controls team asked for: their config repository —
 * and therefore the in-repo template it is copied from — holds hand-written
 * YAML and nothing else.
 *
 * Both halves regress the same way. A generated `*.schema.json` reappears the
 * moment someone reintroduces a schema-generation step, and a
 * `# yaml-language-server` modeline reappears the moment someone pastes a
 * header from an older file. Neither breaks a build, so without this test both
 * would land unnoticed.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const TEMPLATE_DIR = join(process.cwd(), '..', 'eli-hmi-config')

function walkFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walkFiles(full, acc)
    else acc.push(full)
  }
  return acc
}

describe('eli-hmi-config template', () => {
  const files = walkFiles(TEMPLATE_DIR)

  it('is not empty (guards against a mistyped template path)', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('vendors no generated JSON Schema', () => {
    const schemas = files
      .filter((f) => f.endsWith('.schema.json'))
      .map((f) => relative(TEMPLATE_DIR, f))

    expect(schemas).toEqual([])
  })

  it('has no yaml-language-server modeline in any file', () => {
    const withModeline = files
      .filter((f) => readFileSync(f, 'utf8').includes('yaml-language-server'))
      .map((f) => relative(TEMPLATE_DIR, f))

    expect(withModeline).toEqual([])
  })
})
