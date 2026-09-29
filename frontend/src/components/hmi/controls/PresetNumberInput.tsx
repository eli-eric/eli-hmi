'use client'

import { FC, useState, useCallback, useId } from 'react'
import { usePvWrite } from './usePvWrite'
import styles from './PresetNumberInput.module.css'

interface PresetNumberInputProps {
  label: string
  presets: readonly number[]
  /** PV to write the value to (e.g. `CMD_NL2_SET_DELAY` or `AI_NL2_ATT`). */
  pvName: string
  /** Optional inclusive minimum. Values below this disable Confirm. */
  min?: number
  /** Optional inclusive maximum. Values above this disable Confirm. */
  max?: number
  /**
   * Decimal places the device resolves. 0 (the default) means integers only.
   * Digits typed beyond it are ignored — truncated, never rounded, so 2.55 is
   * 2.5 and never 2.6 — and the field shows the truncated value once it loses
   * focus, so what is on screen is always what would be written. Same meaning
   * as `FloatValue`'s `precision`, applied to input rather than display.
   */
  precision?: number
}

/**
 * Drops digits the device cannot resolve, working on the text rather than the
 * number: `Math.trunc(2.55 * 10) / 10` is at the mercy of binary floating
 * point, while slicing the string is exact. Truncates rather than rounds —
 * ignoring extra digits is what it claims to do, and 2.59 becoming 2.6 would
 * be the field inventing a value the operator never typed.
 */
function truncate(text: string, precision: number): string {
  const [whole, fraction] = text.split('.')
  if (fraction === undefined) return text
  if (precision === 0) return whole === '' ? '0' : whole
  return `${whole}.${fraction.slice(0, precision)}`
}

/**
 * Numeric setter used by Trigger Delay, the Attenuator and YDFA current.
 *
 * - Preset buttons apply immediately on click (one click = one write); they do
 *   NOT require a separate confirm.
 * - A custom value is typed into the field and committed with the inline
 *   Confirm button sitting directly next to the field.
 * - There is no Cancel button.
 */
export const PresetNumberInput: FC<PresetNumberInputProps> = ({
  label,
  presets,
  pvName,
  min,
  max,
  precision = 0,
}) => {
  const inputId = useId()
  const [staged, setStaged] = useState<number | null>(null)
  const [customText, setCustomText] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const { state, error, write, reset } = usePvWrite({ flashMs: 0 })
  const pending = state === 'pending'

  const inRange = (n: number) =>
    (min === undefined || n >= min) && (max === undefined || n <= max)
  const stagedValid = staged !== null && inRange(staged)
  const rangeError =
    staged !== null && !stagedValid
      ? `Out of range (${min ?? '−∞'}..${max ?? '∞'})`
      : null

  // Clear the custom field after a successful write. `state` is the external
  // signal from usePvWrite; adjust local state during render off its transition
  // (React's "storing information from previous renders" pattern) instead of in
  // an effect, so the reset lands in the same commit.
  const [prevWriteState, setPrevWriteState] = useState(state)
  if (state !== prevWriteState) {
    setPrevWriteState(state)
    if (state === 'success') {
      setStaged(null)
      setCustomText('')
    }
  }

  const onCustomChange = useCallback(
    (v: string) => {
      // Typing is a fresh attempt: clear any error left by the previous one.
      reset()
      setCustomText(v)
      const trimmed = v.trim()
      if (trimmed === '') {
        setStaged(null)
        setParseError(null)
        return
      }
      // Partial input mid-typing (e.g. just "-") — clear staged but do not
      // surface an error yet; the user is still editing.
      if (trimmed === '-' || trimmed === '+') {
        setStaged(null)
        setParseError(null)
        return
      }
      if (!Number.isFinite(Number(trimmed))) {
        setStaged(null)
        setParseError(`Invalid number: "${v}"`)
        return
      }
      setParseError(null)
      setStaged(Number(truncate(trimmed, precision)))
    },
    [reset, precision],
  )

  // Leaving the field replaces what was typed with what would be written.
  // Without this the two could disagree — 2.55 shown, 2.5 sent — which is the
  // one thing truncation must not cost.
  const onBlur = useCallback(() => {
    if (staged === null) return
    setCustomText(String(staged))
  }, [staged])

  // Preset chips apply immediately — one click writes the value.
  const onChipClick = useCallback(
    (value: number) => {
      if (pending) return
      void write(pvName, value)
    },
    [pending, write, pvName],
  )

  const onConfirm = useCallback(() => {
    if (staged === null) return
    const ok =
      (min === undefined || staged >= min) &&
      (max === undefined || staged <= max)
    if (!ok) return
    void write(pvName, staged)
  }, [staged, pvName, write, min, max])

  return (
    <div className={styles.wrapper}>
      <div className={styles.label}>{label}</div>
      {presets.length > 0 && (
        <div className={styles.chips}>
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              className={styles.chip}
              disabled={pending}
              onClick={() => onChipClick(p)}
            >
              {p}
            </button>
          ))}
        </div>
      )}
      <div className={styles.customRow}>
        {/* "Custom" only means something next to preset chips. With no
            presets the field is simply the value, so the word is dropped —
            and `label` becomes the input's accessible name, which the visible
            <label> was providing until now. */}
        {presets.length > 0 && (
          <label className={styles.customLabel} htmlFor={inputId}>
            Custom
          </label>
        )}
        <input
          id={inputId}
          className={styles.input}
          type="number"
          // The spinner then only ever produces values the device resolves.
          step={precision > 0 ? 10 ** -precision : 1}
          inputMode={precision > 0 ? 'decimal' : 'numeric'}
          aria-label={presets.length > 0 ? undefined : label}
          value={customText}
          min={min}
          max={max}
          onChange={(e) => onCustomChange(e.target.value)}
          onBlur={onBlur}
        />
        <button
          type="button"
          className={styles.confirm}
          onClick={onConfirm}
          disabled={!stagedValid || pending}
          data-state={pending ? 'pending' : error ? 'error' : 'idle'}
        >
          {pending ? 'Setting…' : 'Confirm'}
        </button>
      </div>
      {(error || rangeError || parseError) && (
        <div className={styles.errorRow}>
          {error ?? rangeError ?? parseError}
        </div>
      )}
    </div>
  )
}
