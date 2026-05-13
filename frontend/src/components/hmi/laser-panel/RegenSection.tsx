'use client'

import { FC } from 'react'
import { SectionCard } from '@/components/hmi/controls/SectionCard'
import { DataRow } from '@/components/hmi/controls/DataRow'
import { CogToggle } from '@/components/hmi/controls/CogToggle'
import { PresetIntegerInput } from '@/components/hmi/controls/PresetIntegerInput'
import {
  BoolPill,
  FloatValue,
  IntegerValue,
} from '@/components/hmi/controls/Values'
import { pv } from '@/app/(modules)/l4-opcpa/lib/pv-names'

interface RegenSectionProps {
  laser: string
}

/**
 * Regen amplifier status. PV mapping in `pv-names.ts`.
 */
export const RegenSection: FC<RegenSectionProps> = ({ laser }) => {
  return (
    <SectionCard>
      <DataRow
        label="Regen SY3PL50M:32"
        valueVariant="bare"
        value={
          <BoolPill
            pvName={pv.regenState(laser)}
            onLabel="is ON"
            offLabel="is OFF"
          />
        }
      />
      <DataRow
        label="Regen Temp TK6:44"
        value={<FloatValue pvName={pv.regenTemp(laser)} precision={3} />}
      />
      <DataRow
        label="PHD1K000:48/Mean"
        value={<FloatValue pvName={pv.phd2Mean(laser)} precision={3} />}
      />
      <DataRow
        label="Atten. SM5:ATT1:51"
        value={<IntegerValue pvName={pv.attenuator(laser)} />}
        action={
          <CogToggle ariaLabel="Set attenuator">
            <PresetIntegerInput
              label="Set Attenuator"
              presets={[]}
              pvName={pv.attenuator(laser)}
            />
          </CogToggle>
        }
      />
    </SectionCard>
  )
}
