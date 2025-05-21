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
            pvname="BI_P3_Chamber"
            title="P3 Chamber"
          />
          <VolumePanel.InterlockConnected
            pvname="BI_P3_Cryo1"
            title="P3 Cryopump CRYO1"
          />
          <VolumePanel.InterlockConnected
            pvname="BI_P3_Cryo2"
            title="P3 Cryopump CRYO2"
          />
          <VolumePanel.InterlockConnected
            pvname="BI_P3_Doors"
            title="P3 Doors"
          />
          <VolumePanel.InterlockConnected
            pvname="BI_P3_TMP801"
            title="P3 Turbopump TMP801"
          />
          <VolumePanel.InterlockConnected
            pvname="BI_P3_TMP802"
            title="P3 Turbopump TMP802"
          />
          <VolumePanel.InterlockConnected
            pvname="BI_P3_EGV501"
            title="Endstation Valve EGV501"
          />
        </VolumePanel.Interlocks>
      </VolumePanel.Card>
    </VolumePanel>
  )
}
