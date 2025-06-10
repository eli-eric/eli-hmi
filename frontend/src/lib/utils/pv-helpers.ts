/**
 * Mapping of PV types to their dev environment prefixes
 */
export enum PVType {
  STATUS = 'STATUS',
  PRESSURE = 'PRESSURE',
  TEMP = 'TEMP',
  ACTUAL_FREQUENCY = 'ActualFrequency',
  ACTUAL_TEMPERATURE = 'ActualConverterTemperature',
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',

  INTERLOCK = 'INTERLOCK',
  PERMISSION = 'PERMISSION',
  CDA_PRESSURE = 'CDA_PRESSURE',
  TARGET = 'TARGET',
}

/**
 * Configuration for PV prefixes in development environment
 */
export const PV_PREFIX_CONFIG: Record<PVType, string> = {
  [PVType.STATUS]: 'SI_',
  [PVType.PRESSURE]: 'AI_MBAR_',
  [PVType.TEMP]: 'AI_K_',
  [PVType.ACTUAL_FREQUENCY]: 'AI_RPM_',
  [PVType.ACTUAL_TEMPERATURE]: 'AI_TEMP_',
  [PVType.CLOSED]: 'BI_CLOSED_',
  [PVType.OPEN]: 'BI_OPEN_',
  [PVType.INTERLOCK]: 'BI_INTERLOCK_',
  [PVType.PERMISSION]: 'BI_PERMISSION_',
  [PVType.CDA_PRESSURE]: 'AI_BAR_',
  [PVType.TARGET]: 'SI_',
}

export function getPrefixedPV(pv: string): string {
  if (process.env.NODE_ENV !== 'development') {
    return pv
  }
  const pvType = Object.keys(PV_PREFIX_CONFIG).find((key) =>
    pv.includes(key),
  ) as PVType
  if (!pvType) {
    return pv // Return original PV if no type matches
  }

  return `${PV_PREFIX_CONFIG[pvType]}${pv}`
}

/**
 * A simplified version that takes the prefix directly
 * @param pv - The original PV name
 * @param prefix - The prefix to use in development environment
 * @returns The PV name with the appropriate prefix for the current environment
 */
export function getPrefixedPVWithCustomPrefix(
  pv: string,
  prefix: string,
): string {
  if (process.env.NODE_ENV !== 'development') {
    return pv
  }

  return `${prefix}${pv}`
}

export interface ValueFormatProps {
  value?: number | null

  options?: ValueFormatOptions
}

export type ValueFormatOptions = {
  format: ValueFormat
  toExponential?: number
  toPrecision?: number
}

export type ValueFormat = 'exponencial' | 'precision' | 'raw'

/**
 * Formats a numeric value based on the specified format type.
 * Returns 'N/A' for null or undefined values.
 *
 * @param {ValueFormatOptions} options - The options for formatting the value.
 * @returns {string} The formatted value as a string.
 */
export const getFormattedValue = ({
  value,
  options,
}: ValueFormatProps): string => {
  if (value === null || value === undefined) {
    return 'N/A'
  }
  const { format, toExponential = 2, toPrecision = 3 } = options || {}

  switch (format) {
    case 'exponencial':
      return value?.toExponential(toExponential) || 'N/A'
    case 'precision':
      return value?.toPrecision(toPrecision) || 'N/A'
    case 'raw':
      return value?.toString() || 'N/A'
    default:
      return value?.toExponential(toExponential) || 'N/A'
  }
}
