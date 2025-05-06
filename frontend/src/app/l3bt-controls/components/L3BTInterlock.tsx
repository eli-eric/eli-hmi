import { Interlocks } from '@/app/ws-components/interlocks/interlocks'
import { ClearButton } from '@/components/ui/buttons'
import { ContainerCard, ContentCard } from '@/components/ui/cards'

const interlocks = [
  {
    title: 'L3BT S1 Volume',
    pvName: 'BI_L3BT_S1_Volume',
  },
  {
    title: 'L3BT S3 Volume',
    pvName: 'BI_L3BT_S3_Volume',
  },
  {
    title: 'Safety Valve SGV503',
    pvName: 'BI_L3BT_SGV503',
  },
  {
    title: 'Endstation Valve EGV501',
    pvName: 'BI_L3BT_EGV501',
  },
]

export const L3BTInterlocks = () => {
  return (
    <ContainerCard
      title="L3BT Interlocks"
      controller={() => <ClearButton disabled />}
    >
      <ContentCard>
        <Interlocks interlocks={interlocks} />
      </ContentCard>
    </ContainerCard>
  )
}
