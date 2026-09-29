'use client'

import { FC, useEffect, useState, useCallback } from 'react'
import { listWaveforms } from '@/lib/api/pvs'
import { usePvWrite } from '@/components/hmi/controls/usePvWrite'
import styles from './WaveformSelect.module.css'

interface WaveformSelectProps {
  /** PV the selected waveform name is written to (resolved LOAD_WAVEFORM). */
  pvName: string
  /**
   * Where this laser's waveform catalog comes from (`waveformsUrl` in the
   * config). Each modbox serves its own, so the address differs per laser.
   * Unset falls back to the gateway's `/waveforms`, which the mock serves.
   */
  catalogUrl?: string
}

// Module-scope cache: the waveform catalog is static, so we fetch once and
// reuse across all WaveformSelect mounts. Without this the cog fetches the
// catalog every time the panel re-opens.
//
// Keyed by endpoint, because a page shows several lasers side by side and
// each modbox serves its own catalog — one shared entry would offer NL2's
// waveforms for NL5, and loading a waveform from the wrong laser is not a
// mistake the panel should make possible.
//
// Guarantee: "fetch once per page load on success." On fetch failure the
// entry is dropped so the next mount retries — i.e. failures degrade to
// "fetch once per mount until one succeeds", not "fetch and stick at []".
const catalogs = new Map<string, Promise<string[]>>()

function getCatalog(url?: string): Promise<string[]> {
  const key = url ?? ''
  let pending = catalogs.get(key)
  if (!pending) {
    pending = listWaveforms(url).catch(() => {
      catalogs.delete(key) // allow retry on next mount after a failure
      return []
    })
    catalogs.set(key, pending)
  }
  return pending
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
  catalogs.clear()
}

export const WaveformSelect: FC<WaveformSelectProps> = ({
  pvName,
  catalogUrl,
}) => {
  const [catalog, setCatalog] = useState<string[]>([])
  const [selected, setSelected] = useState('')
  const { state, error, write } = usePvWrite({ flashMs: 0 })

  useEffect(() => {
    let cancelled = false
    getCatalog(catalogUrl).then((list) => {
      if (!cancelled) setCatalog(list)
    })
    return () => {
      cancelled = true
    }
  }, [catalogUrl])

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
