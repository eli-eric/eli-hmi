import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearZoneCache,
  getConfigDir,
  loadZoneFile,
  readModuleConfigText,
  ZoneConfigError,
} from './zone-config-loader'

const FIXTURE_DIR = join(__dirname, '__fixtures__', 'config-dir')

describe('zone-config-loader', () => {
  beforeEach(() => {
    vi.stubEnv('CONFIG_DIR', FIXTURE_DIR)
    clearZoneCache()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    clearZoneCache()
  })

  describe('getConfigDir', () => {
    it('uses CONFIG_DIR when set', () => {
      expect(getConfigDir()).toBe(FIXTURE_DIR)
    })

    it('falls back to the in-repo template when unset', () => {
      vi.stubEnv('CONFIG_DIR', undefined as unknown as string)
      expect(getConfigDir()).toBe(join(process.cwd(), '..', 'eli-hmi-config'))
    })
  })

  describe('loadZoneFile', () => {
    it('loads and validates a zone file', () => {
      const zone = loadZoneFile('test')
      expect(zone.allowedRoutes).toEqual(['/l4-opcpa'])
      expect(zone.modules['l4-opcpa']?.config).toBe(
        'modules/l4-opcpa/lasers.yaml',
      )
    })

    it('throws ZoneConfigError for a missing zone file', () => {
      expect(() => loadZoneFile('nope')).toThrow(ZoneConfigError)
      expect(() => loadZoneFile('nope')).toThrow(/zone config not found/)
    })

    it('throws ZoneConfigError for an invalid zone code', () => {
      expect(() => loadZoneFile('../etc/passwd')).toThrow(/invalid zone code/)
    })

    it('throws ZoneConfigError for a schema-invalid file', () => {
      expect(() => loadZoneFile('broken')).toThrow(ZoneConfigError)
      expect(() => loadZoneFile('broken')).toThrow(/broken\.yaml is invalid/)
    })

    it('caches successes (same object back)', () => {
      expect(loadZoneFile('test')).toBe(loadZoneFile('test'))
    })

    it('caches failures (same error back)', () => {
      let first: unknown
      let second: unknown
      try {
        loadZoneFile('broken')
      } catch (e) {
        first = e
      }
      try {
        loadZoneFile('broken')
      } catch (e) {
        second = e
      }
      expect(first).toBeInstanceOf(ZoneConfigError)
      expect(second).toBe(first)
    })

    it('clearZoneCache forces a re-read', () => {
      const before = loadZoneFile('test')
      clearZoneCache()
      const after = loadZoneFile('test')
      expect(after).not.toBe(before)
      expect(after).toEqual(before)
    })
  })

  describe('readModuleConfigText', () => {
    it('reads a file inside the config dir', () => {
      const text = readModuleConfigText('modules/l4-opcpa/lasers.yaml')
      expect(text).toContain('lasers:')
    })

    it('rejects absolute paths', () => {
      expect(() =>
        readModuleConfigText(join(FIXTURE_DIR, 'zones/test.yaml')),
      ).toThrow(/must be relative/)
    })

    it('rejects paths escaping the config dir', () => {
      expect(() => readModuleConfigText('../zone-schema.ts')).toThrow(
        /escapes the config dir/,
      )
    })

    it('throws for a missing file', () => {
      expect(() => readModuleConfigText('modules/nope.yaml')).toThrow(
        /module config not found/,
      )
    })

    it('rejects a symlink pointing outside the config dir', () => {
      const scratch = mkdtempSync(join(tmpdir(), 'zone-config-'))
      try {
        const outside = join(scratch, 'outside.yaml')
        writeFileSync(outside, 'secret: true\n')
        const dir = join(scratch, 'config')
        mkdirSync(join(dir, 'modules'), { recursive: true })
        symlinkSync(outside, join(dir, 'modules', 'sneaky.yaml'))
        vi.stubEnv('CONFIG_DIR', dir)

        expect(() => readModuleConfigText('modules/sneaky.yaml')).toThrow(
          /escapes the config dir via a symlink/,
        )
      } finally {
        rmSync(scratch, { recursive: true, force: true })
      }
    })
  })
})
