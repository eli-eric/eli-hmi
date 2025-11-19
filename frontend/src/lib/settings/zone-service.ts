import { NavigationItem } from './navigation'
import { getConfigForZone } from './zone-config'
import { ZoneConfig } from './zone-config.types'

/**
 * Get the current zone code from environment variables
 * @returns The zone code or undefined if not set
 */
export function getCurrentZoneCode(): string | undefined {
  return process.env.NEXT_PUBLIC_ZONE_CODE
}

/**
 * Get the configuration for the current zone
 * Returns empty config if zone is not configured
 * @param zoneCode - Optional zone code, defaults to current zone
 * @returns Zone configuration
 */
export function getZoneConfig(zoneCode?: string): ZoneConfig {
  const zone = zoneCode ?? getCurrentZoneCode()
  return getConfigForZone(zone)
}

/**
 * Get navigation items for the current zone
 * @returns Array of navigation items
 */
export function getNavigationItems(): NavigationItem[] {
  return getZoneConfig().navigationItems
}

/**
 * Check if a route is allowed in the current zone
 * @param path - The route path to check
 * @returns True if the route is allowed, false otherwise
 */
export function isRouteAllowed(path: string): boolean {
  const { allowedRoutes } = getZoneConfig()
  return allowedRoutes.includes(path)
}

/**
 * Get the default route for the current zone
 * @returns The first allowed route or null if no routes are allowed
 */
export function getDefaultRoute(): string | null {
  const { allowedRoutes } = getZoneConfig()
  return allowedRoutes.length > 0 ? allowedRoutes[0] : null
}

/**
 * Check if the current zone has any accessible routes
 * @returns True if at least one route is available
 */
export function hasAccessibleRoutes(): boolean {
  return getZoneConfig().allowedRoutes.length > 0
}
