import { NavigationItem } from './navigation'
import { loadZoneFile, ZoneConfigError } from './zone-config-loader'
import { EMPTY_ZONE_CONFIG, ZoneConfig } from './zone-config.types'

/**
 * Server-side zone resolution, backed by the runtime config directory
 * (`zone-config-loader.ts`) instead of a hardcoded zone map. The public API is
 * unchanged and synchronous, so Proxy and server components keep working
 * as before.
 *
 * Failure policy: an unset/unknown ZONE_CODE or a broken zone file degrades to
 * `EMPTY_ZONE_CONFIG` here (UI falls back to /no-access, exactly like an
 * unconfigured zone always has). Hard fail-fast on truly broken config is the
 * job of the startup check in `instrumentation.ts`; per-request code must not
 * crash the whole app for it. Errors are logged once per zone code.
 */

/**
 * Get the current zone code from the live server environment.
 *
 * `ZONE_CODE` deliberately has no `NEXT_PUBLIC_` prefix so Next.js does not
 * inline it at build time — this reads fresh from the container's env on
 * every Proxy/server-component invocation. Client components have no
 * access to this at all and must instead source the zone code from
 * `useRuntimeConfig()`-derived data (see /api/runtime-config).
 * @returns The zone code or undefined if not set
 */
export function getCurrentZoneCode(): string | undefined {
  return process.env.ZONE_CODE
}

const loggedZones = new Set<string>()

/**
 * Get the configuration for the current zone
 * Returns empty config if the zone is not set, has no zone file, or its file
 * fails validation (logged once; startup check reports it loudly).
 * @param zoneCode - Optional zone code, defaults to current zone
 * @returns Zone configuration
 */
export function getZoneConfig(zoneCode?: string): ZoneConfig {
  const zone = zoneCode ?? getCurrentZoneCode()
  if (!zone) {
    return EMPTY_ZONE_CONFIG
  }

  try {
    const file = loadZoneFile(zone)
    return {
      navigationItems: file.navigationItems,
      allowedRoutes: file.allowedRoutes,
    }
  } catch (e) {
    if (!loggedZones.has(zone)) {
      loggedZones.add(zone)
      const detail = e instanceof ZoneConfigError ? e.message : String(e)
      console.error(`[zone-service] falling back to empty zone: ${detail}`)
    }
    return EMPTY_ZONE_CONFIG
  }
}

/**
 * Get navigation items for the current zone
 * @param zoneCode - Optional zone code, defaults to current (server) zone
 * @returns Array of navigation items
 */
export function getNavigationItems(zoneCode?: string): NavigationItem[] {
  return getZoneConfig(zoneCode).navigationItems
}

/**
 * Check if a route is allowed in the current zone
 * @param path - The route path to check
 * @param zoneCode - Optional zone code, defaults to current (server) zone
 * @returns True if the route is allowed, false otherwise
 */
export function isRouteAllowed(path: string, zoneCode?: string): boolean {
  const { allowedRoutes } = getZoneConfig(zoneCode)
  return allowedRoutes.includes(path)
}

/**
 * Get the default route for the current zone
 * @param zoneCode - Optional zone code, defaults to current (server) zone
 * @returns The first allowed route or null if no routes are allowed
 */
export function getDefaultRoute(zoneCode?: string): string | null {
  const { allowedRoutes } = getZoneConfig(zoneCode)
  return allowedRoutes.length > 0 ? allowedRoutes[0] : null
}

/**
 * Check if the current zone has any accessible routes
 * @param zoneCode - Optional zone code, defaults to current (server) zone
 * @returns True if at least one route is available
 */
export function hasAccessibleRoutes(zoneCode?: string): boolean {
  return getZoneConfig(zoneCode).allowedRoutes.length > 0
}

/**
 * Resolve the home route for the current zone with a `/no-access` fallback.
 * Use this for any "redirect to home" path (root page, post-login redirect,
 * the nav-bar logo) so the fallback is in one place.
 * @param zoneCode - Optional zone code, defaults to current (server) zone
 */
export function getHomeRoute(zoneCode?: string): string {
  return getDefaultRoute(zoneCode) ?? '/no-access'
}
