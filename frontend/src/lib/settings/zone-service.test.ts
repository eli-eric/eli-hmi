import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getDefaultRoute,
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
      vi.stubEnv('NEXT_PUBLIC_ZONE_CODE', 'test')
    })

    it('isRouteAllowed returns true for known routes', () => {
      expect(isRouteAllowed('/p3-controls')).toBe(true)
      expect(isRouteAllowed('/l3bt-controls')).toBe(true)
      expect(isRouteAllowed('/l4fbt-controls')).toBe(true)
    })

    it('isRouteAllowed returns false for unknown routes', () => {
      expect(isRouteAllowed('/nonexistent')).toBe(false)
      expect(isRouteAllowed('')).toBe(false)
    })

    it('getDefaultRoute returns the first allowed route', () => {
      expect(getDefaultRoute()).toBe('/p3-controls')
    })

    it('hasAccessibleRoutes is true', () => {
      expect(hasAccessibleRoutes()).toBe(true)
    })

    it('getNavigationItems returns all configured items', () => {
      expect(getNavigationItems()).toHaveLength(3)
    })
  })

  describe('production zone (intentionally empty)', () => {
    beforeEach(() => {
      vi.stubEnv('NEXT_PUBLIC_ZONE_CODE', 'production')
    })

    it('isRouteAllowed returns false for every route', () => {
      expect(isRouteAllowed('/p3-controls')).toBe(false)
    })

    it('getDefaultRoute returns null', () => {
      expect(getDefaultRoute()).toBeNull()
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
      vi.stubEnv('NEXT_PUBLIC_ZONE_CODE', 'fhqwhgads')
    })

    it('falls back to empty config', () => {
      expect(isRouteAllowed('/p3-controls')).toBe(false)
      expect(getDefaultRoute()).toBeNull()
      expect(hasAccessibleRoutes()).toBe(false)
    })
  })

  describe('unset zone', () => {
    beforeEach(() => {
      vi.stubEnv('NEXT_PUBLIC_ZONE_CODE', '')
    })

    it('falls back to empty config', () => {
      expect(isRouteAllowed('/p3-controls')).toBe(false)
      expect(hasAccessibleRoutes()).toBe(false)
    })
  })
})
