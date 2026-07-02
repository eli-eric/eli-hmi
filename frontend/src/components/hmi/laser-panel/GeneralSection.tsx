'use client'

import { FC, useMemo } from 'react'
import { SectionCard } from '@/components/hmi/controls/SectionCard'
import { DataRow } from '@/components/hmi/controls/DataRow'
import { CogToggle } from '@/components/hmi/controls/CogToggle'
import { ActionButton } from '@/components/hmi/controls/ActionButton'
import {
  BoolPill,
  FloatValue,
} from '@/components/hmi/controls/Values'
import { useWebSocketData } from '@/lib/websocket/use-websocket-data'
import { pv, type LaserCommand } from '@/app/(modules)/l4-opcpa/lib/pv-names'
import type { LabeledPv } from '@/app/(modules)/l4-opcpa/config/schema'
import { OverviewBar } from './OverviewBar'
import { makeCommandGate } from './commandGate'
import styles from './sections.module.css'

interface GeneralSectionProps {
  /** Laser id — used only to build command PVs (CMD_<laser>_<NAME>). */
  laser: string
  connectionPv: string
  fullPowerPv: string
  shutterPv: string
  phdMeanPv: string
  /** MSS sub-indicator PVs (counted in the Overview). */
  mssPvs: readonly string[]
  /** Module-error indicators: label + PV. */
  moduleErrors: readonly LabeledPv[]
  /** Commands this laser exposes. Buttons for commands not listed are hidden. */
  commands: readonly LaserCommand[]
}

/**
 * General laser status + lifecycle actions. All PV names arrive as props
 * (resolved from the YAML config); command PVs are built from `laser`.
 */
export const GeneralSection: FC<GeneralSectionProps> = ({
  laser,
  connectionPv,
  fullPowerPv,
  shutterPv,
  phdMeanPv,
  mssPvs,
  moduleErrors,
  commands,
}) => {
  const can = makeCommandGate(commands)
  const hasGeneralActions = (
    ['START_LASER', 'STOP_LASER', 'ALIGNMENT_MODE', 'SYSTEM_STANDBY'] as const
  ).some(can)

  const readPvs = useMemo(
    () => [shutterPv, phdMeanPv],
    [shutterPv, phdMeanPv],
  )
  const { state } = useWebSocketData<number | null>({ pvs: readPvs, raw: true })

  return (
    <SectionCard>
      <OverviewBar
        connectionPv={connectionPv}
        fullPowerPv={fullPowerPv}
        mssPvs={mssPvs}
        moduleErrors={moduleErrors}
      />

      <DataRow
        label="Shutter Position"
        valueVariant="bare"
        value={
          <BoolPill
            data={state[shutterPv]}
            onLabel="is OPEN"
            offLabel="is CLOSED"
            onTone="negative-neutral"
            offTone="positive-neutral"
          />
        }
        action={
          <CogToggle ariaLabel="Shutter actions">
            <ActionButton
              label="Open Shutter"
              pvName={shutterPv}
              value={1}
              variant="secondary"
            />
            <ActionButton
              label="Close Shutter"
              pvName={shutterPv}
              value={0}
              variant="secondary"
            />
          </CogToggle>
        }
      />

      <DataRow
        label="PHD1K000:49/Mean"
        value={<FloatValue data={state[phdMeanPv]} precision={3} />}
      />

      {hasGeneralActions && (
        <div className={styles.actionRow}>
          <CogToggle ariaLabel="General Actions" inlineLabel="General Actions">
            {can('START_LASER') && (
              <ActionButton
                label="Start Laser"
                pvName={pv.cmd(laser, 'START_LASER')}
              />
            )}
            {can('STOP_LASER') && (
              <ActionButton
                label="Stop Laser"
                pvName={pv.cmd(laser, 'STOP_LASER')}
                variant="danger"
              />
            )}
            {can('ALIGNMENT_MODE') && (
              <ActionButton
                label="Set to Alignment Mode"
                pvName={pv.cmd(laser, 'ALIGNMENT_MODE')}
                variant="secondary"
              />
            )}
            {can('SYSTEM_STANDBY') && (
              <ActionButton
                label="Set to System Standby"
                pvName={pv.cmd(laser, 'SYSTEM_STANDBY')}
                variant="secondary"
              />
            )}
          </CogToggle>
        </div>
      )}
    </SectionCard>
  )
}
