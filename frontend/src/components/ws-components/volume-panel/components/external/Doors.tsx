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

interface SensorBarProps {
  sensorPV: {
    pvName: string
    label: string
    options?: ValueFormatOptions
  }
  stateControl?: {
    pvCurrentState: string
    pvTargetState: string
    controlPvs: {
      pvName: string
      label: string
    }[]
  }

  doorsPVs: string[]

  title?: string
}

/**
 * SensorBar component
 *
 * Displays a bar with multiple sensor pressure readings
 *  and an optional state control.
 *
 * @param sensorPVs - Array of sensor PVs with names and labels
 * @param stateControl - Optional state control with PV name and control PVs
 * @param label - Label for the sensor bar
 * @param title - Optional title for the sensor bar
 * @param height - Optional height for the sensor bar
 * @return JSX.Element
 *  */
export const Doors: FC<SensorBarProps> = ({
  sensorPV,
  title,
  stateControl,
  doorsPVs,
}) => {
  const { state } = useWebSocketMulti<1 | 0 | null>({
    pvs: doorsPVs.map(getPrefixedPV),
  })

  // all value must be 0 to be considered closed it should be && thrue all values
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
