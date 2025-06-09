import { withReactWebSocketData } from '@/components/ws-components/with-websocket-data'
import { Container } from '../Container'
import { VolumeCard } from '../VolumeCard'
import { VolumeLabel } from '../VolumeLabel'
import { SensorPressure } from '../SensorComponents'
import { FC } from 'react'
import { StateControl } from '../StateControl'
import { getPrefixedPV, ValueFormatOptions } from '@/lib/utils/pv-helpers'

const SensorPressureConnected = withReactWebSocketData(SensorPressure)

interface SensorBarProps {
  sensorPVs: {
    pvName: string
    label: string
    options?: ValueFormatOptions
  }[]
  stateControl?: {
    pvCurrentState: string
    pvTargetState: string
    controlPvs: {
      pvName: string
      label: string
    }[]
  }
  label: string
  title?: string
  height?: string
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
export const SensorBar: FC<SensorBarProps> = ({
  sensorPVs,
  title,
  label,
  stateControl,
  height,
}) => {
  return (
    <Container>
      {title && <VolumeLabel label={title} />}
      {stateControl && (
        <StateControl
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
      <VolumeCard title={label} height={height}>
        {sensorPVs.map((sensor) => (
          <SensorPressureConnected
            key={sensor.pvName}
            options={sensor.options}
            pvname={getPrefixedPV(sensor.pvName)}
            label={sensor.label}
          />
        ))}
      </VolumeCard>
    </Container>
  )
}
