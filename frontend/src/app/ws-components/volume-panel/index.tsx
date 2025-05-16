'use client'

import { withReactWebSocketData } from '../with-websocket-data'
import { VolumePanelContainer, SensorPressure } from './volume-panel'
import {
  VolumePanelTitle,
  VolumePanelLabel,
  VolumePanelTitleButton,
  VolumePanelCard,
  VolumePanelCardLabel,
  MultiVolumePanel,
} from './volume-panel-ui'
import {
  Container,
  ValveStatusConnected,
  PumpSpeedConnected,
  PureValueConnected,
  ValueUnitConnected,
  SensorValueConnected,
} from './sensor-components'
import { StateControl, WarningErrorControl } from './state-control'
import { Row } from '@/components/ui/layout'

// Connected sensor components
const SensorPressureConnected = withReactWebSocketData(SensorPressure)

/**
 * VolumePanel component with compound pattern
 *
 * Usage example:
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
 */
export const VolumePanel = Object.assign(VolumePanelContainer, {
  Title: VolumePanelTitle,
  Label: VolumePanelLabel,
  TitleButton: VolumePanelTitleButton,
  Card: VolumePanelCard,
  CardLabel: VolumePanelCardLabel,
  // Connected components
  SensorPressureConnected,
  ValveStatusConnected,
  PumpSpeedConnected,
  PureValueConnected,
  ValueUnitConnected,
  SensorValueConnected,
  // Container components
  Container: Container,
  StateControl: StateControl,
  Row: Row,
  MultiVolumes: MultiVolumePanel,
  WarningErrorControl: WarningErrorControl,
})
