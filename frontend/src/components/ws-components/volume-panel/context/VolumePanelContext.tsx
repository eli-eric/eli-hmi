'use client'

import { createContext, FC, PropsWithChildren, useContext } from 'react'

// Context type for VolumePanel data
interface VolumePanelContextValue {
  value: number | null
}

// Create context with default values
const VolumePanelContext = createContext<VolumePanelContextValue>({
  value: null,
})

/**
 * Hook for using VolumePanel context
 *
 * @returns The VolumePanel context value
 * @throws Error if used outside of a VolumePanelProvider
 */
export const useVolumePanel = (): VolumePanelContextValue => {
  const context = useContext(VolumePanelContext)
  if (!context) {
    throw new Error(
      'useVolumePanel must be used within a VolumePanelProvider component',
    )
  }
  return context
}

/**
 * Provider component for VolumePanel context
 */
export const VolumePanelProvider: FC<PropsWithChildren> = ({ children }) => {
  return (
    <VolumePanelContext.Provider value={{ value: null }}>
      {children}
    </VolumePanelContext.Provider>
  )
}
