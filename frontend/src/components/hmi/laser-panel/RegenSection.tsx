'use client'

import { FC, useMemo } from 'react'
import { SectionCard } from '@/components/hmi/controls/SectionCard'
import { DataRow } from '@/components/hmi/controls/DataRow'
import { CogToggle } from '@/components/hmi/controls/CogToggle'
import { PresetIntegerInput } from '@/components/hmi/controls/PresetIntegerInput'
import {
  FloatValue,
  IntegerValue,
  StringValue,
} from '@/components/hmi/controls/Values'
import { useWebSocketData } from '@/lib/websocket/use-websocket-data'

interface RegenSectionProps {
  regenStatePv: string
  regenTempPv: string
  phd2MeanPv: string
  attenuatorPv: string
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
}) => {
  const numericPvs = useMemo(
    () => [regenTempPv, phd2MeanPv, attenuatorPv],
    [regenTempPv, phd2MeanPv, attenuatorPv],
  )
  const { state } = useWebSocketData<number | null>({
    pvs: numericPvs,
    raw: true,
  })
  // Regen state is a status string, not a boolean — separate string-typed
  // subscription, same split pattern as OverviewBar's module-error PVs.
  const { state: regenStatusState } = useWebSocketData<string | null>({
    pvs: [regenStatePv],
    raw: true,
  })

  return (
    <SectionCard>
      <DataRow
        label="Regen SY3PL50M:32"
        valueVariant="bare"
        value={<StringValue data={regenStatusState[regenStatePv]} />}
      />
      <DataRow
        label="Regen Temp TK6:44"
        value={<FloatValue data={state[regenTempPv]} precision={3} />}
      />
      <DataRow
        label="PHD1K000:48/Mean"
        value={<FloatValue data={state[phd2MeanPv]} precision={3} />}
      />
      <DataRow
        label="Atten. SM5:ATT1:51"
        value={<IntegerValue data={state[attenuatorPv]} />}
        action={
          <CogToggle ariaLabel="Set attenuator">
            <PresetIntegerInput
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
