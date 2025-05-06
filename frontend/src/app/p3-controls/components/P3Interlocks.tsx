import { Interlocks } from '@/app/ws-components/interlocks/interlocks'
import { ClearButton } from '@/components/ui/buttons'
import { ContainerCard, ContentCard } from '@/components/ui/cards'

const interlocks = [
  {
    title: 'P3 Chamber',
    pvName: 'BI_P3_Chamber',
  },
  {
    title: 'P3 Cryopump CRYO1',
    pvName: 'BI_P3_Cryo1',
  },
  {
    title: 'P3 Cryopump CRYO2',
    pvName: 'BI_P3_Cryo2',
  },
  {
    title: 'P3 Doors',
    pvName: 'BI_P3_Doors',
  },
  {
    title: 'P3 Turbopump TMP801',
    pvName: 'BI_P3_TMP801',
  },
  {
    title: 'P3 Turbopump TMP802',
    pvName: 'BI_P3_TMP802',
  },
  {
    title: 'Endstation Valve EGV501',
    pvName: 'BI_P3_EGV501',
  },
]

export const P3Interlocks = () => {
  return (
    <ContainerCard
      title="P3 Interlocks"
      controller={() => <ClearButton disabled />}
    >
      <ContentCard>
        <Interlocks interlocks={interlocks} />
      </ContentCard>
    </ContainerCard>
  )
}
