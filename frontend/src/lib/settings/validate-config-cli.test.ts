import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const TSX_CLI = join(process.cwd(), 'node_modules/tsx/dist/cli.mjs')
const FIXTURE_DIR = join(
  process.cwd(),
  'src/lib/settings/__fixtures__/config-dir',
)

describe('validate-config CLI', () => {
  it('validates every module reference and does not misreport a broken reference as orphaned', () => {
    const result = spawnSync(
      process.execPath,
      [TSX_CLI, 'scripts/validate-config.ts', '--dir', FIXTURE_DIR, '--all'],
      { cwd: process.cwd(), encoding: 'utf8' },
    )

    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(
      /modules\.p3 \(modules\/p3\/invalid\.yaml\)[\s\S]*invalid/,
    )
    expect(result.stderr).not.toContain(
      'modules/p3/invalid.yaml: not referenced by any zone',
    )
  })
})
