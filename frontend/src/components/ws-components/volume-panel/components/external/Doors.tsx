import { withReactWebSocketData } from '@/components/ws-components/with-websocket-data'
import { Container } from '../Container'
import { VolumeCard } from '../internal/VolumeCard'
import { FC } from 'react'
import { getPrefixedPV, ValueFormatOptions } from '@/lib/utils/pv-helpers'
import { VolumeTitle } from '../internal/VolumeTitle'
import { DropDownStateControl } from '../internal/DropDownStateControl'
import { SensorValue } from '../internal/SensorValue'
import { useWebSocketMulti } from '@/hooks/useWebSocketData'

const SensorPressureConnected = withReactWebSocketData(SensorValue)

/**
 * Props for the Doors component
 */
interface DoorsProps {
  /** Sensor PV configuration */
  sensorPV: {
    /** PV name for the sensor */
    pvName: string
    /** Display label for the sensor */
    label: string
    /** Optional formatting options for the sensor value */
    options?: ValueFormatOptions
  }
  /** Optional state control configuration */
  stateControl?: {
    /** PV name for current door state */
    pvCurrentState: string
    /** PV name for target door state */
    pvTargetState: string
    /** Array of control options for the doors */
    controlPvs: {
      /** PV name to activate when this option is selected */
      pvName: string
      /** Display label for this option */
      label: string
    }[]
  }
  /** Array of PV names for monitoring door status */
  doorsPVs: string[]
  /** Optional title for the doors section */
  title?: string
}

/**
 * Doors component
 *
 * Displays and controls chamber door status. This component shows the state of multiple
 * doors and provides controls for locking/unlocking and opening/closing doors.
 * The component will show a doors closed indicator only when all monitored doors are closed.
 *
 * @example
 * ```tsx
 * <Doors
 *   title="Chamber Access"
 *   sensorPV={{
 *     pvName: "DOOR_PRESSURE",
 *     label: "Chamber Pressure"
 *   }}
 *   doorsPVs={["DOOR_FRONT", "DOOR_REAR"]}
 *   stateControl={{
 *     pvCurrentState: "DOOR_STATE",
 *     pvTargetState: "DOOR_TARGET",
 *     controlPvs: [
 *       { pvName: "DOOR_LOCK", label: "Lock Doors" },
 *       { pvName: "DOOR_UNLOCK", label: "Unlock Doors" }
 *     ]
 *   }}
 * />
 * ```
 */
export const Doors: FC<DoorsProps> = ({
  sensorPV,
  title,
  stateControl,
  doorsPVs,
}) => {
  const { state } = useWebSocketMulti<1 | 0 | null>({
    pvs: doorsPVs.map(getPrefixedPV),
  })

  /**
   * Determines if all doors are closed (value === 0)
   * @returns true if all door PVs report 0 (closed), false otherwise
   */
  const isDoorsClosed = doorsPVs.every((pv) => {
    const value = state[getPrefixedPV(pv)]?.value
    return value === 0
  })

  console.log('Doors state:', isDoorsClosed, state)

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
      <VolumeCard>
        <SensorPressureConnected
          key={sensorPV.pvName}
          options={sensorPV.options}
          pvname={getPrefixedPV(sensorPV.pvName)}
          label={sensorPV.label}
        />
      </VolumeCard>
      <VolumeCard>
        <div
          style={{
            fontSize: '0.75rem',
            fontStyle: 'normal',
            fontWeight: '400',
          }}
        >
          {isDoorsClosed ? 'All Doors are CLOSED' : 'Some Doors are OPENED'}
        </div>
      </VolumeCard>
    </Container>
  )
}
