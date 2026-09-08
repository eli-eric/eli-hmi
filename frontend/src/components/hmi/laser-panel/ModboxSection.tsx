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
import {
  severityPresentation,
  aggregateSeverityPresentation,
} from '@/lib/websocket/severity-presentation'
import type {
  CommandPvResolver,
  LaserCommand,
} from '@/app/(modules)/l4-opcpa/lib/pv-names'
import type { LabeledPv } from '@/app/(modules)/l4-opcpa/config/schema'
import { WaveformSelect } from './WaveformSelect'
import { makeCommandGate } from './commandGate'
import { useCollapseOnAnyClick } from './use-collapse-on-any-click'
import styles from './sections.module.css'

interface ModboxSectionProps {
  /** Resolves a command to its write PV (YAML override or CMD_<laser>_<NAME>). */
  cmdPv: CommandPvResolver
  /** Modbox state indicators: display label + PV (1 = OK). */
  modbox: readonly LabeledPv[]
  /** Currently-loaded-waveform PV (Waveform Preset). */
  loadedWaveformPv: string
  /** Previous-waveform PV shown in Waveform Latest. Optional. */
  latestWaveformPv?: string
  /** Modbox MBC1 / MBC2 bias readout PVs (shown on the Bias Value row). Optional. */
  mbc1Pv?: string
  mbc2Pv?: string
  /** Commands this laser exposes. Buttons for commands not listed are hidden. */
  commands: readonly LaserCommand[]
}

const WaveformActionDisclosure: FC<{ pvName: string }> = ({ pvName }) => {
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
      {open && <WaveformSelect pvName={pvName} />}
    </div>
  )
}

/**
 * Modbox (modulation box) status + actions + waveform control. PV names arrive
 * as props (resolved from the YAML config); command write PVs come from
 * `cmdPv`.
 */
export const ModboxSection: FC<ModboxSectionProps> = ({
  cmdPv,
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

  const modboxPvs = useMemo(() => modbox.map((m) => m.pv), [modbox])
  const allPvs = useMemo(
    () =>
      [...modboxPvs, loadedWaveformPv, latestWaveformPv, mbc1Pv, mbc2Pv].filter(
        (p): p is string => Boolean(p),
      ),
    [modboxPvs, loadedWaveformPv, latestWaveformPv, mbc1Pv, mbc2Pv],
  )
  // Mixed value types (number for state, string for waveform). Keep the hook
  // typed as `unknown` and narrow at the use site.
  const { state, isConnected } = useWebSocketData<unknown>({
    pvs: allPvs,
    raw: true,
  })
  // Modbox state is a plain status readout, not a pass/fail signal — no
  // colour coding from the raw 1/0 value, here or per-channel below. The
  // summary pill's only colour comes from the worst EPICS severity among
  // its channels.
  const okCount = modboxPvs.filter((name) => state[name]?.value === 1).length
  const total = modboxPvs.length
  const modboxSeverity = aggregateSeverityPresentation(
    modboxPvs.map((name) => state[name]),
    { isConnected },
  )
  // 'unknown' (no channel has reported yet) stays unpainted here — this pill
  // never colours by the raw bit value either, so "no data" and "all fine"
  // deliberately look the same.
  const modboxTone =
    modboxSeverity.tone === 'unknown' ? undefined : modboxSeverity.tone

  const items: DetailListItem[] = modbox.map(({ label, pv: name }) => {
    const msg = state[name]
    const { tone, text, title } = severityPresentation(msg, { isConnected })
    const v = msg?.value
    return {
      label,
      tone,
      text: text ?? (v === null || v === undefined ? undefined : String(v)),
      title,
    }
  })

  return (
    <SectionCard>
      <DataRow
        label="Modbox State"
        valueVariant="bare"
        value={
          <button
            ref={triggerRef}
            type="button"
            className={styles.modboxStateButton}
            aria-expanded={expanded}
            aria-label="Toggle Modbox state detail"
            onClick={() => setExpanded((v) => !v)}
          >
            <span
              className={styles.modboxStatePill}
              data-tone-surface="chip"
              data-tone={modboxTone}
              title={modboxSeverity.title}
            >
              <span className={styles.modboxStateCount}>
                {modboxSeverity.tone === 'unknown'
                  ? `${okCount}/${total}`
                  : (modboxSeverity.text ?? `${okCount}/${total}`)}
              </span>
              <span
                className={styles.cornerTriangle}
                data-expanded={expanded || undefined}
                aria-hidden
              />
            </span>
          </button>
        }
      />
      {expanded && <DetailList items={items} />}
      {(mbc1Pv || mbc2Pv) && (
        <DataRow
          label="Bias Value"
          valueVariant="bare"
          value={
            <div className={styles.mbcRow}>
              {mbc1Pv && (
                <span className={styles.mbcPair}>
                  <span className={styles.mbcLabel}>MBC1</span>
                  <span className={styles.mbcCell} data-tone-surface="cell">
                    <FloatValue
                      data={state[mbc1Pv] as Message<number | null> | undefined}
                      precision={2}
                    />
                  </span>
                </span>
              )}
              {mbc2Pv && (
                <span className={styles.mbcPair}>
                  <span className={styles.mbcLabel}>MBC2</span>
                  <span className={styles.mbcCell} data-tone-surface="cell">
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
      )}
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
              <WaveformSelect pvName={cmdPv('LOAD_WAVEFORM').pvName} />
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
              <ActionButton label="Set Modbox ON" {...cmdPv('MODBOX_ON')} />
            )}
            {can('MODBOX_OFF') && (
              <ActionButton
                label="Set Modbox OFF"
                {...cmdPv('MODBOX_OFF')}
                variant="secondary"
              />
            )}
            {hasWaveformAction && (
              <WaveformActionDisclosure
                pvName={cmdPv('LOAD_WAVEFORM').pvName}
              />
            )}
          </CogToggle>
        </div>
      )}
    </SectionCard>
  )
}
