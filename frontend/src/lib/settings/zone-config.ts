import { ZoneConfigMap, EMPTY_ZONE_CONFIG } from './zone-config.types'

/**
 * Zone code constants
 */
export const ZONE_CODE_TEST = 'test' as const
export const ZONE_CODE_PRODUCTION = 'production' as const

/**
 * Zone configurations map
 * Add new zones by adding entries to this map
 */
export const ZONE_CONFIGS: ZoneConfigMap = {
  [ZONE_CODE_TEST]: {
    navigationItems: [
      {
        text: 'P3 Controls',
        href: '/p3-controls',
      },
      {
        text: 'L3BT Controls',
        href: '/l3bt-controls',
      },
      {
        text: 'L4fBT Controls',
        href: '/l4fbt-controls',
      },
      {
        text: 'L4 OPCPA Controls',
        href: '/l4-opcpa',
      },
    ],
    allowedRoutes: [
      '/p3-controls',
      '/l3bt-controls',
      '/l4fbt-controls',
      '/l4-opcpa',
    ],
  },
  [ZONE_CODE_PRODUCTION]: {
    navigationItems: [],
    allowedRoutes: [],
  },
}

/**
 * Get configuration for a specific zone
 * Returns empty config if zone is not found
 */
export function getConfigForZone(
  zoneCode: string | undefined,
): typeof EMPTY_ZONE_CONFIG {
  if (!zoneCode) {
    return EMPTY_ZONE_CONFIG
  }

  return ZONE_CONFIGS[zoneCode] ?? EMPTY_ZONE_CONFIG
}
