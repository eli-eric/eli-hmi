import { FC } from 'react'

import { useWebSocketData } from '@/lib/websocket/use-websocket-data'
import { ValueFormatOptions } from '@/lib/utils/pv-helpers'

import { Container } from '../Container'
import { VolumeCard } from '../internal/VolumeCard'
import { VolumeTitle } from '../internal/VolumeTitle'
import { DropDownStateControl } from '../internal/DropDownStateControl'
import { SensorValue } from '../internal/SensorValue'

import styles from './Doors.module.css'

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

export interface LabeledDoor {
  pvName: string
  label: string
}

type DoorsList = string[] | LabeledDoor[]

function isLabeledList(list: DoorsList): list is LabeledDoor[] {
  return list.length > 0 && typeof list[0] === 'object' && list[0] !== null
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
  /**
   * Either a flat list of PV names (renders a single CLOSED/OPENED summary)
   * or a list of `{ pvName, label }` (renders one row per door).
   */
  doorsPVs?: DoorsList
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
  const labeled =
    doorsPVs && doorsPVs.length > 0 && isLabeledList(doorsPVs)
      ? doorsPVs
      : null
  const flat =
    doorsPVs && doorsPVs.length > 0 && !isLabeledList(doorsPVs)
      ? (doorsPVs as string[])
      : null

  const pvsToWatch = labeled
    ? labeled.map((d) => d.pvName)
    : (flat ?? [])

  const { byPv } = useWebSocketData<1 | 0 | null>({ pvs: pvsToWatch })

  const allClosed = flat ? flat.every((pv) => byPv(pv)?.value === 0) : undefined

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
      {labeled
        ? labeled.map((door) => {
            const doorState = byPv(door.pvName)?.value
            return (
              <VolumeCard key={door.pvName}>
                <div className={styles.doorRow}>
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
        : flat
          ? (
              <VolumeCard>
                <div className={styles.doorRow}>
                  {allClosed ? 'All Doors are CLOSED' : 'Some Doors are OPENED'}
                </div>
              </VolumeCard>
            )
          : null}
    </Container>
  )
}
