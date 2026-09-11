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
  CLOSE = 'CLOSE',
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
  [PVType.CLOSED]: 'BI_',
  [PVType.OPEN]: 'BI_',
  [PVType.INTERLOCK]: 'BI_',
  [PVType.PERMISSION]: 'BI_',
  [PVType.CDA_PRESSURE]: 'AI_BAR_',
  [PVType.TARGET]: 'SI_',
  [PVType.CLOSE]: 'BI_',
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
  toFixed?: number
}

/**
 * `precision` is significant digits (`Number.toPrecision`); `fixed` is decimal
 * places (`Number.toFixed`). They are different questions and operators ask the
 * second one ("round this to one decimal"), so both exist rather than one
 * pretending to be the other.
 */
export type ValueFormat = 'exponential' | 'precision' | 'fixed' | 'raw'

/** Applied when neither the config nor a call site says otherwise. */
export const DEFAULT_VALUE_FORMAT: ValueFormatOptions = {
  format: 'fixed',
  toFixed: 3,
}

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
  const {
    format,
    toExponential = 2,
    toPrecision = 3,
    toFixed = 3,
  } = options || {}

  switch (format) {
    case 'exponential':
      return value?.toExponential(toExponential) || 'N/A'
    case 'precision':
      return value?.toPrecision(toPrecision) || 'N/A'
    case 'fixed':
      return value.toFixed(toFixed)
    case 'raw':
      return value?.toString() || 'N/A'
    default:
      return value?.toExponential(toExponential) || 'N/A'
  }
}
