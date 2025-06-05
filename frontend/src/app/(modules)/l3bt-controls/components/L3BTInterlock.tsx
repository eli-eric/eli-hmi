'use client'
import { VolumePanel } from '@/components/ws-components/volume-panel'
import { ClearButton } from '@/components/ui/buttons'
import { ENV } from '@/types/constants'

/**
 * L3BTInterlocks component
 *
 * Displays the L3BT interlocks using the refactored VolumePanel.Interlocks component
 */

const PV_SETTINGS = {
  development: {
    L3BT_S1_Volume: 'BI_L3BT_S1_Volume',
    L3BT_S3_Volume: 'BI_L3BT_S3_Volume',
    L3BT_SGV503: 'BI_L3BT_SGV503',
    L3BT_EGV501: 'BI_L3BT_EGV501',
  },
  production: {
    L3BT_S1_Volume: 'L3BT-S1:VOLUME',
    L3BT_S3_Volume: 'L3BT-S3:VOLUME',
    L3BT_SGV503: 'L3BT-SGV503',
    L3BT_EGV501: 'L3BT-EGV501',
  },
  test: {
    L3BT_S1_Volume: 'BI_L3BT_S1_Volume_TEST',
    L3BT_S3_Volume: 'BI_L3BT_S3_Volume_TEST',
    L3BT_SGV503: 'BI_L3BT_SGV503_TEST',
    L3BT_EGV501: 'BI_L3BT_EGV501_TEST',
  },
}
export const L3BTInterlocks = () => {
  return (
    <VolumePanel width="16rem">
      <VolumePanel.Title label="L3BT Interlocks">
        <ClearButton disabled />
      </VolumePanel.Title>
      <VolumePanel.Card height="20rem">
        <VolumePanel.Interlocks>
          <VolumePanel.InterlockConnected
            pvname={PV_SETTINGS[ENV].L3BT_S1_Volume}
            title="L3BT S1 Volume"
          />
          <VolumePanel.InterlockConnected
            pvname={PV_SETTINGS[ENV].L3BT_S3_Volume}
            title="L3BT S3 Volume"
          />
          <VolumePanel.InterlockConnected
            pvname={PV_SETTINGS[ENV].L3BT_SGV503}
            title="Safety Valve SGV503"
          />
          <VolumePanel.InterlockConnected
            pvname={PV_SETTINGS[ENV].L3BT_EGV501}
            title="Endstation Valve EGV501"
          />
        </VolumePanel.Interlocks>
      </VolumePanel.Card>
    </VolumePanel>
  )
}
