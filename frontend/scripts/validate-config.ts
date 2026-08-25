/**
 * Validate a zone-config directory (CSI-861) — the check the controls team's
 * config repo runs in CI, and a handy local pre-flight before a deploy:
 *
 *   npm run validate:config -- --dir ../eli-hmi-config --all
 *   npm run validate:config -- --dir ../eli-hmi-config --zone test
 *
 * Reuses the app's REAL loader + zod validation (`zone-config-loader.ts` via
 * CONFIG_DIR, incl. the zone-code filename rule and the symlink-safe module
 * ref resolution, plus the superRefine checks JSON Schema cannot express:
 * duplicate PVs, nav ⊆ allowedRoutes, module-ref presence). No re-implemented
 * rules — what passes here is exactly what the container accepts at startup.
 * Reports every invalid zone, then exits non-zero if there was any.
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'

function usage(): never {
  console.error(
    'usage: validate-config --dir <config-dir> (--all | --zone <code>)',
  )
  process.exit(2)
}

const args = process.argv.slice(2)
function argValue(flag: string): string | undefined {
  const i = args.indexOf(flag)
  if (i < 0) return undefined
  const value = args[i + 1]
  // `--dir --all` must be a usage error, not dir === '--all'.
  if (value === undefined || value.startsWith('--')) usage()
  return value
}

async function main(): Promise<void> {
  const dir = argValue('--dir')
  const zoneArg = argValue('--zone')
  const all = args.includes('--all')
  if (!dir || (!all && !zoneArg) || (all && zoneArg)) usage()

  const configDir = resolve(dir)
  const zonesDir = join(configDir, 'zones')
  if (!existsSync(zonesDir)) {
    console.error(`no zones/ directory in ${configDir}`)
    process.exit(2)
  }

  // Point the app loader at the directory under validation, then import it —
  // the loader reads CONFIG_DIR through getConfigDir() on every call.
  process.env.CONFIG_DIR = configDir
  const { loadZoneFile, ZONE_CODE_RE } =
    await import('../src/lib/settings/zone-config-loader')
  const { listReferencedModuleConfigs, validateReferencedModuleConfigs } =
    await import('../src/lib/settings/module-config-validation')

  let failures = 0
  const fail = (name: string, message: string): void => {
    failures++
    console.error(`✗ ${name}: ${message}`)
  }

  let zoneCodes: string[]
  if (all) {
    zoneCodes = []
    for (const entry of readdirSync(zonesDir).sort()) {
      // Anything in zones/ the runtime would not pick up is a hard error — a
      // silently skipped file (prod.yml, typo'd stem) must not validate green.
      if (!entry.endsWith('.yaml')) {
        fail(entry, `not a .yaml file — the app only loads zones/<code>.yaml`)
        continue
      }
      const stem = basename(entry, '.yaml')
      if (!ZONE_CODE_RE.test(stem)) {
        fail(
          entry,
          `invalid zone code "${stem}" — allowed characters: letters, digits, "_", "-"`,
        )
        continue
      }
      zoneCodes.push(stem)
    }
  } else {
    zoneCodes = [zoneArg as string]
  }

  const referenced = new Set<string>()
  for (const zoneCode of zoneCodes) {
    try {
      const zone = loadZoneFile(zoneCode)
      const moduleReferences = listReferencedModuleConfigs(zone)
      // Record references before parsing: a malformed referenced file is a
      // validation failure, not an orphan as well.
      for (const { config } of moduleReferences) {
        referenced.add(resolve(configDir, config))
      }
      validateReferencedModuleConfigs(zone)

      console.log(`✓ ${zoneCode}`)
    } catch (e) {
      fail(zoneCode, (e as Error).message)
    }
  }

  // Non-fatal hygiene warnings (--all only — a single-zone run can't know
  // what the other zones reference, and may run against a partial checkout).
  if (all) {
    for (const orphan of findUnreferencedModuleFiles(configDir, referenced)) {
      console.warn(`⚠ ${orphan}: not referenced by any zone`)
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} problem(s) found`)
    process.exit(1)
  }
  console.log(`\nall ${zoneCodes.length} zone(s) valid`)
}

function findUnreferencedModuleFiles(
  configDir: string,
  referenced: Set<string>,
): string[] {
  const modulesDir = join(configDir, 'modules')
  if (!existsSync(modulesDir)) return []
  const orphans: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry.endsWith('.yaml') && !referenced.has(full)) {
        orphans.push(relative(configDir, full))
      }
    }
  }
  walk(modulesDir)
  return orphans
}

void main()
