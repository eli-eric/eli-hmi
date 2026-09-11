import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { MODULE_KEYS, MODULES, moduleConfigPath } from './zone-schema'

const PROJECT = process.cwd()
const TSX_CLI = join(PROJECT, 'node_modules/tsx/dist/cli.mjs')

/**
 * The CLI reads the config relative to its cwd, so pointing it at a scratch
 * copy means spawning it there. `--tsconfig` is then required: tsx resolves the
 * `@/` alias from the cwd's tsconfig, which the scratch copy does not have.
 */
function run(cwd: string, ...args: string[]) {
  return spawnSync(
    process.execPath,
    [
      TSX_CLI,
      '--tsconfig',
      join(PROJECT, 'tsconfig.json'),
      join(PROJECT, 'scripts/validate-config.ts'),
      ...args,
    ],
    { cwd, encoding: 'utf8' },
  )
}

/**
 * A throwaway copy of the repo's own config, so a test can break one file
 * without touching the working tree. `node_modules` is not copied — the CLI is
 * invoked by absolute path and resolves its imports from the real project.
 */
function withConfigCopy(fn: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'validate-config-'))
  try {
    cpSync(join(PROJECT, 'config'), join(root, 'config'), { recursive: true })
    for (const key of MODULE_KEYS) {
      const rel = join(MODULES[key].dir, 'config/zones')
      cpSync(join(PROJECT, rel), join(root, rel), { recursive: true })
    }
    fn(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('validate-config CLI', () => {
  it('accepts the config this repo actually ships', () => {
    const result = run(PROJECT)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('zone test')
    expect(result.stdout).toMatch(/all 1 zone\(s\) valid/)
  })

  it('prints which file each module resolves to, enabled or not', () => {
    // "Which config does this station get" has to be answerable in one command
    // now that the answer lives in a directory layout rather than the config.
    const result = run(PROJECT)
    expect(result.stdout).toContain(
      `l4-opcpa  ${moduleConfigPath('l4-opcpa', 'test')}`,
    )
    expect(result.stdout).toMatch(/l4-opcpa.*enabled → \/l4-opcpa/)
    expect(result.stdout).toMatch(/p3 .*disabled, validated only/)
  })

  it('fails on a broken module config even when no zone enables it', () => {
    withConfigCopy((root) => {
      // l3bt is not in global.yaml's module list for any zone.
      writeFileSync(join(root, moduleConfigPath('l3bt', 'test')), 'heading: [')
      const result = run(root)
      expect(result.status).toBe(1)
      expect(result.stderr).toMatch(/l3bt.*is not valid YAML/)
    })
  })

  it('fails when an enabled module has no file for the zone', () => {
    withConfigCopy((root) => {
      rmSync(join(root, moduleConfigPath('l4-opcpa', 'test')))
      const result = run(root)
      expect(result.status).toBe(1)
      expect(result.stderr).toMatch(/test\/l4-opcpa: missing config file/)
    })
  })

  it('warns about config for a zone global.yaml does not define', () => {
    withConfigCopy((root) => {
      const orphan = join(root, moduleConfigPath('p3', 'l4'))
      mkdirSync(dirname(orphan), { recursive: true })
      cpSync(join(root, moduleConfigPath('p3', 'test')), orphan)
      const result = run(root)
      expect(result.status).toBe(0)
      expect(result.stderr).toMatch(/config present for zone\(s\) not in/)
      expect(result.stderr).toContain('zone "l4"')
    })
  })

  it('rejects an unknown --zone', () => {
    const result = run(PROJECT, '--zone', 'nope')
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/unknown zone "nope"/)
  })
})
