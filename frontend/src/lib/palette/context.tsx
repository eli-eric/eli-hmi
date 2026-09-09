'use client'

import { createContext, useCallback, useContext, useEffect } from 'react'
import { useSyncExternalStore } from 'react'

import {
  applyPalette,
  getPalette,
  getServerPalette,
  setStoredPalette,
  subscribePalette,
  type PaletteId,
} from './palette'

interface PaletteContextValue {
  palette: PaletteId
  setPalette: (palette: PaletteId) => void
}

const PaletteContext = createContext<PaletteContextValue | null>(null)

export function PaletteProvider({ children }: { children: React.ReactNode }) {
  const palette = useSyncExternalStore(
    subscribePalette,
    getPalette,
    getServerPalette,
  )

  // Keeps the document in step with the store. The attribute is normally
  // already correct — the bootstrap script sets it before first paint — so
  // this covers changing it here, and the case where that script never ran.
  useEffect(() => {
    applyPalette(palette)
  }, [palette])

  const setPalette = useCallback((next: PaletteId) => {
    setStoredPalette(next)
  }, [])

  return (
    <PaletteContext.Provider value={{ palette, setPalette }}>
      {children}
    </PaletteContext.Provider>
  )
}

export function usePalette(): PaletteContextValue {
  const context = useContext(PaletteContext)
  if (context === null) {
    throw new Error('usePalette must be used within a PaletteProvider')
  }
  return context
}
