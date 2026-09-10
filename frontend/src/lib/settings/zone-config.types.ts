import { NavigationItem } from './navigation'

/**
 * Configuration for a specific zone, resolved from its zone file
 * (`zones/<ZONE_CODE>.yaml` in the runtime config dir — see ADR-0011).
 * There is no zone-code type: a zone exists iff its file does.
 */
export interface ZoneConfig {
  /** Navigation items visible in the menu for this zone */
  navigationItems: NavigationItem[]
  /** Routes that are accessible for this zone */
  allowedRoutes: string[]
  /**
   * Name shown in the header. Undefined when the zone does not set one (or
   * has no config at all), which `getZoneTitle` turns into a generic default
   * rather than a specific station's name.
   */
  title?: string
}

/**
 * Default empty zone configuration
 * Used when zone is not configured or unknown
 */
export const EMPTY_ZONE_CONFIG: ZoneConfig = {
  navigationItems: [],
  allowedRoutes: [],
}
