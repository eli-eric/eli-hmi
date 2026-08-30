'use client'

import { FC, useMemo, useRef, useState } from 'react'
import { SectionCard } from '@/components/hmi/controls/SectionCard'
import { DataRow } from '@/components/hmi/controls/DataRow'
import { CogToggle } from '@/components/hmi/controls/CogToggle'
import { ActionButton } from '@/components/hmi/controls/ActionButton'
import {
  DetailList,
  DetailListItem,
} from '@/components/hmi/controls/DetailList'
import { FloatValue, StringValue } from '@/components/hmi/controls/Values'
import type { Message } from '@/app/providers/types'
import { useWebSocketData } from '@/lib/websocket/use-websocket-data'
import { severityTone } from '@/lib/websocket/severity'
import { pv, type LaserCommand } from '@/app/(modules)/l4-opcpa/lib/pv-names'
import { WaveformSelect } from './WaveformSelect'
import { makeCommandGate } from './commandGate'
import { useCollapseOnAnyClick } from './use-collapse-on-any-click'
import { severityToDetailState } from './severity-detail-state'
import styles from './sections.module.css'

interface ModboxSectionProps {
  /** Laser id — used only to build command PVs. */
  laser: string
  /** Modbox state PVs (1 = OK). */
  modbox: readonly string[]
  /** Currently-loaded-waveform PV (Waveform Preset). */
  loadedWaveformPv: string
  /** Previous-waveform PV shown in Waveform Latest. Optional. */
  latestWaveformPv?: string
  /** Modbox MBC1 / MBC2 readout PVs (shown on the Modbox State row). Optional. */
  mbc1Pv?: string
  mbc2Pv?: string
  /** Commands this laser exposes. Buttons for commands not listed are hidden. */
  commands: readonly LaserCommand[]
}

const WaveformActionDisclosure: FC<{ laser: string }> = ({ laser }) => {
  const [open, setOpen] = useState(false)

  return (
    <div className={styles.waveformAction}>
      <button
        type="button"
        className={styles.waveformActionToggle}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Set Waveform to…
      </button>
      {open && <WaveformSelect laser={laser} />}
    </div>
  )
}

/**
 * Modbox (modulation box) status + actions + waveform control. PV names arrive
 * as props (resolved from the YAML config); command PVs use `laser`.
 */
export const ModboxSection: FC<ModboxSectionProps> = ({
  laser,
  modbox,
  loadedWaveformPv,
  latestWaveformPv,
  mbc1Pv,
  mbc2Pv,
  commands,
}) => {
  const [expanded, setExpanded] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  useCollapseOnAnyClick(expanded, () => setExpanded(false), triggerRef)
  const can = makeCommandGate(commands)
  const hasWaveformAction = can('LOAD_WAVEFORM')
  const hasModboxActions =
    can('MODBOX_ON') || can('MODBOX_OFF') || hasWaveformAction

  const allPvs = useMemo(
    () =>
      [
        ...modbox,
        loadedWaveformPv,
        latestWaveformPv,
        mbc1Pv,
        mbc2Pv,
      ].filter((p): p is string => Boolean(p)),
    [modbox, loadedWaveformPv, latestWaveformPv, mbc1Pv, mbc2Pv],
  )
  // Mixed value types (number for state, string for waveform). Keep the hook
  // typed as `unknown` and narrow at the use site.
  const { state } = useWebSocketData<unknown>({ pvs: allPvs, raw: true })
  // Modbox state is a plain status readout, not a pass/fail signal — no
  // ok/error colour coding, here or per-channel below.
  const okCount = modbox.filter(
    (name) => state[name]?.value === 1,
  ).length
  const total = modbox.length

  const items: DetailListItem[] = modbox.map((name, i) => {
    const msg = state[name]
    const sev = severityTone(msg)
    // EPICS severity (or a disconnected/errored PV) overrides the plain
    // neutral readout below.
    if (sev !== 'none') {
      return { label: `Modbox ${i + 1}`, state: severityToDetailState(sev) }
    }
    const v = msg?.value
    return {
      label: `Modbox ${i + 1}`,
      state: 'neutral',
      trailing: typeof v === 'number' ? String(v) : undefined,
    }
  })

  return (
    <SectionCard>
      <DataRow
        label="Modbox State"
        valueVariant="bare"
        value={
          <div
            className={styles.modboxRow}
            data-layout={mbc1Pv || mbc2Pv ? 'with-mbc' : 'bool-only'}
          >
            <span className={styles.mbcCol}>
              {(mbc1Pv || mbc2Pv) && (
                <span className={styles.mbcLabel}>BOOL</span>
              )}
              <button
                ref={triggerRef}
                type="button"
                className={styles.modboxStateButton}
                aria-expanded={expanded}
                aria-label="Toggle Modbox state detail"
                onClick={() => setExpanded((v) => !v)}
              >
                <span className={styles.modboxStatePill}>
                  <span className={styles.modboxStateCount}>
                    {okCount}/{total}
                  </span>
                  <span
                    className={styles.cornerTriangle}
                    data-expanded={expanded || undefined}
                    aria-hidden
                  />
                </span>
              </button>
            </span>
            {mbc1Pv && (
              <span className={styles.mbcCol}>
                <span className={styles.mbcLabel}>MBC1</span>
                <span className={styles.mbcCell}>
                  <FloatValue
                    data={state[mbc1Pv] as Message<number | null> | undefined}
                    precision={2}
                  />
                </span>
              </span>
            )}
            {mbc2Pv && (
              <span className={styles.mbcCol}>
                <span className={styles.mbcLabel}>MBC2</span>
                <span className={styles.mbcCell}>
                  <FloatValue
                    data={state[mbc2Pv] as Message<number | null> | undefined}
                    precision={2}
                  />
                </span>
              </span>
            )}
          </div>
        }
      />
      {expanded && <DetailList items={items} />}
      <DataRow
        label="Waveform Preset"
        value={
          <StringValue
            data={state[loadedWaveformPv] as Message<string | null> | undefined}
          />
        }
        action={
          can('LOAD_WAVEFORM') ? (
            <CogToggle ariaLabel="Set waveform preset">
              <WaveformSelect laser={laser} />
            </CogToggle>
          ) : undefined
        }
      />
      {latestWaveformPv && (
        <DataRow
          label="Waveform Latest"
          value={
            <StringValue
              data={
                state[latestWaveformPv] as Message<string | null> | undefined
              }
            />
          }
        />
      )}

      {hasModboxActions && (
        <div className={styles.actionRow}>
          <CogToggle ariaLabel="Modbox actions" inlineLabel="Modbox Actions">
            {can('MODBOX_ON') && (
              <ActionButton
                label="Set Modbox ON"
                pvName={pv.cmd(laser, 'MODBOX_ON')}
              />
            )}
            {can('MODBOX_OFF') && (
              <ActionButton
                label="Set Modbox OFF"
                pvName={pv.cmd(laser, 'MODBOX_OFF')}
                variant="secondary"
              />
            )}
            {hasWaveformAction && <WaveformActionDisclosure laser={laser} />}
          </CogToggle>
        </div>
      )}
    </SectionCard>
  )
}
