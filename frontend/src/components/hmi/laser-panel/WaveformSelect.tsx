'use client'

import { FC, ReactNode, useEffect, useState, useCallback } from 'react'
import { listWaveforms } from '@/lib/api/pvs'
import { usePvWrite } from '@/components/hmi/controls/usePvWrite'
import { Tooltip } from '@/components/ui/tooltip/tooltip'
import { pv } from '@/app/(modules)/l4-opcpa/lib/pv-names'
import styles from './WaveformSelect.module.css'

interface WaveformSelectProps {
  laser: string
}

/**
 * Renders the hover/focus preview shown for a waveform. The `/waveforms`
 * endpoint currently returns names only — no point/shape data — so this is a
 * deliberate "Preview unavailable" placeholder rather than a faked waveform.
 *
 * This is the seam for a real preview: once the backend publishes shape data
 * (e.g. a points array), extend the signature to accept it and render an inline
 * SVG/canvas here. Callers and the tooltip wiring stay unchanged.
 */
export function renderWaveformPreview(name: string): ReactNode {
  return (
    <div className={styles.preview}>
      {name ? <span className={styles.previewName}>{name}</span> : null}
      <span className={styles.previewBody}>Preview unavailable</span>
      <span className={styles.previewHint}>
        No waveform shape data is published yet.
      </span>
    </div>
  )
}

// Module-scope cache: the waveform catalog is static, so we fetch once and
// reuse across all WaveformSelect mounts. Without this the cog fetches
// `/waveforms` every time the panel re-opens.
//
// Guarantee: "fetch once per page load on success." On fetch failure the
// cache is cleared so the next mount retries — i.e. failures degrade to
// "fetch once per mount until one succeeds", not "fetch and stick at []".
let catalogPromise: Promise<string[]> | null = null
function getCatalog(): Promise<string[]> {
  if (!catalogPromise) {
    catalogPromise = listWaveforms().catch(() => {
      catalogPromise = null // allow retry on next mount after a failure
      return []
    })
  }
  return catalogPromise
}

/**
 * Test-only escape hatch — clears the module-scope catalog cache so vitest
 * test cases (which share a module instance across runs) start fresh.
 *
 * **Do not import from production code.** The double-underscore prefix and
 * the `ForTests` suffix mark this as test-only API; reach for `vi.resetModules()`
 * or a context-injected loader if you need a non-test reset path (see #31).
 */
export function __resetWaveformCatalogForTests(): void {
  catalogPromise = null
}

export const WaveformSelect: FC<WaveformSelectProps> = ({ laser }) => {
  const [catalog, setCatalog] = useState<string[]>([])
  const [selected, setSelected] = useState('')
  const { state, error, write } = usePvWrite({ flashMs: 0 })

  useEffect(() => {
    let cancelled = false
    getCatalog().then((list) => {
      if (!cancelled) setCatalog(list)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const onLoad = useCallback(() => {
    if (!selected) return
    void write(pv.cmd(laser, 'LOAD_WAVEFORM'), selected)
  }, [laser, selected, write])

  return (
    <div className={styles.wrapper}>
      <div className={styles.controls}>
        <select
          className={styles.select}
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          aria-label="Waveform"
        >
          <option value="">— pick a waveform —</option>
          {catalog.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <Tooltip content={renderWaveformPreview(selected)} side="top">
          <button
            type="button"
            className={styles.previewTrigger}
            aria-label={
              selected ? `Preview waveform ${selected}` : 'Waveform preview'
            }
          >
            <span aria-hidden="true">∿</span>
          </button>
        </Tooltip>
      </div>
      <button
        type="button"
        className={styles.load}
        onClick={onLoad}
        disabled={!selected || state === 'pending'}
        data-state={state}
      >
        {state === 'pending' ? 'Loading…' : 'Load'}
      </button>
      {error && <div className={styles.errorRow}>{error}</div>}
    </div>
  )
}
