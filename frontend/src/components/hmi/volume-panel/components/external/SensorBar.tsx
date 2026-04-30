import { FC } from 'react'

import { useWebSocketData } from '@/lib/websocket/use-websocket-data'
import { ValueFormatOptions } from '@/lib/utils/pv-helpers'

import { Container } from '../Container'
import { VolumeCard } from '../internal/VolumeCard'
import { VolumeTitle } from '../internal/VolumeTitle'
import { DropDownStateControl } from '../internal/DropDownStateControl'
import { SensorValue } from '../internal/SensorValue'

interface SensorPressureConnectedProps {
  pvname: string
  label?: string
  options?: ValueFormatOptions
}

const SensorPressureConnected: FC<SensorPressureConnectedProps> = ({
  pvname,
  label,
  options,
}) => {
  const { data, isConnected } = useWebSocketData<number>(pvname)
  return (
    <SensorValue
      data={data}
      isConnected={isConnected}
      label={label}
      options={options}
    />
  )
}

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
  pumpCyclePv?: string
  label: string
  title?: string
  height?: string
}

/**
 * Multi-sensor reading panel with optional state-control dropdown.
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
          controlPvs={stateControl.controlPvs}
          pvNameCurrent={stateControl.pvCurrentState}
          pvNameTarget={stateControl.pvTargetState}
        />
      )}
      <VolumeCard label={label} height={height}>
        {sensorPVs.map((sensor) => (
          <SensorPressureConnected
            key={sensor.pvName}
            options={sensor.options}
            pvname={sensor.pvName}
            label={sensor.label}
          />
        ))}
      </VolumeCard>
      {pumpCyclePv && (
        <VolumeCard label="Total PumpCycles" height="10.3rem">
          <SensorPressureConnected
            pvname={pumpCyclePv}
            options={{ format: 'precision' }}
          />
        </VolumeCard>
      )}
    </Container>
  )
}
