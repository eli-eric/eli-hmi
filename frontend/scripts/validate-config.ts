/**
 * Validate the in-repo configuration:
 *
 *   npm run validate:config
 *   npm run validate:config -- --zone test
 *
 * Wired as `prebuild`, so a broken config fails `next build` rather than a
 * container at startup. It reuses the app's REAL loader + zod validation — no
 * re-implemented rules, so what passes here is exactly what the app accepts.
 *
 * Three things are checked:
 *
 *  1. `config/global.yaml` parses and validates.
 *  2. Every module a zone turns ON has its `config/zones/<zone>.yaml`. There is
 *     no fallback to a shared default file, so a missing one is an error —
 *     silently serving another station's PV names is worse than failing here.
 *  3. EVERY module config file on disk parses, including files for zones that
 *     are not rolled out yet and modules no zone currently enables. Nothing
 *     escapes validation just because it is not live.
 *
 * It also prints the full zone → module → file resolution, so "which config
 * does this station actually get" is answerable with one command.
 */
import { existsSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'

function usage(): never {
  console.error('usage: validate-config [--zone <code>]')
  process.exit(2)
}

const args = process.argv.slice(2)
function argValue(flag: string): string | undefined {
  const i = args.indexOf(flag)
  if (i < 0) return undefined
  const value = args[i + 1]
  if (value === undefined || value.startsWith('--')) usage()
  return value
}

async function main(): Promise<void> {
  const zoneArg = argValue('--zone')
  if (args.some((a) => a.startsWith('--') && a !== '--zone')) usage()

  const { configRoot, GLOBAL_CONFIG_FILE, loadGlobalConfig } = await import(
    '../src/lib/settings/config-loader'
  )
  const { listModuleConfigs, validateModuleConfig } = await import(
    '../src/lib/settings/module-config-validation'
  )
  const { MODULES, MODULE_KEYS, moduleConfigPath, ZONE_CODE_RE } = await import(
    '../src/lib/settings/zone-schema'
  )

  const root = configRoot()
  let failures = 0
  const fail = (name: string, message: string): void => {
    failures++
    console.error(`✗ ${name}: ${message}`)
  }

  // 1. The global config.
  let config
  try {
    config = loadGlobalConfig(root)
  } catch (e) {
    console.error(`✗ ${GLOBAL_CONFIG_FILE}: ${(e as Error).message}`)
    process.exit(1)
  }

  const zoneCodes = zoneArg ? [zoneArg] : Object.keys(config.zones).sort()
  if (zoneArg && !config.zones[zoneArg]) {
    console.error(
      `✗ unknown zone "${zoneArg}" — defined zones: ${Object.keys(config.zones).sort().join(', ')}`,
    )
    process.exit(1)
  }

  // 2. Per zone: every enabled module must have its file, and it must parse.
  //    Disabled modules are reported too, so the resolution table is complete.
  const checked = new Set<string>()
  for (const zoneCode of zoneCodes) {
    const zone = config.zones[zoneCode]
    console.log(`\nzone ${zoneCode}${zone.title ? ` — ${zone.title}` : ''}`)

    for (const { moduleKey, config: path, enabled } of listModuleConfigs(
      zoneCode,
      zone,
    )) {
      const state = enabled
        ? `enabled → ${MODULES[moduleKey].route}`
        : 'disabled, validated only'
      if (!existsSync(join(root, path))) {
        if (enabled) {
          fail(`${zoneCode}/${moduleKey}`, `missing config file ${path}`)
        } else {
          console.log(`  ${moduleKey.padEnd(9)} (no file, not enabled)`)
        }
        continue
      }
      checked.add(path)
      try {
        validateModuleConfig(moduleKey, zoneCode)
        console.log(`  ${moduleKey.padEnd(9)} ${path}  [${state}]`)
      } catch (e) {
        fail(`${zoneCode}/${moduleKey}`, (e as Error).message)
      }
    }
  }

  // 3. Sweep every module config on disk, including zones not in global.yaml
  //    yet. Only meaningful on a full run — a --zone run sees one slice.
  if (!zoneArg) {
    const stray: string[] = []
    for (const key of MODULE_KEYS) {
      const dir = join(root, MODULES[key].dir, 'config', 'zones')
      if (!existsSync(dir)) continue
      for (const entry of readdirSync(dir).sort()) {
        if (!entry.endsWith('.yaml')) {
          fail(
            `${MODULES[key].dir}/config/zones/${entry}`,
            'not a .yaml file — this directory holds one file per zone code',
          )
          continue
        }
        const stem = basename(entry, '.yaml')
        if (!ZONE_CODE_RE.test(stem)) {
          fail(
            `${MODULES[key].dir}/config/zones/${entry}`,
            `invalid zone code "${stem}" — allowed characters: letters, digits, "_", "-"`,
          )
          continue
        }
        const path = moduleConfigPath(key, stem)
        if (checked.has(path)) continue
        try {
          validateModuleConfig(key, stem)
          if (!config.zones[stem]) stray.push(`${path} (zone "${stem}")`)
        } catch (e) {
          fail(path, (e as Error).message)
        }
      }
    }
    if (stray.length > 0) {
      console.warn(
        `\n⚠ config present for zone(s) not in ${GLOBAL_CONFIG_FILE}:\n` +
          stray.map((s) => `  ${s}`).join('\n'),
      )
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} problem(s) found`)
    process.exit(1)
  }
  console.log(`\nall ${zoneCodes.length} zone(s) valid`)
}

void main()
