/**
 * Schema + parser for the shared p3/l3bt/l4fbt module-page configuration.
 *
 * The YAML file adds `schemaVersion` to the existing camelCase `ModuleConfig`
 * shape. The UI-facing object deliberately omits that file-only field so the
 * shared module-page components keep their established contract.
 *
 * This module has no filesystem or `server-only` dependency: runtime file
 * resolution lives in `module-config-loader.ts`, while tests and config-repo
 * validation can parse a supplied string directly.
 */

import { z } from 'zod'
import { parse as parseYaml } from 'yaml'

import { deepFreeze } from '@/lib/utils/deep-freeze'

export const MODULE_CONFIG_SCHEMA_VERSION = 1

const nonBlank = z.string().trim().min(1)
const displayText = nonBlank.describe('Non-empty text displayed in the UI.')
const pvName = nonBlank.describe(
  'Logical PV name passed to the frontend PV adapters.',
)
const cssSize = nonBlank.describe('CSS size used by the module-page layout.')

const valueFormatOptionsSchema = z.strictObject({
  format: z
    .enum(['exponential', 'precision', 'raw'])
    .describe('Numeric display format.'),
  toExponential: z
    .number()
    .optional()
    .describe('Digits passed to Number.toExponential.'),
  toPrecision: z
    .number()
    .optional()
    .describe('Precision passed to Number.toPrecision.'),
})

export const interlockItemSchema = z.strictObject({
  pvname: pvName,
  title: displayText,
})

export const interlockGroupConfigSchema = z.strictObject({
  title: displayText,
  width: cssSize.optional(),
  checkClearPv: pvName
    .optional()
    .describe('Optional PV used to clear the interlock group.'),
  items: z.array(interlockItemSchema),
})

export const sensorEntrySchema = z.strictObject({
  pvName,
  label: displayText,
  options: valueFormatOptionsSchema.optional(),
})

export const pumpConfigSchema = z.strictObject({
  title: displayText,
  rpmPV: pvName,
  valvePv: pvName,
  valveLabel: displayText,
})

export const sensorGroupSchema = z.strictObject({
  title: displayText,
  label: displayText,
  height: cssSize.optional(),
  sensorPVs: z.array(sensorEntrySchema),
})

export const backingConfigSchema = z.strictObject({
  title: displayText,
  width: cssSize.optional(),
  containerWidth: cssSize.optional(),
  sensorBar: sensorGroupSchema,
  pump: pumpConfigSchema,
})

export const lockingConfigSchema = z.strictObject({
  label: displayText,
  pvName,
})

export const roughingConfigSchema = z.strictObject({
  title: displayText,
  width: cssSize.optional(),
  containerWidth: cssSize.optional(),
  sensorBar: sensorGroupSchema,
  pump: pumpConfigSchema,
  locking: lockingConfigSchema.optional(),
})

export const cdaVolumeSchema = z.strictObject({
  title: displayText,
  width: cssSize.optional(),
  pressure: sensorEntrySchema,
  flow: sensorEntrySchema,
})

export const cleanDryAirConfigSchema = z.strictObject({
  title: displayText,
  width: cssSize.optional(),
  volumes: z.array(cdaVolumeSchema),
})

/** UI-facing shape; intentionally has no file-only schemaVersion field. */
export const moduleConfigSchema = z.strictObject({
  heading: displayText.describe('Heading text rendered in the top section.'),
  interlocks: interlockGroupConfigSchema,
  safetyPermission: interlockGroupConfigSchema,
  cleanDryAir: cleanDryAirConfigSchema,
  backing: backingConfigSchema,
  roughing: roughingConfigSchema,
})

/** Complete runtime YAML file shape used for parsing and JSON Schema output. */
export const moduleConfigFileSchema = z.strictObject({
  schemaVersion: z
    .literal(MODULE_CONFIG_SCHEMA_VERSION)
    .describe(
      `Module-config schema version understood by the app (currently ${MODULE_CONFIG_SCHEMA_VERSION}).`,
    ),
  ...moduleConfigSchema.shape,
})

export type InterlockItem = z.infer<typeof interlockItemSchema>
export type InterlockGroupConfig = z.infer<typeof interlockGroupConfigSchema>
export type SensorEntry = z.infer<typeof sensorEntrySchema>
export type PumpConfig = z.infer<typeof pumpConfigSchema>
export type SensorGroup = z.infer<typeof sensorGroupSchema>
export type BackingConfig = z.infer<typeof backingConfigSchema>
export type LockingConfig = z.infer<typeof lockingConfigSchema>
export type RoughingConfig = z.infer<typeof roughingConfigSchema>
export type CDAVolume = z.infer<typeof cdaVolumeSchema>
export type CleanDryAirConfig = z.infer<typeof cleanDryAirConfigSchema>
export type ModuleConfig = z.infer<typeof moduleConfigSchema>
export type ModuleConfigFile = z.infer<typeof moduleConfigFileSchema>

/**
 * Parse one module YAML file into the established UI-facing `ModuleConfig`.
 * `name` is the config-dir-relative reference used in operator-facing errors.
 */
export function parseModuleConfig(text: string, name: string): ModuleConfig {
  let data: unknown
  try {
    data = parseYaml(text)
  } catch (e) {
    throw new Error(`${name} is not valid YAML: ${(e as Error).message}`)
  }

  const result = moduleConfigFileSchema.safeParse(data)
  if (!result.success) {
    throw new Error(`${name} is invalid:\n${z.prettifyError(result.error)}`)
  }

  const config = { ...result.data }
  Reflect.deleteProperty(config, 'schemaVersion')
  return deepFreeze(config)
}
