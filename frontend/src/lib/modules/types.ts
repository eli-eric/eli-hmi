/**
 * Compatibility export surface for the shared module-page components.
 *
 * The types are inferred from the runtime Zod schema so TypeScript, YAML
 * validation, and the generated JSON Schema cannot drift apart.
 */
export type {
  BackingConfig,
  CDAVolume,
  CleanDryAirConfig,
  InterlockGroupConfig,
  InterlockItem,
  LockingConfig,
  ModuleConfig,
  PumpConfig,
  RoughingConfig,
  SensorEntry,
  SensorGroup,
} from './module-config-schema'
