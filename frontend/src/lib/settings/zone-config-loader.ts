/**
 * Runtime loader for the zone config directory (CSI-861).
 *
 * The config lives OUTSIDE the app build — a directory (git repo owned by the
 * controls team) mounted into the container and pointed at via `CONFIG_DIR`.
 * Layout contract:
 *
 *   <CONFIG_DIR>/zones/<ZONE_CODE>.yaml   ← one file per zone (code = filename)
 *   <CONFIG_DIR>/modules/...              ← module config files, referenced
 *                                            from zone files by relative path
 *
 * Reads are synchronous (middleware + zone-service call sites are sync) and
 * cached per zone code for the process lifetime: container restart = config
 * reload. Failures are cached too, so a broken file doesn't re-parse and
 * re-log on every request.
 *
 * NOT marked `server-only` because `middleware.ts` imports the call chain;
 * it still must never be imported from client components (it uses `node:fs`).
 */

import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, resolve, sep } from 'node:path'

import { parseZoneFile, type ZoneFile } from './zone-schema'

/** Thrown for any config-dir problem: missing/invalid file, bad reference. */
export class ZoneConfigError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ZoneConfigError'
  }
}

/**
 * Dev fallback: the in-repo config template at the repo root (cwd is
 * `frontend/` for both `next dev` and `next start`, see next.config.ts).
 * Deployments always set CONFIG_DIR explicitly — the template is deliberately
 * not baked into the image, so a missing mount fails fast instead of silently
 * serving dev config.
 */
const DEFAULT_CONFIG_DIR = join(process.cwd(), '..', 'eli-hmi-config')

export function getConfigDir(): string {
  return process.env.CONFIG_DIR ?? DEFAULT_CONFIG_DIR
}

/** Free-form zone codes, but traversal-safe (used as a filename). */
const ZONE_CODE_RE = /^[A-Za-z0-9_-]+$/

type CacheEntry =
  | { ok: true; zone: ZoneFile }
  | { ok: false; error: ZoneConfigError }

// Keyed by `${configDir}\0${zoneCode}` so tests stubbing CONFIG_DIR don't
// bleed into each other; in production the dir never changes.
const zoneCache = new Map<string, CacheEntry>()

/** Tests only. */
export function clearZoneCache(): void {
  zoneCache.clear()
}

function zoneFilePath(configDir: string, zoneCode: string): string {
  return join(configDir, 'zones', `${zoneCode}.yaml`)
}

/**
 * True iff `zones/<zoneCode>.yaml` exists — this is what makes a ZONE_CODE
 * valid; the app has no hardcoded zone list.
 */
export function zoneFileExists(zoneCode: string): boolean {
  if (!ZONE_CODE_RE.test(zoneCode)) return false
  return existsSync(zoneFilePath(getConfigDir(), zoneCode))
}

/**
 * Load + validate the zone file for `zoneCode`. Cached (success and failure)
 * for the process lifetime. Throws `ZoneConfigError` with an operator-readable
 * message on a bad code, missing file, malformed YAML, or schema violation.
 */
export function loadZoneFile(zoneCode: string): ZoneFile {
  const configDir = getConfigDir()
  const key = `${configDir}\0${zoneCode}`

  const cached = zoneCache.get(key)
  if (cached) {
    if (cached.ok) return cached.zone
    throw cached.error
  }

  const entry = readZoneFile(configDir, zoneCode)
  zoneCache.set(key, entry)
  if (entry.ok) return entry.zone
  throw entry.error
}

function readZoneFile(configDir: string, zoneCode: string): CacheEntry {
  if (!ZONE_CODE_RE.test(zoneCode)) {
    return {
      ok: false,
      error: new ZoneConfigError(
        `invalid zone code "${zoneCode}" — allowed characters: letters, digits, "_", "-"`,
      ),
    }
  }

  const path = zoneFilePath(configDir, zoneCode)
  if (!existsSync(path)) {
    return {
      ok: false,
      error: new ZoneConfigError(
        `zone config not found: ${path} (ZONE_CODE=${zoneCode}, CONFIG_DIR=${configDir})`,
      ),
    }
  }

  try {
    const zone = parseZoneFile(readFileSync(path, 'utf8'), `zones/${zoneCode}.yaml`)
    return { ok: true, zone }
  } catch (e) {
    return {
      ok: false,
      error: new ZoneConfigError((e as Error).message, { cause: e }),
    }
  }
}

/**
 * Read a module config file referenced from a zone file. `relPath` must stay
 * inside the config dir (references are relative by contract; escapes and
 * absolute paths are rejected). Throws `ZoneConfigError` when missing.
 */
export function readModuleConfigText(relPath: string): string {
  const configDir = resolve(getConfigDir())

  if (isAbsolute(relPath)) {
    throw new ZoneConfigError(
      `module config reference must be relative to the config dir, got absolute path: ${relPath}`,
    )
  }

  const full = resolve(configDir, relPath)
  if (full !== configDir && !full.startsWith(configDir + sep)) {
    throw new ZoneConfigError(
      `module config reference escapes the config dir: ${relPath}`,
    )
  }

  if (!existsSync(full)) {
    throw new ZoneConfigError(
      `module config not found: ${full} (referenced as ${relPath})`,
    )
  }

  return readFileSync(full, 'utf8')
}
