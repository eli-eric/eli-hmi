'use client'

import { createContext, FC, useContext } from 'react'
import { ContainerCard } from '@/components/ui/cards'
import { Message } from '@/lib/websocket-provider/message'

import styles from './VolumePanel.module.css'

// Context type for VolumePanel data
interface VolumePanelContextValue {
  value: number | null
}

// Create context with default values
const VolumePanelContext = createContext<VolumePanelContextValue>({
  value: null,
})

// Hook for using VolumePanel context
export const useVolumePanel = (): VolumePanelContextValue => {
  const context = useContext(VolumePanelContext)
  if (!context) {
    throw new Error(
      'useVolumePanel must be used within a VolumePanel component',
    )
  }
  return context
}

interface VolumePanelContainerProps {
  children: React.ReactNode
}

/**
 * Primary container component for VolumePanel UI elements
 */
export const VolumePanelContainer: FC<VolumePanelContainerProps> = ({
  children,
}) => {
  return (
    <VolumePanelContext.Provider value={{ value: null }}>
      <ContainerCard width="10rem">{children}</ContainerCard>
    </VolumePanelContext.Provider>
  )
}

/**
 * Generic sensor component props
 */
export interface SensorProps {
  label?: string
  data?: Message<number> | null
  isConnected?: boolean
}

/**
 * Component for displaying sensor pressure data
 */
export const SensorPressure: FC<SensorProps> = ({
  label,
  data,
  isConnected,
}) => {
  const value = isConnected ? data?.value.toExponential(2) : 'N/A'
  const unit = data?.units || 'N/A'

  return (
    <div className={styles.sensorContainer}>
      <span className={styles.sensorData}>{`${value} ${unit}`}</span>
      <span className={styles.sensorLabel}>{label}</span>
    </div>
  )
}
