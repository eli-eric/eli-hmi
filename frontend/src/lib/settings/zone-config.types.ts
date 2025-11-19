import { NavigationItem } from './navigation'

/**
 * Supported zone codes
 * Add new zones here to extend the system
 */
export type ZoneCode = 'test' | 'production' | string

/**
 * Configuration for a specific zone
 */
export interface ZoneConfig {
  /** Navigation items visible in the menu for this zone */
  navigationItems: NavigationItem[]
  /** Routes that are accessible for this zone */
  allowedRoutes: string[]
}

/**
 * Map of zone codes to their configurations
 */
export type ZoneConfigMap = Record<string, ZoneConfig>

/**
 * Default empty zone configuration
 * Used when zone is not configured or unknown
 */
export const EMPTY_ZONE_CONFIG: ZoneConfig = {
  navigationItems: [],
  allowedRoutes: [],
}
