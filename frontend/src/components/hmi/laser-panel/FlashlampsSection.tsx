'use client'

import { CSSProperties, FC, useMemo, useState } from 'react'
import { SectionCard } from '@/components/hmi/controls/SectionCard'
import { DataRow } from '@/components/hmi/controls/DataRow'
import { CogToggle } from '@/components/hmi/controls/CogToggle'
import { ActionButton } from '@/components/hmi/controls/ActionButton'
import { PresetIntegerInput } from '@/components/hmi/controls/PresetIntegerInput'
import {
  DetailList,
  DetailListItem,
} from '@/components/hmi/controls/DetailList'
import { useWebSocketData } from '@/lib/websocket/use-websocket-data'
import { severityTone } from '@/lib/websocket/severity'
import {
  severityPresentation,
  aggregateSeverityPresentation,
  TRANSPORT_DOWN_TITLE,
} from '@/lib/websocket/severity-presentation'
import { resolveUnits } from '@/lib/websocket/units'
import type {
  CommandPvResolver,
  LaserCommand,
} from '@/app/(modules)/l4-opcpa/lib/pv-names'
import type { LabeledPv } from '@/app/(modules)/l4-opcpa/config/schema'
import { makeCommandGate } from './commandGate'
import styles from './sections.module.css'

interface FlashlampsSectionProps {
  /** Resolves a command to its write PV (YAML override or CMD_<laser>_<NAME>). */
  cmdPv: CommandPvResolver
  /** Flashlamp channels: display label + state PV. */
  flashlamps: readonly LabeledPv[]
  /** Trigger-delay readout PVs; all should read equal (mismatch is flagged). */
  triggerDelay: readonly string[]
  /** Configured unit for the trigger delay (wins over PV metadata). */
  triggerDelayUnits?: string
  /** Trigger-delay preset values (ns). */
  delayPresets: readonly number[]
  /** Commands this laser exposes. Buttons for commands not listed are hidden. */
  commands: readonly LaserCommand[]
}

/**
 * Counted state columns. Capped at four by the row's width: a 22rem panel
 * minus the 8.5rem label and 2.25rem action column leaves ~2.4rem per cell,
 * about what a bold 4-character header needs. Adding a fifth column requires
 * shortening the headers or the label (see `.flashlampGrid` in the CSS) —
 * seven columns of 4-character headers would need a ~33rem panel.
 */
const STATES = ['SB', 'RUN', 'STOP', 'FAIL'] as const
type FlashlampState = (typeof STATES)[number]

// The PV delivers the full enum name (STANDBY, IGNITION, STOP, RUN, FAILURE,
// BUSY, OFF). Only these four have a count column: STANDBY and FAILURE map
// onto SB/FAIL, RUN and STOP match verbatim. IGNITION, BUSY and OFF are
// counted in no column; every state's raw text is still shown per channel in
// the expanded list (see `channelItems`).
const STATE_ALIASES: Record<string, FlashlampState> = {
  STANDBY: 'SB',
  RUN: 'RUN',
  STOP: 'STOP',
  FAILURE: 'FAIL',
}

function readState(value: unknown): FlashlampState | null {
  if (typeof value !== 'string') return null
  return STATE_ALIASES[value.toUpperCase()] ?? null
}

/**
 * Flashlamp channel states + lifecycle actions + trigger delay. All PV names
 * arrive as props (resolved from the YAML config); command write PVs come
 * from `cmdPv`.
 *
 * Trigger delay: the spec says the readouts should always be equal. We
 * subscribe to all `triggerDelay` PVs and flag a mismatch if any differ.
 */
