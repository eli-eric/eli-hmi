/**
 * Validate a zone-config directory (CSI-861) — the check the controls team's
 * config repo runs in CI, and a handy local pre-flight before a deploy:
 *
 *   npm run validate:config -- --dir ../eli-hmi-config --all
 *   npm run validate:config -- --dir ../eli-hmi-config --zone test
 *
 * Runs the REAL app-side validation (zod schemas incl. the superRefine checks
 * JSON Schema cannot express: duplicate PVs, nav ⊆ allowedRoutes, module-ref
 * presence) plus resolves every referenced module config file. Exits non-zero
 * on the first invalid zone, after reporting all of them.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, isAbsolute, join, resolve, sep } from 'node:path'

import { parseZoneFile } from '../src/lib/settings/zone-schema'
import { parseLaserSpecs } from '../src/app/(modules)/l4-opcpa/config/schema'

function usage(): never {
  console.error(
    'usage: validate-config --dir <config-dir> (--all | --zone <code>)',
  )
  process.exit(2)
}

const args = process.argv.slice(2)
function argValue(flag: string): string | undefined {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}

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

const zoneFiles = all
  ? readdirSync(zonesDir).filter((f) => f.endsWith('.yaml'))
  : [`${zoneArg}.yaml`]
if (zoneFiles.length === 0) {
  console.error(`no zone files found in ${zonesDir}`)
  process.exit(2)
}

/** Mirror of the loader's traversal guard (script is standalone on purpose). */
function readModuleText(relPath: string): string {
  if (isAbsolute(relPath)) {
    throw new Error(`module config reference must be relative: ${relPath}`)
  }
  const full = resolve(configDir, relPath)
  if (full !== configDir && !full.startsWith(configDir + sep)) {
    throw new Error(`module config reference escapes the config dir: ${relPath}`)
  }
  if (!existsSync(full)) {
    throw new Error(`module config not found: ${relPath}`)
  }
  return readFileSync(full, 'utf8')
}

let failures = 0
for (const file of zoneFiles) {
  const zoneCode = basename(file, '.yaml')
  const path = join(zonesDir, file)
  try {
    if (!existsSync(path)) throw new Error(`zone file not found: ${path}`)
    const zone = parseZoneFile(readFileSync(path, 'utf8'), `zones/${file}`)

    const l4 = zone.modules['l4-opcpa']
    if (l4) parseLaserSpecs(readModuleText(l4.config))

    console.log(`✓ ${zoneCode}`)
  } catch (e) {
    failures++
    console.error(`✗ ${zoneCode}: ${(e as Error).message}`)
  }
}

if (failures > 0) {
  console.error(`\n${failures} invalid zone(s)`)
  process.exit(1)
}
console.log(`\nall ${zoneFiles.length} zone(s) valid`)
