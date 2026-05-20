import type { ValueFormatOptions } from '@/lib/utils/pv-helpers'

export interface InterlockItem {
  pvname: string
  title: string
}

export interface InterlockGroupConfig {
  title: string
  width?: string
  /** Optional PV that clears the group (renders a clear button on the panel). */
  checkClearPv?: string
  items: InterlockItem[]
}

export interface SensorEntry {
  pvName: string
  label: string
  options?: ValueFormatOptions
}

export interface PumpConfig {
  title: string
  rpmPV: string
  valvePv: string
  valveLabel: string
}

export interface SensorGroup {
  title: string
  label: string
  height?: string
  sensorPVs: SensorEntry[]
}

export interface BackingConfig {
  title: string
  width?: string
  /** When set, wraps the contents in `VolumePanel.Container` of that width. */
  containerWidth?: string
  sensorBar: SensorGroup
  pump: PumpConfig
}

export interface LockingConfig {
  label: string
  pvName: string
}

export interface RoughingConfig {
  title: string
  width?: string
  containerWidth?: string
  sensorBar: SensorGroup
  pump: PumpConfig
  locking?: LockingConfig
}

export interface CDAVolume {
  title: string
  width?: string
  pressure: SensorEntry
  flow: SensorEntry
}

export interface CleanDryAirConfig {
  title: string
  /** Outer panel width; defaults to '100%' when there are multiple inner volumes. */
  width?: string
  /**
   * One inner volume → renders a single `VolumePanel.Container`.
   * Two or more → wraps in `VolumePanel.MultiVolumes`.
   */
  volumes: CDAVolume[]
}

export interface ModuleConfig {
  /** Heading text rendered in the top section. */
  heading: string
  interlocks: InterlockGroupConfig
  safetyPermission: InterlockGroupConfig
  cleanDryAir: CleanDryAirConfig
  backing: BackingConfig
  roughing: RoughingConfig
}
