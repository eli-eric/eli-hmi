'use client'
import { Interlocks } from '@/app/ws-components/interlocks/interlocks'
import { ContainerCard, ContentCard } from '@/components/ui/cards'
import { CardTitle } from '@/components/ui/cards/card-title'

const interlocks = [
  {
    title: 'Roughing',
    pvName: 'BI_L3BT_Roughing',
  },
  {
    title: 'High Vacuum Pumping',
    pvName: 'BI_L3BT_High_Vacuum_Pumping',
  },
  {
    title: 'Venting',
    pvName: 'BI_L3BT_Venting',
  },
]

export const L3BTMachineSafetyPermission = () => {
  return (
    <ContainerCard>
      <CardTitle label="L3BT Machine Safety Permissions" />
      <ContentCard>
        <Interlocks interlocks={interlocks} />
      </ContentCard>
    </ContainerCard>
  )
}
