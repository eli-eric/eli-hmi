'use client'
import { VolumePanel } from '@/components/ws-components/volume-panel'
import { ClearButton } from '@/components/ui/buttons'

/**
 * L3BTInterlocks component
 *
 * Displays the L3BT interlocks using the refactored VolumePanel.Interlocks component
 */
export const L3BTInterlocks = () => {
  return (
    <VolumePanel width="16rem">
      <VolumePanel.Title label="L3BT Interlocks">
        <ClearButton disabled />
      </VolumePanel.Title>
      <VolumePanel.Card height="20rem">
        <VolumePanel.Interlocks>
          <VolumePanel.InterlockConnected
            pvname="BI_L3BT_S1_Volume"
            title="L3BT S1 Volume"
          />
          <VolumePanel.InterlockConnected
            pvname="BI_L3BT_S3_Volume"
            title="L3BT S3 Volume"
          />
          <VolumePanel.InterlockConnected
            pvname="BI_L3BT_SGV503"
            title="Safety Valve SGV503"
          />
          <VolumePanel.InterlockConnected
            pvname="BI_L3BT_EGV501"
            title="Endstation Valve EGV501"
          />
        </VolumePanel.Interlocks>
      </VolumePanel.Card>
    </VolumePanel>
  )
}
