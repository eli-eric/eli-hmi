import { FC } from 'react'
import { VolumePanel } from '@/components/ws-components/volume-panel'
import { TurbopumpBasic } from '@/components/ws-components/volume-panel/components/TurboPumpBasic'
import { ENV } from '@/types/constants'

/**
 * Example usage of TurbopumpBasic component with environment-based PV settings
 */

// Define PV settings per environment
const PV_SETTINGS = {
  development: {
    // Base PV names without prefixes - the getPrefixedPV utility will add them
    pumpTMP511Status: 'L3BT-VCS-TMP511:ActualFrequency',
    rpmTMP511: 'L3BT-VCS-TMP511:ActualFrequency',
    tempTMP511: 'L3BT-VCS-TMP511:ActualConverterTemperature',

    pumpTMP512Status: 'L3BT-VCS-TMP512:ActualFrequency',
    rpmTMP512: 'L3BT-VCS-TMP512:ActualFrequency',
    tempTMP512: 'L3BT-VCS-TMP512:ActualConverterTemperature',
  },
  production: {
    // Production PVs keep their original names
    pumpTMP511Status: 'L3BT-VCS-TMP511:ActualFrequency',
    rpmTMP511: 'L3BT-VCS-TMP511:ActualFrequency',
    tempTMP511: 'L3BT-VCS-TMP511:ActualConverterTemperature',

    pumpTMP512Status: 'L3BT-VCS-TMP512:ActualFrequency',
    rpmTMP512: 'L3BT-VCS-TMP512:ActualFrequency',
    tempTMP512: 'L3BT-VCS-TMP512:ActualConverterTemperature',
  },
  test: {
    // Test environment PVs (similar to development)
    pumpTMP511Status: 'L3BT-VCS-TMP511:ActualFrequency',
    rpmTMP511: 'L3BT-VCS-TMP511:ActualFrequency',
    tempTMP511: 'L3BT-VCS-TMP511:ActualConverterTemperature',

    pumpTMP512Status: 'L3BT-VCS-TMP512:ActualFrequency',
    rpmTMP512: 'L3BT-VCS-TMP512:ActualFrequency',
    tempTMP512: 'L3BT-VCS-TMP512:ActualConverterTemperature',
  },
}

/**
 * TurbopumpExample component
 *
 * Example of using TurbopumpBasic component with environment-based PV settings
 */
export const TurbopumpExample: FC = () => {
  const settings = PV_SETTINGS[ENV as keyof typeof PV_SETTINGS]

  return (
    <VolumePanel width="13rem">
      <VolumePanel.Title label="Turbopumps" />
      <VolumePanel.Container>
        {/* First Turbopump */}
        <TurbopumpBasic
          label="L3BT S1 Turbopump TMP511, CH501"
          statusPV={settings.pumpTMP511Status}
          rpmPV={settings.rpmTMP511}
          tempPV={settings.tempTMP511}
        />

        {/* Second Turbopump */}
        <TurbopumpBasic
          label="L3BT S1 Turbopump TMP512, CH503"
          statusPV={settings.pumpTMP512Status}
          rpmPV={settings.rpmTMP512}
          tempPV={settings.tempTMP512}
        />
      </VolumePanel.Container>
    </VolumePanel>
  )
}
