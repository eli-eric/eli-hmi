import { NavigationItem } from './navigation'

/**
 * What the app needs to know about the current zone, as `zone-service.ts`
 * resolves it from `config/global.yaml` (see ADR-0012).
 *
 * This is the DERIVED shape, not the config shape: a zone file lists enabled
 * modules once, and the two lists below are computed from it, so they can
 * never disagree about which pages exist. There is no zone-code type — a zone
 * exists iff it is a key under `zones:`.
 */
export interface ZoneConfig {
  /** Menu entries, in order — the enabled modules that carry a label. */
  navigationItems: NavigationItem[]
  /** Routes of every enabled module, in order; the first is the home route. */
  allowedRoutes: string[]
  /**
   * Name shown in the header. Undefined when the zone does not set one (or
   * has no config at all), which `getZoneTitle` turns into a generic default
   * rather than a specific station's name.
   */
  title?: string
}

/**
 * What an unset or unknown `ZONE_CODE` degrades to: no routes, so every page
 * redirects to `/no-access`. Deliberately not a crash — see
 * `instrumentation-node.ts`.
 */
export const EMPTY_ZONE_CONFIG: ZoneConfig = {
  navigationItems: [],
  allowedRoutes: [],
}
