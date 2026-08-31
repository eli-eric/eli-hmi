'use client'

import { FC, useEffect, useState, useCallback } from 'react'
import { listWaveforms } from '@/lib/api/pvs'
import { usePvWrite } from '@/components/hmi/controls/usePvWrite'
import styles from './WaveformSelect.module.css'

interface WaveformSelectProps {
  /** PV the selected waveform name is written to (resolved LOAD_WAVEFORM). */
  pvName: string
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

export const WaveformSelect: FC<WaveformSelectProps> = ({ pvName }) => {
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
    void write(pvName, selected)
  }, [pvName, selected, write])

  return (
    <div className={styles.wrapper}>
      <select
        className={styles.select}
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        aria-label="Waveform"
      >
        <option value="">Select Waveform</option>
        {catalog.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={styles.load}
        onClick={onLoad}
        disabled={!selected || state === 'pending'}
        data-state={state}
      >
        {state === 'pending' ? 'Setting…' : 'CONFIRM'}
      </button>
      {error && <div className={styles.errorRow}>{error}</div>}
    </div>
  )
}
