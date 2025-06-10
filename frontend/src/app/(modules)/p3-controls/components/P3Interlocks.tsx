'use client'
import { ClearButton } from '@/components/ui/buttons'
import { VolumePanel } from '@/components/ws-components/volume-panel'

/**
 * P3Interlocks component
 *
 * Displays the P3 interlocks using the refactored VolumePanel.Interlocks component
 */
export const P3Interlocks = () => {
  return (
    <VolumePanel width="16rem">
      <VolumePanel.Title label="P3 Interlocks">
        <ClearButton disabled />
      </VolumePanel.Title>
      <VolumePanel.Card height="20rem">
        <VolumePanel.Interlocks>
          <VolumePanel.InterlockConnected
            pvname="E3-P3-P3_CHAMBER:INTERLOCK"
            title="P3 Chamber"
          />
          <VolumePanel.InterlockConnected
            pvname="E3-P3-CRYO1:INTERLOCK"
            title="P3 Cryopump CRYO1"
          />
          <VolumePanel.InterlockConnected
            pvname="E3-P3-CRYO2:INTERLOCK"
            title="P3 Cryopump CRYO2"
          />
          <VolumePanel.InterlockConnected
            pvname="BI_P3_Doors" // TODO
            title="P3 Doors"
          />
          <VolumePanel.InterlockConnected
            pvname="BI_P3_TMP801" // TODO
            title="P3 Turbopump TMP801"
          />
          <VolumePanel.InterlockConnected
            pvname="BI_P3_TMP802" // TODO
            title="P3 Turbopump TMP802"
          />
          <VolumePanel.InterlockConnected
            pvname="L3BT-VCS-EGV501:INTERLOCK"
            title="Endstation Valve EGV501"
          />
        </VolumePanel.Interlocks>
      </VolumePanel.Card>
    </VolumePanel>
  )
}
