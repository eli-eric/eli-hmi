'use client'

import { FC, useMemo } from 'react'
import { SectionCard } from '@/components/hmi/controls/SectionCard'
import { DataRow } from '@/components/hmi/controls/DataRow'
import { CogToggle } from '@/components/hmi/controls/CogToggle'
import { ActionButton } from '@/components/hmi/controls/ActionButton'
import { BoolPill, FloatValue } from '@/components/hmi/controls/Values'
import { useWebSocketData } from '@/lib/websocket/use-websocket-data'
import type {
  CommandPvResolver,
  LaserCommand,
} from '@/app/(modules)/l4-opcpa/lib/pv-names'
import {
  LABEL_DEFAULTS,
  type LabeledPv,
  type MappedPv,
  type FormatConfig,
  type ResolvedLabels,
  type UnitsConfig,
} from '@/app/(modules)/l4-opcpa/config/schema'
import { OverviewBar } from './OverviewBar'
import { makeCommandGate } from './commandGate'
import styles from './sections.module.css'

interface GeneralSectionProps {
  /** Resolves a command to its write PV (YAML override or CMD_<laser>_<NAME>). */
  cmdPv: CommandPvResolver
  connectionPv: string
  fullPowerPv: string
  shutterPv: string
  phdMeanPv: string
  /** Configured unit for the PHD readout (wins over PV metadata). */
  /** Configured units per signal role; each wins over PV metadata. */
  units?: UnitsConfig
  /** Configured number format per signal role; each wins over the default. */
  format?: FormatConfig
  /** MSS sub-indicators: display label + PV (counted in the Overview). */
  mss: readonly MappedPv[]
  /** Module-error indicators: label + PV. */
  moduleErrors: readonly LabeledPv[]
  /** Commands this laser exposes. Buttons for commands not listed are hidden. */
  commands: readonly LaserCommand[]
  /** What each row is called; see `LABEL_DEFAULTS`. */
  labels?: ResolvedLabels
}

/**
 * General laser status + lifecycle actions. All PV names arrive as props
 * (resolved from the YAML config); command write PVs come from `cmdPv`.
 */
export const GeneralSection: FC<GeneralSectionProps> = ({
  cmdPv,
  connectionPv,
  fullPowerPv,
  shutterPv,
  phdMeanPv,
  units = {},
  format = {},
  mss,
  moduleErrors,
  commands,
  labels = LABEL_DEFAULTS,
}) => {
  const can = makeCommandGate(commands)
  const hasGeneralActions = (
    ['START_LASER', 'STOP_LASER', 'ALIGNMENT_MODE', 'SYSTEM_STANDBY'] as const
  ).some(can)

  const readPvs = useMemo(() => [shutterPv, phdMeanPv], [shutterPv, phdMeanPv])
  const { state } = useWebSocketData<number | null>({ pvs: readPvs, raw: true })

  return (
    <SectionCard>
      <OverviewBar
        connectionPv={connectionPv}
        fullPowerPv={fullPowerPv}
        mss={mss}
        moduleErrors={moduleErrors}
        label={labels.overview}
      />

      <DataRow
        label={labels.shutter}
        valueVariant="bare"
        value={
          <BoolPill
            pvName={shutterPv}
            data={state[shutterPv]}
            onLabel="is OPEN"
            offLabel="is CLOSED"
          />
        }
        action={
          /* The setpoint, never the readback: a shutter reports its position
             from one record and is moved by another. Writing to the one the
             row reads works only where the two are the same PV. */
          can('OPEN_SHUTTER') || can('CLOSE_SHUTTER') ? (
            <CogToggle ariaLabel="Shutter actions">
              {can('OPEN_SHUTTER') && (
                <ActionButton
                  label="Open Shutter"
                  {...cmdPv('OPEN_SHUTTER')}
                  variant="secondary"
                />
              )}
              {can('CLOSE_SHUTTER') && (
                <ActionButton
                  label="Close Shutter"
                  {...cmdPv('CLOSE_SHUTTER')}
                  variant="secondary"
                />
              )}
            </CogToggle>
          ) : undefined
        }
      />

      <DataRow
        label={labels.phdMean}
        value={
          <FloatValue
            pvName={phdMeanPv}
            data={state[phdMeanPv]}
            format={format.phdMean}
            units={units.phdMean}
          />
        }
      />

      {hasGeneralActions && (
        <div className={styles.actionRow}>
          <CogToggle ariaLabel="General Actions" inlineLabel="General Actions">
            {can('START_LASER') && (
              <ActionButton label="Start Laser" {...cmdPv('START_LASER')} />
            )}
            {can('STOP_LASER') && (
              <ActionButton
                label="Stop Laser"
                {...cmdPv('STOP_LASER')}
                variant="danger"
              />
            )}
            {can('ALIGNMENT_MODE') && (
              <ActionButton
                label="Set to Alignment Mode"
                {...cmdPv('ALIGNMENT_MODE')}
                variant="secondary"
              />
            )}
            {can('SYSTEM_STANDBY') && (
              <ActionButton
                label="Set to System Standby"
                {...cmdPv('SYSTEM_STANDBY')}
                variant="secondary"
              />
            )}
          </CogToggle>
        </div>
      )}
    </SectionCard>
  )
}
