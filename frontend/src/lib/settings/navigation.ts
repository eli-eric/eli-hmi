import { getNavigationItems } from './zone-service'

export interface NavigationItem {
  text: string
  href: string
}

/**
 * Get navigation items for the current zone
 * This is dynamically determined based on ZONE_CODE environment variable
 */
export const navigationItems: NavigationItem[] = getNavigationItems()
