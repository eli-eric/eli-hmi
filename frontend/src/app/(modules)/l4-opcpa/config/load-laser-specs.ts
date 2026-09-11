import 'server-only'

import {
  ConfigError,
  configRoot,
  readModuleConfigText,
} from '@/lib/settings/config-loader'
import { deepFreeze } from '@/lib/utils/deep-freeze'
import { getCurrentZoneCode } from '@/lib/settings/zone-service'
import { moduleConfigPath } from '@/lib/settings/zone-schema'
import { parseLaserSpecs, type LaserSpec } from './schema'

/**
 * Server-only loader for the L4 OPCPA per-laser config.
 *
 * The file ships in the image at `config/zones/<ZONE_CODE>.yaml` next to this
 * loader — one file per zone, because different stations run against different
 * PVs. Called from the server `page.tsx`, which is `force-dynamic` because
 * `ZONE_CODE` is only known at runtime.
 *
 * In production, parses are cached per (root, zone) for the process lifetime;
 * uncached in development, same policy as the config loader.
 *
 * The actual parse/validation lives in `schema.ts` (no `server-only`), so it
 * stays unit-testable from a plain string.
 */
const specsCache = new Map<string, readonly LaserSpec[]>()

/** Tests only. */
export function clearLaserSpecsCache(): void {
  specsCache.clear()
}

export function loadLaserSpecs(): readonly LaserSpec[] {
  const zoneCode = getCurrentZoneCode()
  if (!zoneCode) {
    throw new ConfigError(
      'ZONE_CODE is not set — cannot resolve the L4 OPCPA laser config',
    )
  }

  // root is part of the key for the same reason as in the config cache: tests
  // load fixture roots; in production it never changes.
  const key = `${configRoot()}\0${zoneCode}`
  const cached = specsCache.get(key)
  if (cached) return cached

  const path = moduleConfigPath('l4-opcpa', zoneCode)
  let specs: readonly LaserSpec[]
  try {
    specs = deepFreeze(
      parseLaserSpecs(readModuleConfigText('l4-opcpa', zoneCode), path),
    )
  } catch (e) {
    if (e instanceof ConfigError) throw e
    throw new ConfigError((e as Error).message, { cause: e })
  }

  // Production only, same policy as the config cache: dev edits reload per
  // request; in production the config is fixed for the image's lifetime.
  if (process.env.NODE_ENV === 'production') {
    specsCache.set(key, specs)
  }
  return specs
}