export const FlashlampsSection: FC<FlashlampsSectionProps> = ({
  cmdPv,
  flashlamps,
  triggerDelay,
  triggerDelayUnits,
  delayPresets,
  commands,
}) => {
  const [expanded, setExpanded] = useState(false)
  const can = makeCommandGate(commands)
  const hasFlashlampActions = can('FLASHLAMPS_RUN') || can('FLASHLAMPS_STANDBY')

  const channelPvs = useMemo(() => flashlamps.map((f) => f.pv), [flashlamps])
  const channelLabels = useMemo(
    () => flashlamps.map((f) => f.label),
    [flashlamps],
  )

  // Channel states are enum (mbbi) records: read natively they arrive as the
  // numeric index, so ask the gateway for the state name. Trigger delay is
  // analog and must stay native — one subscribe message carries one datatype,
  // hence the split.
  const { state: channelState, isConnected } = useWebSocketData<
    string | number | null
  >({
    pvs: channelPvs,
    raw: true,
    datatype: 'enum_string',
  })
  const { state: delayState } = useWebSocketData<string | number | null>({
    pvs: triggerDelay,
    raw: true,
  })

  // Only channels with a usable reading are counted. A PV that is INVALID or
  // disconnected often still carries its last value — counting that would let
  // a dead channel report itself as RUN, and the tally would keep claiming all
  // eight flashlamps are accounted for while the panel says two are unusable.
  // An alarmed channel (MINOR/MAJOR) IS counted: its reading is still real,
  // the control system is just unhappy about it.
  const { counts, uncounted } = useMemo(() => {
    const c: Record<FlashlampState, number> = {
      SB: 0,
      RUN: 0,
      STOP: 0,
      FAIL: 0,
    }
    let uncounted = 0
    for (const name of channelPvs) {
      const msg = channelState[name]
      const tone = severityTone(msg)
      if (tone === 'invalid' || tone === 'unknown') {
        uncounted++
        continue
      }
      const s = readState(msg?.value)
      if (s) c[s]++
    }
    return { counts: c, uncounted }
  }, [channelPvs, channelState])

  // The columns no longer add up to the number of channels, so say why on
  // hover. (Channels in an uncounted state — IGNITION / BUSY / OFF — are a
  // separate, expected case and are not reported here; the expanded list
  // shows them.)
  const countsTitle = !isConnected
    ? TRANSPORT_DOWN_TITLE
    : uncounted > 0
      ? `${uncounted} of ${channelPvs.length} channels have no usable reading and are not counted.`
      : undefined

  // A channel row shows the state name and nothing more. No state is coloured
  // here — not even FAILURE: a failed flashlamp is an alarm condition, and the
  // IOC raises it as one, which the shared table then paints. Colouring it a
  // second time from the string would mean two independent notions of "bad",
  // which is exactly what this panel used to have.
  const channelItems: DetailListItem[] = channelPvs.map((name, i) => {
    const msg = channelState[name]
    const { tone, text, title } = severityPresentation(msg, {
      isConnected,
      pvName: name,
    })
    // A non-string value arrives when the state PV is an enum record read at
    // its native type: Channel Access then delivers the index (0/1/2…), not
    // the state name, and only a subscription asking for `enum_string` gets
    // the name. Show whatever came in rather than hiding it.
    const value = msg?.value
    const raw =
      value === null || value === undefined ? undefined : String(value)
    return { label: channelLabels[i], tone, text: text ?? raw, title }
  })

  // Trigger Delay: all readouts should be equal (spec). Flag if they differ.
  // These PVs have no alarm limits configured (no MINOR/MAJOR expected), but
  // INVALID severity (or a disconnected channel) on any of them still means
  // the reading can't be trusted, and takes priority over the mismatch check.
  const delaySeverity = aggregateSeverityPresentation(
    triggerDelay.map((name) => delayState[name]),
    { isConnected },
  )
  const delayVals = triggerDelay.map((name) => {
    const v = delayState[name]?.value
    return typeof v === 'number' ? Math.round(v) : null
  })
  const allKnown = delayVals.length > 0 && delayVals.every((v) => v !== null)
  const known = delayVals.filter((v): v is number => v !== null)
  const delayMismatch = allKnown && new Set(known).size > 1
  let delayDisplay: React.ReactNode
  if (delaySeverity.text !== undefined) {
    delayDisplay = (
      // `data-tone` lets the enclosing DataRow cell carry the fill, the same
      // way every other severity readout works.
      <span
        className={styles.delayInvalid}
        data-tone={delaySeverity.tone}
        title={delaySeverity.title}
      >
        {delaySeverity.text}
      </span>
    )
  } else if (!allKnown) {
    delayDisplay = <span data-tone="unknown">&lt;&gt;</span>
  } else if (delayMismatch) {
    // The one condition no PV can report: the readouts should be equal by
    // spec, and they are not. It gets the reserved 'negative-important' tone
    // and nothing else — the enclosing cell paints it, like every other tone
    // in the panel.
    delayDisplay = (
      <span
        className={styles.delayValue}
        data-tone="negative-important"
        title={known.join(' / ')}
      >
        MISMATCH {known.join('/')}
      </span>
    )
  } else {
    // Only a real reading carries a unit — the branches above replace the
    // value entirely, so a unit there would decorate a non-value.
    const unit = resolveUnits({
      config: triggerDelayUnits,
      metadata: delayState[triggerDelay[0]]?.units,
      fallback: 'ns',
    })
    delayDisplay = (
      // Carries the tone even when there is a perfectly good reading: with the
      // backend link down that reading is a stale snapshot, and the shared
      // table says so by handing back the 'unknown' tone plus a tooltip.
      <span
        className={styles.delayValue}
        data-tone={delaySeverity.tone}
        title={delaySeverity.title}
      >
        <span>{known[0]}</span>
        {unit && <span className={styles.delayUnits}>{unit}</span>}
      </span>
    )
  }

  return (
    <SectionCard>
      <div
        className={styles.flashlampGrid}
        // Keeps the grid's column count in step with STATES (see the CSS).
        style={{ '--flashlamp-state-count': STATES.length } as CSSProperties}
      >
        <span className={styles.rowLabel} />
        {STATES.map((s) => (
          <span key={s} className={styles.colHeader}>
            {s}
          </span>
        ))}
        <span />

        <button
          type="button"
          className={styles.flashlampStateButton}
          aria-expanded={expanded}
          aria-label="Toggle Flashlamps channel detail"
          onClick={() => setExpanded((v) => !v)}
        >
          <span>Flashlamps State</span>
          <span
            className={styles.cornerTriangle}
            data-expanded={expanded || undefined}
            aria-hidden
          />
        </button>
        {STATES.map((s) => (
          <span
            key={s}
            className={styles.flashlampCell}
            data-tone-surface="cell"
            // Stale counts grey out with everything else when the link drops.
            data-tone={isConnected ? undefined : 'unknown'}
            title={countsTitle}
            data-testid={`count-${s}`}
          >
            {counts[s]}
          </span>
        ))}
        {hasFlashlampActions ? (
          <CogToggle ariaLabel="Flashlamps actions">
            {can('FLASHLAMPS_RUN') && (
              <ActionButton
                label="Set All to Run"
                {...cmdPv('FLASHLAMPS_RUN')}
              />
            )}
            {can('FLASHLAMPS_STANDBY') && (
              <ActionButton
                label="Set All to Standby"
                {...cmdPv('FLASHLAMPS_STANDBY')}
                variant="secondary"
              />
            )}
          </CogToggle>
        ) : (
          <span />
        )}
      </div>

      {expanded && <DetailList items={channelItems} />}

      <DataRow
        label="Trigger Delay"
        value={delayDisplay}
        action={
          can('SET_DELAY') ? (
            <CogToggle ariaLabel="Set trigger delay">
              <PresetIntegerInput
                label="Set Trigger Delay"
                presets={delayPresets}
                pvName={cmdPv('SET_DELAY').pvName}
              />
            </CogToggle>
          ) : undefined
        }
      />
    </SectionCard>
  )
}
