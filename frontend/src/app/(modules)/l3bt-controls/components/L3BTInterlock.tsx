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
            pvname={'L3BT-VCS-S1:INTERLOCK'}
            title="L3BT S1 Volume"
          />
          <VolumePanel.InterlockConnected
            pvname={'L3BT-VCS-S3:INTERLOCK'}
            title="L3BT S3 Volume"
          />
          <VolumePanel.InterlockConnected
            pvname={'L3BT-VCS-SGV503:INTERLOCK'}
            title="Safety Valve SGV503"
          />
          <VolumePanel.InterlockConnected
            pvname={'L3BT-VCS-EGV501:INTERLOCK'}
            title="Endstation Valve EGV501"
          />
        </VolumePanel.Interlocks>
      </VolumePanel.Card>
    </VolumePanel>
  )
}
