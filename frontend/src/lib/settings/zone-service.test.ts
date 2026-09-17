import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ConfigRoot,
  GLOBAL_BROKEN,
  GLOBAL_TWO_ZONES,
} from '@/test/config-root'
import { clearConfigCache, setConfigRootForTests } from './config-loader'
import {
  DEFAULT_ZONE_TITLE,
  getDefaultRoute,
  getHomeRoute,
  getNavigationItems,
  getZoneTitle,
  hasAccessibleRoutes,
  isRouteAllowed,
} from './zone-service'

describe('zone-service', () => {
  let root: ConfigRoot

  beforeEach(() => {
    vi.unstubAllEnvs()
    root = new ConfigRoot().global(GLOBAL_TWO_ZONES)
    setConfigRootForTests(root.path)
    clearConfigCache()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    setConfigRootForTests(undefined)
    clearConfigCache()
    root.cleanup()
  })

  describe('test zone (l4-opcpa with a label, p3 without one)', () => {
    beforeEach(() => {
      vi.stubEnv('ZONE_CODE', 'test')
    })

    it('isRouteAllowed is true for every enabled module route', () => {
      expect(isRouteAllowed('/l4-opcpa')).toBe(true)
      // Enabled without `text`: reachable, just not in the menu.
      expect(isRouteAllowed('/p3-controls')).toBe(true)
    })

    it('isRouteAllowed returns false for routes the zone does not enable', () => {
      expect(isRouteAllowed('/l3bt-controls')).toBe(false)
      expect(isRouteAllowed('/l4fbt-controls')).toBe(false)
      expect(isRouteAllowed('/nonexistent')).toBe(false)
      expect(isRouteAllowed('')).toBe(false)
    })

    it('getDefaultRoute returns the first listed module route', () => {
      expect(getDefaultRoute()).toBe('/l4-opcpa')
    })

    it('getHomeRoute returns the default route', () => {
      expect(getHomeRoute()).toBe('/l4-opcpa')
    })

    it('hasAccessibleRoutes is true', () => {
      expect(hasAccessibleRoutes()).toBe(true)
    })

    it('getZoneTitle returns the name this zone gives itself', () => {
      expect(getZoneTitle()).toBe('L4 OPCPA')
    })

    it('getNavigationItems only includes modules carrying `text`', () => {
      // The menu is derived from the same list as the routes, so it cannot
      // point at a page the zone did not enable.
      expect(getNavigationItems()).toEqual([
        { text: 'L4 OPCPA Controls', href: '/l4-opcpa' },
      ])
    })
  })

  describe('zone that names no title', () => {
    beforeEach(() => {
      vi.stubEnv('ZONE_CODE', 'minimal')
    })

    it('falls back to the generic name, not another station name', () => {
      // The header used to be hardcoded to one station's name and showed it
      // on every deployment regardless of what the page controlled.
      expect(getZoneTitle()).toBe(DEFAULT_ZONE_TITLE)
    })

    it('still resolves its own routes', () => {
      expect(getHomeRoute()).toBe('/l4fbt-controls')
      expect(isRouteAllowed('/l4-opcpa')).toBe(false)
    })
  })

  describe('unknown zone', () => {
    beforeEach(() => {
      vi.stubEnv('ZONE_CODE', 'fhqwhgads')
    })

    it('degrades to the empty zone instead of throwing', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      expect(isRouteAllowed('/p3-controls')).toBe(false)
      expect(getDefaultRoute()).toBeNull()
      expect(getHomeRoute()).toBe('/no-access')
      expect(hasAccessibleRoutes()).toBe(false)
      expect(getZoneTitle()).toBe(DEFAULT_ZONE_TITLE)
      errorSpy.mockRestore()
    })
  })

  describe('broken global config', () => {
    beforeEach(() => {
      root.global(GLOBAL_BROKEN)
      clearConfigCache()
      vi.stubEnv('ZONE_CODE', 'test')
    })

    it('degrades to the empty zone instead of throwing', () => {
      // Per-request code must never crash the whole app over config; the
      // build-time validator is what refuses to ship a file like this.
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      expect(isRouteAllowed('/l4-opcpa')).toBe(false)
      expect(getHomeRoute()).toBe('/no-access')
      errorSpy.mockRestore()
    })
  })

  describe('unset zone', () => {
    beforeEach(() => {
      vi.stubEnv('ZONE_CODE', '')
    })

    it('falls back to empty config', () => {
      expect(isRouteAllowed('/l4-opcpa')).toBe(false)
      expect(hasAccessibleRoutes()).toBe(false)
    })
  })

  describe('explicit zoneCode argument overrides env', () => {
    beforeEach(() => {
      vi.stubEnv('ZONE_CODE', 'minimal')
    })

    it('uses the passed code', () => {
      expect(isRouteAllowed('/l4-opcpa', 'test')).toBe(true)
      expect(getHomeRoute('test')).toBe('/l4-opcpa')
    })
  })
})
