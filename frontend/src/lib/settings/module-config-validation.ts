/**
 * Parser dispatch for every module config the app understands.
 *
 * The registry is intentionally typed against `ModuleKey`: adding a module to
 * `MODULES` without choosing its parser is a compile error.
 *
 * Validation walks the module registry rather than a zone's enabled list, so a
 * file prepared for a zone that is not rolled out yet — and the config of a
 * module no zone currently turns on — still gets checked. Nothing on disk
 * escapes validation just because it is not live.
 */

import { parseLaserSpecs } from '@/app/(modules)/l4-opcpa/config/schema'
import { parseModuleConfig } from '@/lib/modules/module-config-schema'

import { readModuleConfigText } from './config-loader'
import {
  MODULE_KEYS,
  moduleConfigPath,
  type ModuleKey,
  type ZoneEntry,
} from './zone-schema'

type ModuleConfigParser = (text: string, name: string) => unknown

export const MODULE_CONFIG_PARSERS = {
  'l4-opcpa': (text: string, name: string) => parseLaserSpecs(text, name),
  p3: parseModuleConfig,
  l3bt: parseModuleConfig,
  l4fbt: parseModuleConfig,
} satisfies Record<ModuleKey, ModuleConfigParser>

export interface ModuleConfigReference {
  moduleKey: ModuleKey
  /** Path relative to the frontend project root. */
  config: string
  /** Whether the zone this was resolved for actually turns the module on. */
  enabled: boolean
}

/** Every module's config path for one zone, flagged by whether it is enabled. */
export function listModuleConfigs(
  zoneCode: string,
  zone?: ZoneEntry,
): ModuleConfigReference[] {
  const enabled = new Set(zone?.modules.map((m) => m.key) ?? [])
  return MODULE_KEYS.map((moduleKey) => ({
    moduleKey,
    config: moduleConfigPath(moduleKey, zoneCode),
    enabled: enabled.has(moduleKey),
  }))
}

type ReadConfig = (key: ModuleKey, zoneCode: string) => string

/**
 * Read and parse one module's config for one zone.
 *
 * Errors identify the module, the zone and the path so an operator can fix the
 * right file without reconstructing the reference.
 */
export function validateModuleConfig(
  moduleKey: ModuleKey,
  zoneCode: string,
  readConfig: ReadConfig = readModuleConfigText,
): void {
  const path = moduleConfigPath(moduleKey, zoneCode)
  try {
    MODULE_CONFIG_PARSERS[moduleKey](readConfig(moduleKey, zoneCode), path)
  } catch (error) {
    throw new Error(`${moduleKey} (${path}): ${(error as Error).message}`, {
      cause: error,
    })
  }
}

/**
 * Validate every module a zone turns on. Used by the startup summary; the
 * build-time sweep over every file on disk lives in `scripts/validate-config.ts`.
 */
export function validateEnabledModuleConfigs(
  zoneCode: string,
  zone: ZoneEntry,
  readConfig: ReadConfig = readModuleConfigText,
): ModuleConfigReference[] {
  const enabled = listModuleConfigs(zoneCode, zone).filter((r) => r.enabled)
  for (const { moduleKey } of enabled) {
    validateModuleConfig(moduleKey, zoneCode, readConfig)
  }
  return enabled
}
