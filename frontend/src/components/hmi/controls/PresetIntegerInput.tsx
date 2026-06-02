'use client'

import { FC, useState, useCallback, useId, useEffect } from 'react'
import { usePvWrite } from './usePvWrite'
import styles from './PresetIntegerInput.module.css'

interface PresetIntegerInputProps {
  label: string
  presets: readonly number[]
  /** PV to write the staged integer value to (e.g. `CMD_NL2_SET_DELAY` or
   * `AI_NL2_ATT`). */
  pvName: string
  /** Optional inclusive minimum. Values below this disable Confirm. */
  min?: number
  /** Optional inclusive maximum. Values above this disable Confirm. */
  max?: number
}

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

  // Clear the custom field after a successful write (the cog closes on success
  // anyway; this keeps it clean if the control lives outside a CogToggle).
  useEffect(() => {
    if (state === 'success') {
      setStaged(null)
      setCustomText('')
    }
  }, [state])

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

  // Presets apply immediately — no CONFIRM step (spec: preset buttons must
  // apply on click). The manual custom value still goes through CONFIRM.
  const onPresetClick = useCallback(
    (value: number) => {
      if (pending) return
      void write(pvName, value)
    },
    [pending, pvName, write],
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
              onClick={() => onPresetClick(p)}
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
          {staged !== null && pending ? `Setting ${staged}…` : 'Confirm'}
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
