'use client'
import { Interlocks } from '@/app/ws-components/interlocks/interlocks'
import { VolumePanel } from '@/app/ws-components/volume-panel'

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
    <VolumePanel width="16rem">
      <VolumePanel.Title label="L3BT Machine Safety Permissions" />
      <VolumePanel.Card height="20rem">
        <Interlocks interlocks={interlocks} />
      </VolumePanel.Card>
    </VolumePanel>
  )
}
