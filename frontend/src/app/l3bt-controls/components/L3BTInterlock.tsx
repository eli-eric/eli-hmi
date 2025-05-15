'use client'
import { Interlocks } from '@/app/ws-components/interlocks/interlocks'
import { VolumePanel } from '@/app/ws-components/volume-panel'
import { ClearButton } from '@/components/ui/buttons'

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
    <VolumePanel width="16rem">
      <VolumePanel.Title label="L3BT Interlocks">
        <ClearButton disabled />
      </VolumePanel.Title>
      <VolumePanel.Card>
        <Interlocks interlocks={interlocks} />
      </VolumePanel.Card>
    </VolumePanel>
  )
}
