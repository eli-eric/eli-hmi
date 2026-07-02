'use client'

import { FC, useState, useCallback, useId } from 'react'
import { usePvWrite } from './usePvWrite'
import styles from './PresetIntegerInput.module.css'

interface PresetIntegerInputProps {
  label: string
  presets: readonly number[]
  /** PV to write the integer value to (e.g. `CMD_NL2_SET_DELAY` or
   * `AI_NL2_ATT`). */
  pvName: string
  /** Optional inclusive minimum. Values below this disable Confirm. */
  min?: number
  /** Optional inclusive maximum. Values above this disable Confirm. */
  max?: number
}

/**
 * Integer setter used by Trigger Delay and the Attenuator.
 *
 * - Preset buttons apply immediately on click (one click = one write); they do
 *   NOT require a separate confirm.
 * - A custom value is typed into the field and committed with the inline
 *   Confirm button sitting directly next to the field.
 * - There is no Cancel button.
 */
export const PresetIntegerInput: FC<PresetIntegerInputProps> = ({
  label,
  presets,
  pvName,
  min,
  max,
}) => {
  const inputId = useId()
  const [staged, setStaged] = useState<number | null>(null)
  const [customText, setCustomText] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const { state, error, write } = usePvWrite({ flashMs: 0 })
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

  const onCustomChange = useCallback((v: string) => {
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
    const n = Number(trimmed)
    if (!Number.isFinite(n)) {
      setStaged(null)
      setParseError(`Invalid number: "${v}"`)
      return
    }
    if (!Number.isInteger(n)) {
      setStaged(null)
      setParseError('Integer required')
      return
    }
    setParseError(null)
    setStaged(n)
  }, [])

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
        <label className={styles.customLabel} htmlFor={inputId}>
          Custom
        </label>
        <input
          id={inputId}
          className={styles.input}
          type="number"
          inputMode="numeric"
          value={customText}
          min={min}
          max={max}
          onChange={(e) => onCustomChange(e.target.value)}
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
