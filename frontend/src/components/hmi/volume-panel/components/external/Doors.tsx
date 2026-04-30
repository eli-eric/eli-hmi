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

interface DoorsProps {
  sensorPV?: {
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
  doorsPVs?: string[] | { pvName: string; label: string }[]
  title?: string
}

/**
 * Doors panel: optional sensor + optional state control + per-door status rows.
 */
export const Doors: FC<DoorsProps> = ({
  sensorPV,
  title,
  stateControl,
  doorsPVs,
}) => {
  const hasLabels =
    !!doorsPVs &&
    doorsPVs.length > 0 &&
    typeof doorsPVs[0] === 'object' &&
    doorsPVs[0] !== null

  const pvsToWatch =
    doorsPVs?.map((pv) =>
      hasLabels ? (pv as { pvName: string }).pvName : (pv as string),
    ) ?? []

  const { byPv } = useWebSocketData<1 | 0 | null>({ pvs: pvsToWatch })

  const isDoorsClosed =
    doorsPVs && !hasLabels
      ? (doorsPVs as string[]).every((pv) => byPv(pv)?.value === 0)
      : undefined

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
      {sensorPV ? (
        <VolumeCard>
          <SensorPressureConnected
            key={sensorPV.pvName}
            options={sensorPV.options}
            pvname={sensorPV.pvName}
            label={sensorPV.label}
          />
        </VolumeCard>
      ) : null}
      {doorsPVs && doorsPVs.length > 0 ? (
        hasLabels ? (
          (doorsPVs as { pvName: string; label: string }[]).map((door) => {
            const doorState = byPv(door.pvName)?.value
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
