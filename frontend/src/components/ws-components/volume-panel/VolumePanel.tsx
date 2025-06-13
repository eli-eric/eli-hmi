'use client'

import { FC } from 'react'
import { VolumePanelProvider } from './context/VolumePanelContext'

import { WarningErrorControl } from './components/WarningErrorControl'
import { Container } from './components/Container'
import { MultiVolumePanel } from './components/MultiVolumePanel'

import { SensorBar } from './components/external/SensorBar'
import { Pump } from './components/external/Pump'
import { TurbopumpBasic } from './components/external/TurboPumpBasic'
import { Interlocks } from './components/external/InterLocks'
import { Locking } from './components/external/Locking'
import { VolumeContainer } from './components/internal/VolumeContainer'
import { Config } from './components/external/Config'
import { Doors } from './components/external/Doors'
import { MasterKey } from './components/external/MasterKey'

interface VolumePanelProps {
  width?: string
  title?: string
  checkClearPv?: string
  children: React.ReactNode
}

/**
 * VolumePanel - Main container component for volume panels
 *
 * Uses compound component pattern to provide a flexible and composable interface
 * for creating volume panels with various subcomponents.
 *
 */
export const VolumePanel: FC<VolumePanelProps> & {
  Container: typeof Container
  MultiVolumes: typeof MultiVolumePanel
  WarningErrorControl: typeof WarningErrorControl
  Interlocks: typeof Interlocks
  TurbopumpBasic: typeof TurbopumpBasic
  Pump: typeof Pump
  SensorBar: typeof SensorBar
  Locking: typeof Locking
  Config: typeof Config
  Doors: typeof Doors
  MasterKey: typeof MasterKey
} = ({ children, width = '10rem', title, checkClearPv }) => {
  return (
    <VolumePanelProvider>
      <VolumeContainer width={width} title={title} checkClearPv={checkClearPv}>
        {children}
      </VolumeContainer>
    </VolumePanelProvider>
  )
}

// Attach subcomponents to VolumePanel
VolumePanel.Container = Container
VolumePanel.MultiVolumes = MultiVolumePanel
VolumePanel.WarningErrorControl = WarningErrorControl
VolumePanel.Interlocks = Interlocks
VolumePanel.TurbopumpBasic = TurbopumpBasic
VolumePanel.Pump = Pump
VolumePanel.SensorBar = SensorBar
VolumePanel.Locking = Locking
VolumePanel.Config = Config
VolumePanel.Doors = Doors
VolumePanel.MasterKey = MasterKey
