/**
 * Loader for the in-repo configuration.
 *
 * Config ships inside the image — `config/global.yaml` plus one file per
 * (module, zone) under `src/app/(modules)/<module>/config/zones/`. The only
 * per-deployment knob is `ZONE_CODE`, so one image still serves every station.
 *
 * There is no `CONFIG_DIR`: paths are code constants rooted at the frontend
 * project directory. `process.cwd()` is that directory in every environment
 * this runs in — `next dev` and `next start` (package.json scripts), vitest,
 * and the standalone server, whose generated `server.js` does
 * `process.chdir(__dirname)` onto the Dockerfile's `WORKDIR /app`.
 *
 * Reads are synchronous (Proxy + zone-service call sites are sync) and, in
 * production, cached for the process lifetime. In development nothing is
 * cached — edits to a config being authored take effect on the next request.
 *
 * NOT marked `server-only` because `proxy.ts` imports the call chain;
 * it still must never be imported from client components (it uses `node:fs`).
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  moduleConfigPath,
  parseGlobalConfig,
  type GlobalConfig,
  type ModuleKey,
  type ZoneEntry,
} from './zone-schema'

/** Thrown for any config problem: missing/invalid file, unknown zone. */
export class ConfigError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ConfigError'
  }
}

/** Path of the global config, relative to the frontend project root. */
export const GLOBAL_CONFIG_FILE = 'config/global.yaml'

let rootOverride: string | undefined

/**
 * Tests only: point every loader at a fixture root.
 *
 * Deliberately NOT an env var. `CONFIG_DIR` used to be one, and making the
 * config location settable from the environment is exactly what this migration
 * removed — a deployment must not be able to swap the config out from under
 * the image it shipped in.
 */
export function setConfigRootForTests(root: string | undefined): void {
  rootOverride = root
}

/** The frontend project root. See the module comment for why cwd is correct. */
export function configRoot(): string {
  return rootOverride ?? process.cwd()
}

type CacheEntry =
  | { ok: true; config: GlobalConfig }
  | { ok: false; error: ConfigError }

// Keyed by root so tests loading fixture roots don't bleed into each other;
// in production there is only ever one.
const globalCache = new Map<string, CacheEntry>()

/** Tests only. */
export function clearConfigCache(): void {
  globalCache.clear()
}

/**
 * Load + validate `config/global.yaml`. In production, cached (success and
 * failure) for the process lifetime; uncached in development.
 */
export function loadGlobalConfig(root: string = configRoot()): GlobalConfig {
  const cached = globalCache.get(root)
  if (cached) {
    if (cached.ok) return cached.config
    throw cached.error
  }

  const entry = readGlobalConfig(root)
  // Cache only in production. In development the config is being actively
  // authored — an edited file (broken or fixed) must be picked up on the next
  // request without restarting `next dev`.
  if (process.env.NODE_ENV === 'production') {
    globalCache.set(root, entry)
  }
  if (entry.ok) return entry.config
  throw entry.error
}

function readGlobalConfig(root: string): CacheEntry {
  const path = join(/* turbopackIgnore: true */ root, GLOBAL_CONFIG_FILE)
  if (!existsSync(/* turbopackIgnore: true */ path)) {
    return {
      ok: false,
      error: new ConfigError(`global config not found: ${path}`),
    }
  }

  try {
    const config = parseGlobalConfig(
      readFileSync(/* turbopackIgnore: true */ path, 'utf8'),
      GLOBAL_CONFIG_FILE,
    )
    return { ok: true, config }
  } catch (e) {
    return {
      ok: false,
      error: new ConfigError((e as Error).message, { cause: e }),
    }
  }
}

/** Every zone code the config defines, sorted — used in error messages. */
export function listZoneCodes(root: string = configRoot()): string[] {
  return Object.keys(loadGlobalConfig(root).zones).sort()
}

/**
 * Resolve one zone. Throws `ConfigError` naming the valid codes when the zone
 * is not defined — the single remaining runtime failure mode now that the
 * config ships in the image and is validated at build.
 */
export function getZone(
  zoneCode: string,
  root: string = configRoot(),
): ZoneEntry {
  const config = loadGlobalConfig(root)
  const zone = config.zones[zoneCode]
  if (!zone) {
    throw new ConfigError(
      `ZONE_CODE="${zoneCode}" is not defined in ${GLOBAL_CONFIG_FILE} — ` +
        `valid zones: ${Object.keys(config.zones).sort().join(', ') || '(none)'}`,
    )
  }
  return zone
}

/**
 * Read one module's config file for one zone. Throws `ConfigError` when the
 * file is missing: there is deliberately no fallback to a shared default, so
 * a zone can never silently run on another station's PV names.
 */
export function readModuleConfigText(
  key: ModuleKey,
  zoneCode: string,
  root: string = configRoot(),
): string {
  const relPath = moduleConfigPath(key, zoneCode)
  const full = join(/* turbopackIgnore: true */ root, relPath)

  if (!existsSync(/* turbopackIgnore: true */ full)) {
    throw new ConfigError(
      `module config not found: ${relPath} (module "${key}", zone "${zoneCode}")`,
    )
  }

  return readFileSync(/* turbopackIgnore: true */ full, 'utf8')
}
