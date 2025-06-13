import { withReactWebSocketData } from '@/components/ws-components/with-websocket-data'
import { Container } from '../Container'
import { VolumeCard } from '../internal/VolumeCard'
import { FC } from 'react'
import { getPrefixedPV, ValueFormatOptions } from '@/lib/utils/pv-helpers'
import { VolumeTitle } from '../internal/VolumeTitle'
import { DropDownStateControl } from '../internal/DropDownStateControl'
import { SensorValue } from '../internal/SensorValue'

const SensorPressureConnected = withReactWebSocketData(SensorValue)

/**
 * Props for the SensorBar component
 */
interface SensorBarProps {
  /**
   * Array of sensor PVs to display with their labels and optional formatting options
   */
  sensorPVs: {
    /** The process variable name for the sensor */
    pvName: string
    /** The display label for the sensor */
    label: string
    /** Optional formatting options for the sensor value */
    options?: ValueFormatOptions
  }[]
  /**
   * Optional state control configuration for controlling system states
   */
  stateControl?: {
    /** The PV that reports the current state */
    pvCurrentState: string
    /** The PV that reports the target state */
    pvTargetState: string
    /** Array of control PVs available in the dropdown */
    controlPvs: {
      /** The PV to activate when this control is selected */
      pvName: string
      /** The display label for this control option */
      label: string
    }[]
  }
  /** Optional PV for displaying pump cycle count */
  pumpCyclePv?: string
  /** Label for the sensor card */
  label: string
  /** Optional title for the entire sensor bar section */
  title?: string
  /** Optional height constraint for the sensor card */
  height?: string
}

/**
 * SensorBar component
 *
 * Displays a panel with multiple sensor readings and optional state controls.
 * This component is designed to show real-time data from multiple sensors,
 * with optional dropdown controls for changing system states.
 *
 * @example
 * ```tsx
 * <SensorBar
 *   title="Pressure Readings"
 *   label="Sensors"
 *   sensorPVs={[
 *     { pvName: "PRESSURE_1", label: "Chamber 1", options: { format: "pressure" } },
 *     { pvName: "PRESSURE_2", label: "Chamber 2" }
 *   ]}
 *   stateControl={{
 *     pvCurrentState: "CURRENT_STATE",
 *     pvTargetState: "TARGET_STATE",
 *     controlPvs: [
 *       { pvName: "CONTROL_1", label: "Open" },
 *       { pvName: "CONTROL_2", label: "Close" }
 *     ]
 *   }}
 * />
 * ```
 */
export const SensorBar: FC<SensorBarProps> = ({
  sensorPVs,
  title,
  label,
  stateControl,
  height,
  pumpCyclePv,
}) => {
  return (
    <Container>
      {title && <VolumeTitle title={title} />}
      {stateControl && (
        <DropDownStateControl
          {...{
            controlPvs: stateControl.controlPvs.map((pv) => ({
              pvName: getPrefixedPV(pv.pvName),
              label: pv.label,
            })),
            pvNameCurrent: getPrefixedPV(stateControl.pvCurrentState),
            pvNameTarget: getPrefixedPV(stateControl.pvTargetState),
          }}
        />
      )}
      <VolumeCard label={label} height={height}>
        {sensorPVs.map((sensor) => (
          <SensorPressureConnected
            key={sensor.pvName}
            options={sensor.options}
            pvname={getPrefixedPV(sensor.pvName)}
            label={sensor.label}
          />
        ))}
      </VolumeCard>
      {pumpCyclePv && (
        <VolumeCard label="Total PumpCycles" height="10.3rem">
          <SensorPressureConnected
            pvname={getPrefixedPV(pumpCyclePv)}
            options={{ format: 'precision' }}
          />
        </VolumeCard>
      )}
    </Container>
  )
}
