'use client'

import { FC } from 'react'
import { ContainerCard } from '@/components/ui/cards'
import { VolumePanelProvider } from './context/VolumePanelContext'
import { VolumeTitle } from './components/VolumeTitle'
import { VolumeLabel } from './components/VolumeLabel'
import { VolumeCard, VolumeCardLabel } from './components/VolumeCard'
import {
  SensorPressure,
  ValveStatus,
  PumpSpeed,
  PureValue,
  ValueUnit,
  SensorValue,
} from './components/SensorComponents'
import { StateControl, WarningErrorControl } from './components/StateControl'
import { Container } from './components/Container'
import { Row } from '@/components/ui/layout'
import { withReactWebSocketData } from '../with-websocket-data'
import { MultiVolumePanel } from './components/MultiVolumePanel'
import {
  Interlocks,
  InterlockItem,
  InterlockConnected,
} from './components/Interlocks'
import { TurbopumpBasic } from './components/TurboPumpBasic'
import { Pump } from './components/Pump'
import { SensorBar } from './components/external/SensorBar'

// Connected sensor components
const SensorPressureConnected = withReactWebSocketData(SensorPressure)
const ValveStatusConnected = withReactWebSocketData(ValveStatus)
const PumpSpeedConnected = withReactWebSocketData(PumpSpeed)
const PureValueConnected = withReactWebSocketData(PureValue)
const ValueUnitConnected = withReactWebSocketData(ValueUnit)
const SensorValueConnected = withReactWebSocketData(SensorValue)

interface VolumePanelProps {
  width?: string
  title?: string
  children: React.ReactNode
}

/**
 * VolumePanel - Main container component for volume panels
 *
 * Uses compound component pattern to provide a flexible and composable interface
 * for creating volume panels with various subcomponents.
 *
 * @example
 * ```tsx
 * <VolumePanel>
 *   <VolumePanel.Title label="Pressure Readings">
 *     <VolumePanel.TitleButton onClick={handleClick} />
 *   </VolumePanel.Title>
 *   <VolumePanel.Label label="System Status" />
 *   <VolumePanel.Card>
 *     <VolumePanel.CardLabel>Readings</VolumePanel.CardLabel>
 *     <VolumePanel.SensorPressureConnected pvname="pressure" label="Chamber" />
 *   </VolumePanel.Card>
 * </VolumePanel>
 * ```
 */
export const VolumePanel: FC<VolumePanelProps> & {
  Title: typeof VolumeTitle
  Label: typeof VolumeLabel
  Card: typeof VolumeCard
  CardLabel: typeof VolumeCardLabel
  SensorPressureConnected: typeof SensorPressureConnected
  ValveStatusConnected: typeof ValveStatusConnected
  PumpSpeedConnected: typeof PumpSpeedConnected
  PureValueConnected: typeof PureValueConnected
  ValueUnitConnected: typeof ValueUnitConnected
  SensorValueConnected: typeof SensorValueConnected
  Container: typeof Container
  StateControl: typeof StateControl
  Row: typeof Row
  MultiVolumes: typeof MultiVolumePanel
  WarningErrorControl: typeof WarningErrorControl
  Interlocks: typeof Interlocks
  InterlockItem: typeof InterlockItem
  InterlockConnected: typeof InterlockConnected
  TurbopumpBasic: typeof TurbopumpBasic
  Pump: typeof Pump
  SensorBar: typeof SensorBar
} = ({ children, width = '10rem', title }) => {
  return (
    <VolumePanelProvider>
      <ContainerCard width={width} title={title}>
        {children}
      </ContainerCard>
    </VolumePanelProvider>
  )
}

// Attach subcomponents to VolumePanel
VolumePanel.Title = VolumeTitle
VolumePanel.Label = VolumeLabel
VolumePanel.Card = VolumeCard
VolumePanel.CardLabel = VolumeCardLabel
VolumePanel.SensorPressureConnected = SensorPressureConnected
VolumePanel.ValveStatusConnected = ValveStatusConnected
VolumePanel.PumpSpeedConnected = PumpSpeedConnected
VolumePanel.PureValueConnected = PureValueConnected
VolumePanel.ValueUnitConnected = ValueUnitConnected
VolumePanel.SensorValueConnected = SensorValueConnected
VolumePanel.Container = Container
VolumePanel.StateControl = StateControl
VolumePanel.Row = Row
VolumePanel.MultiVolumes = MultiVolumePanel
VolumePanel.WarningErrorControl = WarningErrorControl
VolumePanel.Interlocks = Interlocks
VolumePanel.InterlockItem = InterlockItem
VolumePanel.InterlockConnected = InterlockConnected
VolumePanel.TurbopumpBasic = TurbopumpBasic
VolumePanel.Pump = Pump
VolumePanel.SensorBar = SensorBar
