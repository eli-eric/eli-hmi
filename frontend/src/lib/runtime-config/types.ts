import type { NavigationItem } from '@/lib/settings/navigation'

export interface RuntimeConfig {
  apiUrl: string | null
  apiScheme: string | null
  zoneCode: string | null
  /** Nav items for the current zone, resolved server-side from the zone file. */
  navigationItems: NavigationItem[]
  /** Zone home route (first allowed route, `/no-access` fallback). */
  homeRoute: string
}
