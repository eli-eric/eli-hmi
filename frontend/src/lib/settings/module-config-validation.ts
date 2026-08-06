/**
 * Runtime parser dispatch for every module reference a zone file understands.
 *
 * The registry is intentionally typed against `ModuleKey`: adding a module to
 * `MODULE_ROUTES` without choosing its parser is a compile error. Validation
 * walks references, rather than allowed routes, so a disabled page cannot hide
 * stale or malformed config that will become active on a future rollout.
 */

import { parseLaserSpecs } from '@/app/(modules)/l4-opcpa/config/schema'
import { parseModuleConfig } from '@/lib/modules/module-config-schema'

import { readModuleConfigText } from './zone-config-loader'
import type { ModuleKey, ZoneFile } from './zone-schema'

type ModuleConfigParser = (text: string, name: string) => unknown

export const MODULE_CONFIG_PARSERS = {
  'l4-opcpa': (text: string) => parseLaserSpecs(text),
  p3: parseModuleConfig,
  l3bt: parseModuleConfig,
  l4fbt: parseModuleConfig,
} satisfies Record<ModuleKey, ModuleConfigParser>

export interface ModuleConfigReference {
  moduleKey: ModuleKey
  config: string
}

/** List every configured module slot in parser-registry order. */
export function listReferencedModuleConfigs(
  zone: ZoneFile,
): ModuleConfigReference[] {
  const references: ModuleConfigReference[] = []
  for (const moduleKey of Object.keys(MODULE_CONFIG_PARSERS) as ModuleKey[]) {
    const reference = zone.modules[moduleKey]
    if (reference) references.push({ moduleKey, config: reference.config })
  }
  return references
}

/**
 * Read and parse every module config referenced by `zone`.
 *
 * Returns the validated references for startup summaries and config-repo
 * orphan tracking. Errors identify both the module slot and relative path so
 * an operator can fix the right file without reconstructing the reference.
 */
export function validateReferencedModuleConfigs(
  zone: ZoneFile,
  readConfig: (relPath: string) => string = readModuleConfigText,
): ModuleConfigReference[] {
  const references = listReferencedModuleConfigs(zone)

  for (const { moduleKey, config } of references) {
    try {
      MODULE_CONFIG_PARSERS[moduleKey](readConfig(config), config)
    } catch (error) {
      throw new Error(
        `modules.${moduleKey} (${config}): ${(error as Error).message}`,
        { cause: error },
      )
    }
  }

  return references
}
