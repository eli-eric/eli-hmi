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
import { pv } from '@/app/(modules)/l4-opcpa/lib/pv-names'
import { OverviewBar } from './OverviewBar'
import styles from './sections.module.css'

interface GeneralSectionProps {
  laser: string
  /** Number of MSS sub-indicator PVs (BI_<laser>_MSS_1..N). */
  mssCount: number
  /**
   * Per-module error names; PV names are BI_<laser>_ERR_<name>.
   * E.g. ['REGEN', 'CHILLER_11', 'CHILLER_12', 'FLASHLAMPS'].
   */
  moduleErrors: readonly string[]
}

/**
 * General laser status + lifecycle actions.
 *
 * Read PVs (mock):
 * - BI_<laser>_CONN          (Connection — shown in Overview)
 * - BI_<laser>_FULLP         (Now at Full Power — shown in Overview)
 * - BI_<laser>_SHUTTER       (Shutter Position)
 * - AI_<laser>_PHD_MEAN      (PHD1K000:49/Mean intensity)
 * - BI_<laser>_MSS_{i}       (MSS sub-indicators — counted in Overview)
 * - BI_<laser>_ERR_{name}    (Module Error sub-indicators — counted in Overview)
 *
 * Write PVs (POST /pv/...):
 * - BI_<laser>_SHUTTER             (direct write 0 or 1)
 * - CMD_<laser>_START_LASER        (command trigger)
 * - CMD_<laser>_STOP_LASER
 * - CMD_<laser>_ALIGNMENT_MODE
 * - CMD_<laser>_SYSTEM_STANDBY
 */
export const GeneralSection: FC<GeneralSectionProps> = ({
  laser,
  mssCount,
  moduleErrors,
}) => {
  const mssPvs = useMemo(
    () => pv.mssAll(laser, mssCount),
    [laser, mssCount],
  )
  const errPvs = useMemo(
    () => pv.moduleErrorsAll(laser, moduleErrors),
    [laser, moduleErrors],
  )

  return (
    <SectionCard>
      <OverviewBar laser={laser} mssPvs={mssPvs} moduleErrorPvs={errPvs} />

      <DataRow
        label="Shutter Position"
        value={
          <BoolPill
            pvName={pv.shutter(laser)}
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
              pvName={pv.shutter(laser)}
              value={1}
              variant="secondary"
            />
            <ActionButton
              label="Close Shutter"
              pvName={pv.shutter(laser)}
              value={0}
              variant="secondary"
            />
          </CogToggle>
        }
      />

      <DataRow
        label="PHD1K000:49/Mean"
        value={<FloatValue pvName={pv.phdMean(laser)} precision={3} />}
      />

      <div className={styles.actionRow}>
        <CogToggle ariaLabel="General Actions" inlineLabel="General Actions">
          <ActionButton
            label="Start Laser"
            pvName={pv.cmd(laser, 'START_LASER')}
          />
          <ActionButton
            label="Stop Laser"
            pvName={pv.cmd(laser, 'STOP_LASER')}
            variant="danger"
          />
          <ActionButton
            label="Alignment Mode"
            pvName={pv.cmd(laser, 'ALIGNMENT_MODE')}
            variant="secondary"
          />
          <ActionButton
            label="System Standby"
            pvName={pv.cmd(laser, 'SYSTEM_STANDBY')}
            variant="secondary"
          />
        </CogToggle>
      </div>
    </SectionCard>
  )
}
