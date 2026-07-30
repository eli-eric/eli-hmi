/**
 * Startup fail-fast validation of the runtime zone config (CSI-861).
 *
 * Runs once when the Node server boots (Next instrumentation hook). A broken
 * or missing config in production stops the container immediately with a
 * readable operator message — a crash-looping container on config rollout is
 * deliberate and beats a "running" server that serves /no-access everywhere.
 * In development it only warns, so the repo can run without a config mount.
 */
export async function register() {
  // Also invoked for the edge bundle; fs-based checks only make sense (and
  // only compile) in the Node runtime.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { existsSync } = await import('node:fs')
  const { getConfigDir, loadZoneFile, readModuleConfigText } = await import(
    './lib/settings/zone-config-loader'
  )
  const { parseLaserSpecs } = await import(
    './app/(modules)/l4-opcpa/config/schema'
  )

  const fail = (message: string): void => {
    if (process.env.NODE_ENV === 'production') {
      console.error(`[zone-config] FATAL: ${message}`)
      process.exit(1)
    }
    console.warn(`[zone-config] ${message} — continuing (development mode)`)
  }

  const configDir = getConfigDir()
  if (!existsSync(configDir)) {
    fail(
      `config directory not found: ${configDir} (is the config repo mounted and CONFIG_DIR set?)`,
    )
    return
  }

  const zoneCode = process.env.ZONE_CODE
  if (!zoneCode) {
    fail('ZONE_CODE is not set')
    return
  }

  try {
    const zone = loadZoneFile(zoneCode)

    const l4 = zone.modules['l4-opcpa']
    if (l4) {
      parseLaserSpecs(readModuleConfigText(l4.config))
    }

    console.log(
      `[zone-config] zone "${zoneCode}" OK (${configDir}): ` +
        `${zone.allowedRoutes.length} route(s), ` +
        `${zone.navigationItems.length} nav item(s)` +
        (l4 ? `, l4-opcpa config ${l4.config}` : ''),
    )
  } catch (e) {
    fail((e as Error).message)
  }
}
