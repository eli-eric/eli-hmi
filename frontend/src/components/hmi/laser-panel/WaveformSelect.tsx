'use client'

import { FC, useEffect, useState, useCallback } from 'react'
import { listWaveforms } from '@/lib/api/pvs'
import { usePvWrite } from '@/components/hmi/controls/usePvWrite'
import { pv } from '@/app/(modules)/l4-opcpa/lib/pv-names'
import styles from './WaveformSelect.module.css'

interface WaveformSelectProps {
  laser: string
}

// Module-scope cache: the waveform catalog is static, so we fetch once per
// page load and reuse across all WaveformSelect mounts. Without this the cog
// fetches `/waveforms` every time the panel re-opens.
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

/** Test-only: reset the module-scope catalog cache. Vitest does not reload
 * modules between tests, so without this the catalog from the first run
 * leaks into subsequent tests. Call from `afterEach` if you mock `/waveforms`. */
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
