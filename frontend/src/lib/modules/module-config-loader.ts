import 'server-only'

import {
  getConfigDir,
  loadZoneFile,
  readModuleConfigText,
  ZoneConfigError,
} from '@/lib/settings/zone-config-loader'
import { getCurrentZoneCode } from '@/lib/settings/zone-service'
import type { ModuleKey } from '@/lib/settings/zone-schema'

import { parseModuleConfig, type ModuleConfig } from './module-config-schema'

const moduleConfigKeyMap = {
  p3: true,
  l3bt: true,
  l4fbt: true,
} as const satisfies Record<Exclude<ModuleKey, 'l4-opcpa'>, true>

export type ModuleConfigKey = keyof typeof moduleConfigKeyMap
export const MODULE_CONFIG_KEYS = Object.keys(
  moduleConfigKeyMap,
) as ModuleConfigKey[]

/**
 * Successful production parses, keyed by every input that selects the file.
 * Deployments reload config by restarting; development reads on every call.
 */
const moduleConfigCache = new Map<string, ModuleConfig>()

/** Tests only. */
export function clearModuleConfigCache(): void {
  moduleConfigCache.clear()
}

/** Resolve and parse one data-driven module config for the current zone. */
export function loadModuleConfig(key: ModuleConfigKey): ModuleConfig {
  const zoneCode = getCurrentZoneCode()
  if (!zoneCode) {
    throw new ZoneConfigError(
      `ZONE_CODE is not set — cannot resolve the ${key} module config`,
    )
  }

  const zone = loadZoneFile(zoneCode)
  const ref = zone.modules[key]
  if (!ref) {
    throw new ZoneConfigError(
      `zone "${zoneCode}" has no modules.${key} config reference`,
    )
  }

  const cacheKey = `${getConfigDir()}\0${zoneCode}\0${key}\0${ref.config}`
  const cached = moduleConfigCache.get(cacheKey)
  if (cached) return cached

  let config: ModuleConfig
  try {
    config = parseModuleConfig(readModuleConfigText(ref.config), ref.config)
  } catch (e) {
    if (e instanceof ZoneConfigError) throw e
    throw new ZoneConfigError((e as Error).message, { cause: e })
  }

  if (process.env.NODE_ENV === 'production') {
    moduleConfigCache.set(cacheKey, config)
  }
  return config
}
