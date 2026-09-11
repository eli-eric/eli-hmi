/**
 * Where the display format of a numeric readout comes from. Deliberately
 * mirrors `units.ts`, so the two answers to "who decides how this number
 * looks" are decided the same way and in one place each.
 *
 * 1. `config`   — the module's config for this zone. Operator-controlled, so
 *                 it wins.
 * 2. `fallback` — a default a component supplies for a readout that needs its
 *                 own, for example a signal that is only readable in
 *                 exponential form.
 * 3. `DEFAULT_VALUE_FORMAT` — three decimal places, the historical behaviour.
 *
 * `units.ts` has a middle `metadata` tier for the PV's own EGU field. There is
 * no equivalent here yet: `Message` carries no precision, because subscriptions
 * run at detail 'time' and EPICS `PREC` only arrives at detail 'control'. When
 * that changes, a `metadata` slot belongs between config and fallback, and
 * callers do not change.
 */

import {
  DEFAULT_VALUE_FORMAT,
  type ValueFormatOptions,
} from '@/lib/utils/pv-helpers'

export interface FormatSources {
  config?: ValueFormatOptions
  fallback?: ValueFormatOptions
}

export function resolveFormat({
  config,
  fallback,
}: FormatSources): ValueFormatOptions {
  return config ?? fallback ?? DEFAULT_VALUE_FORMAT
}
