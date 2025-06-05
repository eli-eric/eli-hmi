import { ConnectorLine } from '@/components/ws-components/connector-line'
import { ENV } from '@/types/constants'

/**
 * L3BTEgvConnector component
 *
 * Displays the connector line with EGV valve and WRG gate
 */

// TODO
const PV_SETTINGS = {
  development: {
    EGV501_OPEN_S: 'BI_L3BT-VCS-EGV501:OPEN',
    EGV501_CLOSE_S: 'BI_L3BT-VCS-EGV501:CLOSED',
    EGV501_OPEN_C: 'BI_EGV501_OPEN_C', //TODO
    EGV501_CLOSE_C: 'BI_EGV501_CLOSE_C', //TODO
    WRG801_GATE: 'AI_MBAR_WRG801', //TODO
  },
  production: {
    EGV501_OPEN_S: 'L3BT-VCS-EGV501:OPEN',
    EGV501_CLOSE_S: 'L3BT-VCS-EGV501:CLOSED',
    EGV501_OPEN_C: 'L3BT-EGV501:OPEN_C', // TODO
    EGV501_CLOSE_C: 'L3BT-EGV501:CLOSE_C', // TODO
    WRG801_GATE: 'L3BT-WRG801:GATE', // TODO
  },
  test: {
    EGV501_OPEN_S: 'BI_L3BT-VCS-EGV501:OPEN',
    EGV501_CLOSE_S: 'BI_L3BT-VCS-EGV501:CLOSED',
    EGV501_OPEN_C: 'BI_EGV501_OPEN_C_TEST', // TODO
    EGV501_CLOSE_C: 'BI_EGV501_CLOSE_C_TEST', // TODO
    WRG801_GATE: 'AI_MBAR_WRG801_TEST', // TODO
  },
}
export const L3BTEgvConnector = () => {
  return (
    <ConnectorLine>
      <ConnectorLine.Line>
        <ConnectorLine.Valve label="EGV501">
          <ConnectorLine.ValveControlStatus
            statusOpenPV={PV_SETTINGS[ENV].EGV501_OPEN_S}
            statusClosePV={PV_SETTINGS[ENV].EGV501_CLOSE_S}
            controlOpenPV={PV_SETTINGS[ENV].EGV501_OPEN_C}
            controlClosePV={PV_SETTINGS[ENV].EGV501_CLOSE_C}
          />
        </ConnectorLine.Valve>
        <ConnectorLine.Gate
          label="WRG801"
          pvname={PV_SETTINGS[ENV].WRG801_GATE}
          href="/p3-controls"
          name="P3"
        />
      </ConnectorLine.Line>
    </ConnectorLine>
  )
}
