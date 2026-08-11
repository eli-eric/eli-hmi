/**
 * Node-only half of the startup fail-fast validation (CSI-861). Kept in a
 * separate module (statically importing `node:fs` and calling
 * `process.exit`) so the edge compilation of `instrumentation.ts` never sees
 * these APIs — the `NEXT_RUNTIME` guard there dead-code-eliminates the
 * dynamic import of this file, keeping `next build` free of
 * "Node.js API is not supported in the Edge Runtime" warnings.
 */
import { existsSync } from 'node:fs'

import { validateReferencedModuleConfigs } from './lib/settings/module-config-validation'
import { getConfigDir, loadZoneFile } from './lib/settings/zone-config-loader'

function fail(message: string): void {
  if (process.env.NODE_ENV === 'production') {
    console.error(`[zone-config] FATAL: ${message}`)
    process.exit(1)
  }
  console.warn(`[zone-config] ${message} — continuing (development mode)`)
}

/**
 * Validate the whole runtime zone config once at server boot. A broken or
 * missing config in production stops the container immediately with a
 * readable operator message — a crash-looping container on config rollout is
 * deliberate and beats a "running" server that serves /no-access everywhere.
 * In development it only warns, so the repo can run without a config mount.
 */
export function validateZoneConfigAtStartup(): void {
  const configDir = getConfigDir()
  if (!existsSync(/* turbopackIgnore: true */ configDir)) {
    return fail(
      `config directory not found: ${configDir} (is the config repo mounted and CONFIG_DIR set?)`,
    )
  }

  const zoneCode = process.env.ZONE_CODE
  if (!zoneCode) {
    return fail('ZONE_CODE is not set')
  }

  try {
    const zone = loadZoneFile(zoneCode)
    const moduleReferences = validateReferencedModuleConfigs(zone)

    console.log(
      `[zone-config] zone "${zoneCode}" OK (${configDir}): ` +
        `${zone.allowedRoutes.length} route(s), ` +
        `${zone.navigationItems.length} nav item(s)` +
        (moduleReferences.length > 0
          ? `, module config(s): ${moduleReferences
              .map(({ moduleKey, config }) => `${moduleKey}=${config}`)
              .join(', ')}`
          : ''),
    )
  } catch (e) {
    return fail((e as Error).message)
  }
}
