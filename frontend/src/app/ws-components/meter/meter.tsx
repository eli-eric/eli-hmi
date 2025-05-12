'use client'

import { createContext, FC, useContext } from 'react'
import { ContainerCard } from '@/components/ui/cards'
import { Message } from '@/lib/websocket-provider/message'

import styles from './meter.module.css'

// Context type for meter data
interface MeterContextValue {
  value: number | null
}

// Create context with default values
const MeterContext = createContext<MeterContextValue>({ value: null })

// Hook for using meter context
export const useMeter = (): MeterContextValue => {
  const context = useContext(MeterContext)
  if (!context) {
    throw new Error('useMeter must be used within a Meter component')
  }
  return context
}

interface MeterContainerProps {
  children: React.ReactNode
}

/**
 * Primary container component for meter UI elements
 */
export const MeterContainer: FC<MeterContainerProps> = ({ children }) => {
  return (
    <MeterContext.Provider value={{ value: null }}>
      <ContainerCard width="10rem">{children}</ContainerCard>
    </MeterContext.Provider>
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
