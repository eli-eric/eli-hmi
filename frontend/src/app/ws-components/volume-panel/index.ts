/**
 * VolumePanel Component
 *
 * A compound component for displaying volume panels with sensors, controls, and status information.
 * Uses the compound component pattern for a flexible and composable interface.
 *
 * @module VolumePanel
 */

export { VolumePanel } from './VolumePanel'
export { VolumeTitle } from './components/VolumeTitle'
export { VolumeLabel } from './components/VolumeLabel'
export { VolumeCard, VolumeCardLabel } from './components/VolumeCard'
export { Container } from './components/Container'
export { MultiVolumePanel } from './components/MultiVolumePanel'
export { StateControl, WarningErrorControl } from './components/StateControl'
export {
  SensorPressure,
  ValveStatus,
  PumpSpeed,
  PureValue,
  ValueUnit,
  SensorValue,
  type SensorProps,
} from './components/SensorComponents'
export {
  Interlocks,
  InterlockItem,
  InterlockConnected,
} from './components/Interlocks'
export { useVolumePanel } from './context/VolumePanelContext'
