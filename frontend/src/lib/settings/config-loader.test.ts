import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ConfigRoot,
  GLOBAL_BROKEN,
  GLOBAL_TWO_ZONES,
} from '@/test/config-root'
import {
  clearConfigCache,
  ConfigError,
  configRoot,
  getZone,
  listZoneCodes,
  loadGlobalConfig,
  readModuleConfigText,
} from './config-loader'
import { GLOBAL_CONFIG_FILE } from './config-loader'

describe('config-loader', () => {
  const roots: ConfigRoot[] = []
  const makeRoot = (): ConfigRoot => {
    const root = new ConfigRoot()
    roots.push(root)
    return root
  }
  /** A root holding the two-zone global config. */
  let VALID: string
  /** A root whose global config violates the schema. */
  let BROKEN: string
  /** A root with no config at all. */
  let EMPTY: string

  beforeEach(() => {
    clearConfigCache()
    VALID = makeRoot().global(GLOBAL_TWO_ZONES).path
    BROKEN = makeRoot().global(GLOBAL_BROKEN).path
    EMPTY = makeRoot().path
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    clearConfigCache()
    roots.splice(0).forEach((r) => r.cleanup())
  })

  describe('configRoot', () => {
    it('is the frontend project directory', () => {
      // Every environment this runs in (next dev/start, vitest, the standalone
      // server via process.chdir) has cwd there — see the module comment.
      expect(configRoot()).toBe(process.cwd())
    })
  })

  describe('loadGlobalConfig', () => {
    it('loads and validates the global config', () => {
      const config = loadGlobalConfig(VALID)
      expect(Object.keys(config.zones).sort()).toEqual(['minimal', 'test'])
      expect(config.zones.test.modules[0]).toEqual({
        key: 'l4-opcpa',
        text: 'L4 OPCPA Controls',
      })
    })

    it('throws ConfigError when the file is missing', () => {
      expect(() => loadGlobalConfig(EMPTY)).toThrow(ConfigError)
      expect(() => loadGlobalConfig(EMPTY)).toThrow(/global config not found/)
    })

    it('throws ConfigError for a schema-invalid file', () => {
      expect(() => loadGlobalConfig(BROKEN)).toThrow(ConfigError)
      expect(() => loadGlobalConfig(BROKEN)).toThrow(
        new RegExp(`${GLOBAL_CONFIG_FILE.replace('/', '\\/')} is invalid`),
      )
    })

    it('production: caches successes (same object back)', () => {
      vi.stubEnv('NODE_ENV', 'production')
      expect(loadGlobalConfig(VALID)).toBe(loadGlobalConfig(VALID))
    })

    it('production: caches failures (same error back)', () => {
      vi.stubEnv('NODE_ENV', 'production')
      const grab = (): unknown => {
        try {
          loadGlobalConfig(BROKEN)
        } catch (e) {
          return e
        }
      }
      const first = grab()
      expect(first).toBeInstanceOf(ConfigError)
      expect(grab()).toBe(first)
    })

    it('production: clearConfigCache forces a re-read', () => {
      vi.stubEnv('NODE_ENV', 'production')
      const before = loadGlobalConfig(VALID)
      clearConfigCache()
      const after = loadGlobalConfig(VALID)
      expect(after).not.toBe(before)
      expect(after).toEqual(before)
    })

    it('development: does not cache — a fixed file is picked up without restart', () => {
      vi.stubEnv('NODE_ENV', 'development')
      const root = makeRoot().global('zones:\n  wip:\n    modules: []\n')
      expect(() => loadGlobalConfig(root.path)).toThrow(ConfigError)

      root.global('zones:\n  wip:\n    modules:\n      - key: p3\n')
      expect(loadGlobalConfig(root.path).zones.wip.modules).toHaveLength(1)
    })
  })

  describe('getZone', () => {
    it('returns the zone entry', () => {
      expect(getZone('test', VALID).title).toBe('L4 OPCPA')
    })

    it('names the valid zones when the code is unknown', () => {
      // The one runtime failure mode left, so the message has to be actionable.
      expect(() => getZone('tset', VALID)).toThrow(ConfigError)
      expect(() => getZone('tset', VALID)).toThrow(
        /ZONE_CODE="tset"[\s\S]*valid zones: minimal, test/,
      )
    })
  })

  describe('listZoneCodes', () => {
    it('lists every defined zone, sorted', () => {
      expect(listZoneCodes(VALID)).toEqual(['minimal', 'test'])
    })
  })

  describe('readModuleConfigText', () => {
    it('reads the file for one module and zone', () => {
      const root = makeRoot().module('p3', 'test', 'heading: P3\n')
      expect(readModuleConfigText('p3', 'test', root.path)).toBe('heading: P3\n')
    })

    it('throws for a missing file — there is deliberately no default fallback', () => {
      // A zone without its own file must NOT silently inherit another
      // station's PV names; it has to fail so the build catches it.
      const root = makeRoot().module('p3', 'test', 'heading: P3\n')
      expect(() => readModuleConfigText('p3', 'l4', root.path)).toThrow(
        ConfigError,
      )
      expect(() => readModuleConfigText('p3', 'l4', root.path)).toThrow(
        /module config not found[\s\S]*zone "l4"/,
      )
    })
  })
})
