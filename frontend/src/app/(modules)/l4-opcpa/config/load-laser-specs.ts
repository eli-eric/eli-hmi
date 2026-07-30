import 'server-only'

import {
  loadZoneFile,
  readModuleConfigText,
  ZoneConfigError,
} from '@/lib/settings/zone-config-loader'
import { getCurrentZoneCode } from '@/lib/settings/zone-service'
import { parseLaserSpecs, type LaserSpec } from './schema'

/**
 * Server-only loader for the L4 OPCPA per-laser config (CSI-861).
 *
 * The config is no longer baked into the build: the current zone's file
 * (`zones/<ZONE_CODE>.yaml` in the mounted config dir) names the laser config
 * to load (`modules.l4-opcpa.config`). Called from the server `page.tsx`,
 * which is `force-dynamic` — invalid config surfaces as a runtime error (and
 * is caught loudly at container start by `instrumentation.ts`), not a build
 * failure.
 *
 * Parses are cached per (zone, path) for the process lifetime — container
 * restart = config reload, same policy as the zone loader.
 *
 * The actual parse/validation lives in `schema.ts` (no `server-only`), so it
 * stays unit-testable from a plain string.
 */
const specsCache = new Map<string, LaserSpec[]>()

/** Tests only. */
export function clearLaserSpecsCache(): void {
  specsCache.clear()
}

export function loadLaserSpecs(): LaserSpec[] {
  const zoneCode = getCurrentZoneCode()
  if (!zoneCode) {
    throw new ZoneConfigError(
      'ZONE_CODE is not set — cannot resolve the L4 OPCPA laser config',
    )
  }

  const zone = loadZoneFile(zoneCode)
  const ref = zone.modules['l4-opcpa']
  if (!ref) {
    throw new ZoneConfigError(
      `zone "${zoneCode}" has no modules.l4-opcpa config reference`,
    )
  }

  const key = `${zoneCode}\0${ref.config}`
  const cached = specsCache.get(key)
  if (cached) return cached

  const specs = parseLaserSpecs(readModuleConfigText(ref.config))
  specsCache.set(key, specs)
  return specs
}
