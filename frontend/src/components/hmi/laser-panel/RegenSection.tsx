'use client'

import { FC, useMemo } from 'react'
import { SectionCard } from '@/components/hmi/controls/SectionCard'
import { DataRow } from '@/components/hmi/controls/DataRow'
import { CogToggle } from '@/components/hmi/controls/CogToggle'
import { PresetNumberInput } from '@/components/hmi/controls/PresetNumberInput'
import {
  FloatValue,
  IntegerValue,
  StringValue,
} from '@/components/hmi/controls/Values'
import { useWebSocketData } from '@/lib/websocket/use-websocket-data'
import {
  LABEL_DEFAULTS,
  UNIT_DEFAULTS,
  type FormatConfig,
  type ResolvedLabels,
  type UnitsConfig,
} from '@/app/(modules)/l4-opcpa/config/schema'

interface RegenSectionProps {
  regenStatePv: string
  regenTempPv: string
  /** Second photodiode. Omitted on a laser that has only one: no row. */
  phd2MeanPv?: string
  attenuatorPv: string
  /** What each row is called; see `LABEL_DEFAULTS`. */
  labels?: ResolvedLabels
  /** Configured units per signal role; each wins over PV metadata. */
  units?: UnitsConfig
  /** Configured number format per signal role; each wins over the default. */
  format?: FormatConfig
}

/**
 * Regen amplifier status. All PV names arrive as props (resolved from the YAML
 * config). The attenuator is a direct write to its PV — no command involved.
 */
export const RegenSection: FC<RegenSectionProps> = ({
  regenStatePv,
  regenTempPv,
  phd2MeanPv,
  attenuatorPv,
  units = {},
  format = {},
  labels = LABEL_DEFAULTS,
}) => {
  const numericPvs = useMemo(
    () =>
      [regenTempPv, phd2MeanPv, attenuatorPv].filter((name): name is string =>
        Boolean(name),
      ),
    [regenTempPv, phd2MeanPv, attenuatorPv],
  )
  const { state } = useWebSocketData<number | null>({
    pvs: numericPvs,
    raw: true,
  })
  // Regen state is a status string, not a boolean — separate string-typed
  // subscription, same split pattern as OverviewBar's module-error PVs.
  //
  // `:State` is an enum (mbbi) record: read at its native type Channel Access
  // delivers the numeric index, not OFF/ON/Failure, so ask the gateway for the
  // state name. Same reason the flashlamp channels do it.
  const { state: regenStatusState } = useWebSocketData<string | null>({
    pvs: [regenStatePv],
    raw: true,
    datatype: 'enum_string',
  })

  return (
    <SectionCard>
      <DataRow
        label={labels.regenState}
        value={
          <StringValue
            pvName={regenStatePv}
            data={regenStatusState[regenStatePv]}
          />
        }
      />
      <DataRow
        label={labels.regenTemp}
        value={
          <FloatValue
            pvName={regenTempPv}
            data={state[regenTempPv]}
            format={format.regenTemp}
            units={units.regenTemp}
            unitsFallback={UNIT_DEFAULTS.regenTemp}
          />
        }
      />
      {phd2MeanPv && (
        <DataRow
          label={labels.phd2Mean}
          value={
            <FloatValue
              pvName={phd2MeanPv}
              data={state[phd2MeanPv]}
              format={format.phd2Mean}
              units={units.phd2Mean}
            />
          }
        />
      )}
      <DataRow
        label={labels.attenuator}
        value={
          <IntegerValue
            pvName={attenuatorPv}
            data={state[attenuatorPv]}
            format={format.attenuator}
            units={units.attenuator}
          />
        }
        action={
          <CogToggle ariaLabel="Set attenuator">
            <PresetNumberInput
              label="Set Attenuator"
              presets={[]}
              pvName={attenuatorPv}
            />
          </CogToggle>
        }
      />
    </SectionCard>
  )
}
