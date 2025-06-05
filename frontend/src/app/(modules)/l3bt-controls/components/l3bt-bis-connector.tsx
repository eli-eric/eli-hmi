import { ConnectorLine } from '@/components/ws-components/connector-line'
import { ENV } from '@/types/constants'

/**
 * L3BTBisConnector component
 *
 * Displays the connector line between L3 BIS and L3 CMP with SGV501 and LN34 valves
 */

// TODO
const PV_SETTINGS = {
  development: {
    BI_SGV501_OPEN: 'BI_SGV501_OPEN',
    BI_SGV501_CLOSE: 'BI_SGV501_CLOSE',
    BI_LN34_OPEN: 'BI_LN34_OPEN',
    BI_LN34_CLOSE: 'BI_LN34_CLOSE',
  },
  production: {
    BI_SGV501_OPEN: 'L3BT-BIS-SGV501:OPEN',
    BI_SGV501_CLOSE: 'L3BT-BIS-SGV501:CLOSE',
    BI_LN34_OPEN: 'L3BT-CMP-LN34:OPEN',
    BI_LN34_CLOSE: 'L3BT-CMP-LN34:CLOSE',
  },
  test: {
    BI_SGV501_OPEN: 'BI_SGV501_OPEN_TEST',
    BI_SGV501_CLOSE: 'BI_SGV501_CLOSE_TEST',
    BI_LN34_OPEN: 'BI_LN34_OPEN_TEST',
    BI_LN34_CLOSE: 'BI_LN34_CLOSE_TEST',
  },
}

export const L3BTBisConnector = () => {
  return (
    <ConnectorLine>
      <ConnectorLine.Line>
        <ConnectorLine.LabelValue label="L3 BIS" />
        <ConnectorLine.Valve label="SGV501">
          <ConnectorLine.ValveStatus
            openPV={PV_SETTINGS[ENV].BI_SGV501_OPEN}
            closePV={PV_SETTINGS[ENV].BI_SGV501_CLOSE}
          />
        </ConnectorLine.Valve>
        <ConnectorLine.LabelValue label="L3 CMP" />
        <ConnectorLine.Valve label="LN34">
          <ConnectorLine.ValveStatus
            openPV={PV_SETTINGS[ENV].BI_LN34_OPEN}
            closePV={PV_SETTINGS[ENV].BI_LN34_CLOSE}
          />
        </ConnectorLine.Valve>
      </ConnectorLine.Line>
    </ConnectorLine>
  )
}
