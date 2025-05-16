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

export const P3MachineSafetyPermission = () => {
  return (
    <ContainerCard>
      <CardTitle label="P3 Machine Safety Permissions" />
      <ContentCard height="20rem">
        <Interlocks interlocks={interlocks} />
      </ContentCard>
    </ContainerCard>
  )
}
