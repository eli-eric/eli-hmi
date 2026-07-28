import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getDefaultRoute,
  getHomeRoute,
  getNavigationItems,
  hasAccessibleRoutes,
  isRouteAllowed,
} from './zone-service'

describe('zone-service', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('test zone', () => {
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

  describe('production zone (intentionally empty)', () => {
    beforeEach(() => {
      vi.stubEnv('ZONE_CODE', 'production')
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

  describe('unknown zone', () => {
    beforeEach(() => {
      vi.stubEnv('ZONE_CODE', 'fhqwhgads')
    })

    it('falls back to empty config', () => {
      expect(isRouteAllowed('/p3-controls')).toBe(false)
      expect(getDefaultRoute()).toBeNull()
      expect(hasAccessibleRoutes()).toBe(false)
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
})
