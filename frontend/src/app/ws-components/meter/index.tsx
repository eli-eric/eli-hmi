'use client'

import { withReactWebSocketData } from '../with-websocket-data'
import { MeterContainer, SensorPressure } from './meter'
import {
  MeterTitle,
  MeterLabel,
  MeterTitleButton,
  MeterCard,
  MeterCardLabel,
} from './meter-ui'
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
 * Meter component with compound pattern
 *
 * Usage example:
 * <Meter>
 *   <Meter.Title label="Pressure Readings">
 *     <Meter.TitleButton onClick={handleClick} />
 *   </Meter.Title>
 *   <Meter.Label label="System Status" />
 *   <Meter.Card>
 *     <Meter.CardLabel>Readings</Meter.CardLabel>
 *     <Meter.SensorPressureConnected pvname="pressure" label="Chamber" />
 *   </Meter.Card>
 * </Meter>
 */
export const Meter = Object.assign(MeterContainer, {
  Title: MeterTitle,
  Label: MeterLabel,
  TitleButton: MeterTitleButton,
  Card: MeterCard,
  CardLabel: MeterCardLabel,
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
