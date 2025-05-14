'use client'

import { withReactWebSocketData } from '../with-websocket-data'
import { VolumePanelContainer, SensorPressure } from './volume-panel'
import {
  VolumePanelTitle,
  VolumePanelLabel,
  VolumePanelTitleButton,
  VolumePanelCard,
  VolumePanelCardLabel,
} from './volume-panel-ui'
import {
  ValveStatus,
  PumpSpeed,
  PumpContainer,
  ValveStatusConnected,
  PumpSpeedConnected,
  PureValueConnected,
} from './sensor-components'

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
  // Container components
  PumpContainer,
})

// Re-export base components for direct use
export { SensorPressure, ValveStatus, PumpSpeed, PumpContainer }
