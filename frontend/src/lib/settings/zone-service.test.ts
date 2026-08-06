import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearZoneCache } from './zone-config-loader'
import {
  getDefaultRoute,
  getHomeRoute,
  getNavigationItems,
  hasAccessibleRoutes,
  isRouteAllowed,
} from './zone-service'

const FIXTURE_DIR = join(__dirname, '__fixtures__', 'config-dir')

describe('zone-service', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.stubEnv('CONFIG_DIR', FIXTURE_DIR)
    clearZoneCache()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    clearZoneCache()
  })

  describe('test zone (fixture with l4-opcpa)', () => {
    beforeEach(() => {
      vi.stubEnv('ZONE_CODE', 'test')
    })

    it('isRouteAllowed returns true for the allowed L4 OPCPA route', () => {
      expect(isRouteAllowed('/l4-opcpa')).toBe(true)
    })

    it('isRouteAllowed returns false for routes outside the zone', () => {
      expect(isRouteAllowed('/p3-controls')).toBe(false)
      expect(isRouteAllowed('/l3bt-controls')).toBe(false)
      expect(isRouteAllowed('/l4fbt-controls')).toBe(false)
      expect(isRouteAllowed('/nonexistent')).toBe(false)
      expect(isRouteAllowed('')).toBe(false)
    })

    it('getDefaultRoute returns the first allowed route', () => {
      expect(getDefaultRoute()).toBe('/l4-opcpa')
    })

    it('getHomeRoute returns the default route', () => {
      expect(getHomeRoute()).toBe('/l4-opcpa')
    })

    it('hasAccessibleRoutes is true', () => {
      expect(hasAccessibleRoutes()).toBe(true)
    })

    it('getNavigationItems returns the configured item', () => {
      const items = getNavigationItems()
      expect(items).toHaveLength(1)
      expect(items[0]).toEqual({
        text: 'L4 OPCPA Controls',
        href: '/l4-opcpa',
      })
    })
  })

  describe('empty zone (intentionally no routes)', () => {
    beforeEach(() => {
      vi.stubEnv('ZONE_CODE', 'empty')
    })

    it('isRouteAllowed returns false for every route', () => {
      expect(isRouteAllowed('/p3-controls')).toBe(false)
    })

    it('getDefaultRoute returns null', () => {
      expect(getDefaultRoute()).toBeNull()
    })

    it('getHomeRoute falls back to /no-access', () => {
      expect(getHomeRoute()).toBe('/no-access')
    })

    it('hasAccessibleRoutes is false', () => {
      expect(hasAccessibleRoutes()).toBe(false)
    })

    it('getNavigationItems is empty', () => {
      expect(getNavigationItems()).toEqual([])
    })
  })

  describe('unknown zone (no zone file)', () => {
    beforeEach(() => {
      vi.stubEnv('ZONE_CODE', 'fhqwhgads')
    })

    it('falls back to empty config', () => {
      expect(isRouteAllowed('/p3-controls')).toBe(false)
      expect(getDefaultRoute()).toBeNull()
      expect(hasAccessibleRoutes()).toBe(false)
    })
  })

  describe('broken zone file', () => {
    beforeEach(() => {
      vi.stubEnv('ZONE_CODE', 'broken')
    })

    it('falls back to empty config instead of throwing', () => {
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
      expect(isRouteAllowed('/p3-controls')).toBe(false)
      expect(hasAccessibleRoutes()).toBe(false)
    })
  })

  describe('explicit zoneCode argument overrides env', () => {
    beforeEach(() => {
      vi.stubEnv('ZONE_CODE', 'empty')
    })

    it('uses the passed code', () => {
      expect(isRouteAllowed('/l4-opcpa', 'test')).toBe(true)
      expect(getHomeRoute('test')).toBe('/l4-opcpa')
    })
  })
})
