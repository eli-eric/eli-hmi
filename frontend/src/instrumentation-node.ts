/**
 * Node-only half of the startup config check. Kept in a separate module
 * (statically importing `node:fs`) so the edge compilation of
 * `instrumentation.ts` never sees these APIs — the `NEXT_RUNTIME` guard there
 * dead-code-eliminates the dynamic import of this file, keeping `next build`
 * free of "Node.js API is not supported in the Edge Runtime" warnings.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { validateEnabledModuleConfigs } from './lib/settings/module-config-validation'
import {
  configRoot,
  GLOBAL_CONFIG_FILE,
  getZone,
  listZoneCodes,
} from './lib/settings/config-loader'
import { MODULES } from './lib/settings/zone-schema'

/**
 * Report a config problem at boot — loudly, but without exiting.
 *
 * The config now ships inside the image and is validated by `validate:config`
 * during `next build`, so a broken file cannot reach a container. The one
 * failure left is a `ZONE_CODE` that names no zone, which is a deployment-env
 * typo. Exiting on that would crash-loop the container, and with
 * `restart: unless-stopped` the operator-visible symptom is merely "the GUI
 * port is dead" — strictly worse than a UI that serves /no-access and says why
 * in the logs, and fixable with a compose edit instead of a rebuild.
 */
function report(message: string): void {
  console.error(`[config] ${message}`)
}

/**
 * Validate the current zone once at server boot and log a summary, so a
 * station's logs show which zone it came up as without hitting the UI.
 */
export function validateConfigAtStartup(): void {
  const root = configRoot()
  const globalPath = join(root, GLOBAL_CONFIG_FILE)
  if (!existsSync(globalPath)) {
    return report(`global config not found: ${globalPath}`)
  }

  const zoneCode = process.env.ZONE_CODE
  if (!zoneCode) {
    return report(
      'ZONE_CODE is not set — the whole UI will serve /no-access. ' +
        `Valid zones: ${safeZoneCodes().join(', ')}`,
    )
  }

  let zone
  try {
    zone = getZone(zoneCode)
  } catch (e) {
    return report(
      `${(e as Error).message}. The whole UI will serve /no-access until this is fixed.`,
    )
  }

  try {
    const enabled = validateEnabledModuleConfigs(zoneCode, zone)
    const home = MODULES[zone.modules[0].key].route
    console.log(
      `[config] zone "${zoneCode}" OK: ${enabled.length} module(s) ` +
        `(${enabled.map(({ moduleKey }) => moduleKey).join(', ')}), home ${home}`,
    )
  } catch (e) {
    report((e as Error).message)
  }
}

/** Never let the diagnostic itself throw while reporting another problem. */
function safeZoneCodes(): string[] {
  try {
    return listZoneCodes()
  } catch {
    return []
  }
}
