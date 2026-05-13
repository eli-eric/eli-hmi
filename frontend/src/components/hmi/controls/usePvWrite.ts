'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { pvWrite } from '@/lib/api/pvs'
import { useCogToggleClose } from './CogToggle'

export type PvWriteState = 'idle' | 'pending' | 'success' | 'error'

interface UsePvWriteOptions {
  /** ms to stay in 'success' before returning to 'idle'. 0 disables. Default 1000. */
  flashMs?: number
}

interface UsePvWriteResult {
  state: PvWriteState
  error: string | null
  write: (pvName: string, value: number | string) => Promise<void>
}

/**
 * Single source of truth for the PV-write lifecycle used by every write
 * control on the L4 OPCPA page (ActionButton, PresetIntegerInput, WaveformSelect).
 *
 * The hook owns: `pvWrite` invocation, idle/pending/success/error state,
 * success-flash auto-reset, CogToggle close-on-success, and unmount-safe
 * cleanup. Callers render whatever UI they want around `{ state, error, write }`.
 */
export function usePvWrite(
  options?: UsePvWriteOptions,
): UsePvWriteResult {
  const flashMs = options?.flashMs ?? 1000
  const [state, setState] = useState<PvWriteState>('idle')
  const [error, setError] = useState<string | null>(null)
  const closePanel = useCogToggleClose()
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  // Re-set `mountedRef.current = true` on every mount cycle so React 19
  // StrictMode's double-invoke pattern (mount → unmount → re-mount in dev)
  // does not leave the ref permanently `false` after the synthetic unmount.
  // Without this, every `write()` bails out at the `!mountedRef.current`
  // guard and no fetch is ever issued.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    }
  }, [])

  const write = useCallback(
    async (pvName: string, value: number | string) => {
      if (!mountedRef.current) return
      setState('pending')
      setError(null)
      try {
        await pvWrite(pvName, value)
        if (!mountedRef.current) return
        setState('success')
        // Close the parent cog immediately so the operator gets prompt
        // feedback. Flash is only visible when the control lives outside
        // a CogToggle (where the parent doesn't unmount on success).
        closePanel()
        if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
        if (flashMs > 0) {
          flashTimerRef.current = setTimeout(() => {
            if (mountedRef.current) setState('idle')
          }, flashMs)
        }
      } catch (e) {
        if (!mountedRef.current) return
        setError(e instanceof Error ? e.message : 'Failed')
        setState('error')
      }
    },
    [flashMs, closePanel],
  )

  return { state, error, write }
}
