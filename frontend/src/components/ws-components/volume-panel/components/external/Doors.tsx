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
  sensorPV?: {
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
  /**
   * Array of PVs for monitoring door status.
   * Can be an array of strings (PV names) for a summary view,
   * or an array of objects with pvName and label for a detailed view.
   */
  doorsPVs?: string[] | { pvName: string; label: string }[]
  /** Optional title for the doors section */
  title?: string
}

/**
 * Doors component
 *
 * Displays and controls chamber door status. This component can show a summary
 * status for multiple doors or a detailed list of each door's status.
 *
 * @example
 * ```tsx
 * // Summary view
 * <Doors
 *   title="Chamber Access"
 *   doorsPVs={["DOOR_FRONT", "DOOR_REAR"]}
 * />
 *
 * // Detailed view
 * <Doors
 *   title="Chamber Access"
 *   doorsPVs={[
 *     { pvName: "DOOR_FRONT", label: "Front Door" },
 *     { pvName: "DOOR_REAR", label: "Rear Door" }
 *   ]}
 * />
 * ```
 */
export const Doors: FC<DoorsProps> = ({
  sensorPV,
  title,
  stateControl,
  doorsPVs,
}) => {
  // Type guard to check if the array contains objects with labels
  const hasLabels =
    !!doorsPVs &&
    doorsPVs.length > 0 &&
    typeof doorsPVs[0] === 'object' &&
    doorsPVs[0] !== null

  const pvsToWatch =
    doorsPVs?.map((pv) =>
      hasLabels
        ? getPrefixedPV((pv as { pvName: string }).pvName)
        : getPrefixedPV(pv as string),
    ) ?? []

  const { state } = useWebSocketMulti<1 | 0 | null>({
    pvs: pvsToWatch,
  })

  /**
   * Determines if all doors are closed (value === 0)
   * This is only used for the summary view (when hasLabels is false)
   */
  const isDoorsClosed =
    doorsPVs && !hasLabels
      ? (doorsPVs as string[]).every((pv) => {
          const value = state[getPrefixedPV(pv)]?.value
          return value === 0
        })
      : undefined

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
      {sensorPV ? (
        <VolumeCard>
          <SensorPressureConnected
            key={sensorPV.pvName}
            options={sensorPV.options}
            pvname={getPrefixedPV(sensorPV.pvName)}
            label={sensorPV.label}
          />
        </VolumeCard>
      ) : null}
      {doorsPVs && doorsPVs.length > 0 ? (
        hasLabels ? (
          (doorsPVs as { pvName: string; label: string }[]).map((door) => {
            const doorState = state[getPrefixedPV(door.pvName)]?.value
            return (
              <VolumeCard key={door.pvName}>
                <div
                  style={{
                    fontSize: '0.75rem',
                    fontStyle: 'normal',
                    fontWeight: '400',
                  }}
                >
                  {door.label}
                  {' is '}
                  {doorState === 0
                    ? 'CLOSED'
                    : doorState === 1
                      ? 'OPENED'
                      : 'UNKNOWN'}
                </div>
              </VolumeCard>
            )
          })
        ) : (
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
        )
      ) : null}
    </Container>
  )
}
