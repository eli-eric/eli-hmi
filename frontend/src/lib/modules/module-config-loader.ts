import 'server-only'

import {
  ConfigError,
  configRoot,
  readModuleConfigText,
} from '@/lib/settings/config-loader'
import { getCurrentZoneCode } from '@/lib/settings/zone-service'
import { moduleConfigPath, type ModuleKey } from '@/lib/settings/zone-schema'

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
    throw new ConfigError(
      `ZONE_CODE is not set — cannot resolve the ${key} module config`,
    )
  }

  const cacheKey = `${configRoot()}\0${zoneCode}\0${key}`
  const cached = moduleConfigCache.get(cacheKey)
  if (cached) return cached

  const path = moduleConfigPath(key, zoneCode)
  let config: ModuleConfig
  try {
    config = parseModuleConfig(readModuleConfigText(key, zoneCode), path)
  } catch (e) {
    if (e instanceof ConfigError) throw e
    throw new ConfigError((e as Error).message, { cause: e })
  }

  if (process.env.NODE_ENV === 'production') {
    moduleConfigCache.set(cacheKey, config)
  }
  return config
}
