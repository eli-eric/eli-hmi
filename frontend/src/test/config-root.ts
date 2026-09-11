import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { GLOBAL_CONFIG_FILE } from '@/lib/settings/config-loader'
import { moduleConfigPath, type ModuleKey } from '@/lib/settings/zone-schema'

/**
 * Build a throwaway config root for a test, then hand it to `setConfigRootForTests`.
 *
 * These roots are created at run time rather than checked in as fixture files
 * on purpose: `outputFileTracingIncludes` patterns in next.config.ts are
 * matched at ANY depth, so a checked-in `<somewhere>/config/global.yaml` would
 * be traced into the production standalone output alongside the real one.
 */
export class ConfigRoot {
  readonly path: string

  constructor() {
    this.path = mkdtempSync(join(tmpdir(), 'hmi-config-'))
  }

  /** Write `config/global.yaml`. */
  global(yaml: string): this {
    return this.write(GLOBAL_CONFIG_FILE, yaml)
  }

  /** Write one module's config for one zone, at its registry-derived path. */
  module(key: ModuleKey, zoneCode: string, yaml: string): this {
    return this.write(moduleConfigPath(key, zoneCode), yaml)
  }

  write(relPath: string, contents: string): this {
    const full = join(this.path, relPath)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, contents)
    return this
  }

  cleanup(): void {
    rmSync(this.path, { recursive: true, force: true })
  }
}

/** A zone enabling l4-opcpa (labelled) and p3 (reachable but hidden). */
export const GLOBAL_TWO_ZONES = `
zones:
  test:
    title: L4 OPCPA
    modules:
      - { key: l4-opcpa, text: L4 OPCPA Controls }
      - { key: p3 }
  minimal:
    modules:
      - { key: l4fbt, text: L4FBT }
`

/** Missing `modules:` — a schema violation. */
export const GLOBAL_BROKEN = `
zones:
  test:
    title: L4 OPCPA
`
