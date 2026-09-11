/**
 * The one zod definition of `ValueFormatOptions`, shared by every config format
 * that lets an operator choose how a number is rendered — the vacuum modules'
 * per-sensor `options:` and L4 OPCPA's per-role `format:` block.
 *
 * Kept next to `pv-helpers.ts` rather than inside either config schema so the
 * two cannot drift: what validates here is exactly what `getFormattedValue`
 * consumes.
 */

import { z } from 'zod'

const fullSchema = z.strictObject({
  format: z
    .enum(['exponential', 'precision', 'fixed', 'raw'])
    .describe(
      'Numeric display format: fixed = decimal places, precision = significant digits.',
    ),
  toExponential: z
    .number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .describe('Digits passed to Number.toExponential.'),
  toPrecision: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe('Significant digits passed to Number.toPrecision.'),
  toFixed: z
    .number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .describe('Decimal places passed to Number.toFixed.'),
})

/**
 * Accepts either the full object or a bare number.
 *
 * The bare number is the common case by a wide margin — "round this to one
 * decimal place" — so it is spelled `regenTemp: 1` rather than
 * `regenTemp: { format: fixed, toFixed: 1 }`. It normalises to the full object,
 * so nothing downstream has to know about the shorthand.
 *
 * Deliberately `preprocess` rather than a union: a union reports any bad input
 * as a bare "Invalid input", losing which key of the object was wrong. Widening
 * the number first keeps `fullSchema`'s field-level messages, which are what a
 * config author actually needs.
 */
export const valueFormatSchema = z
  .preprocess(
    (value) =>
      typeof value === 'number' && Number.isInteger(value) && value >= 0
        ? { format: 'fixed', toFixed: value }
        : value,
    fullSchema,
  )
  .describe(
    'Numeric display format: a number of decimal places, or a full {format, …} object.',
  )
