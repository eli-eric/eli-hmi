'use client'
import { VolumePanel } from '@/components/ws-components/volume-panel'
import { ENV } from '@/types/constants'

/**
 * L3BTMachineSafetyPermission component
 *
 * Displays the L3BT machine safety permissions using the refactored VolumePanel.Interlocks component
 */

const PV_SETTINGS = {
  development: {
    ROUGHING: 'BI_L3BT_MACHINE_SAFETY_PERMISSION_1',
    HIGH_VACCUM: 'BI_L3BT_MACHINE_SAFETY_PERMISSION_2',
    VENTING: 'BI_L3BT_MACHINE_SAFETY_PERMISSION_3',
  },
  production: {
    ROUGHING: 'L3BT-MACHINE-SAFETY-PERMISSION-1',
    HIGH_VACCUM: 'L3BT-MACHINE-SAFETY-PERMISSION-2',
    VENTING: 'L3BT-MACHINE-SAFETY-PERMISSION-3',
  },
  test: {
    ROUGHING: 'BI_L3BT_MACHINE_SAFETY_PERMISSION_1_TEST',
    HIGH_VACCUM: 'BI_L3BT_MACHINE_SAFETY_PERMISSION_2_TEST',
    VENTING: 'BI_L3BT_MACHINE_SAFETY_PERMISSION_3_TEST',
  },
}
export const L3BTMachineSafetyPermission = () => {
  return (
    <VolumePanel width="16rem">
      <VolumePanel.Title label="L3BT Machine Safety Permissions" />
      <VolumePanel.Card height="20rem">
        <VolumePanel.Interlocks>
          <VolumePanel.InterlockConnected
            pvname={PV_SETTINGS[ENV].ROUGHING}
            title="Roughing"
          />
          <VolumePanel.InterlockConnected
            pvname={PV_SETTINGS[ENV].HIGH_VACCUM}
            title="High Vacuum Pumping"
          />
          <VolumePanel.InterlockConnected
            pvname={PV_SETTINGS[ENV].VENTING}
            title="Venting"
          />
        </VolumePanel.Interlocks>
      </VolumePanel.Card>
    </VolumePanel>
  )
}
