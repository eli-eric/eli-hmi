import { SimpleLine } from '@/components/ui/icons/simple-line-icon'
import { ConnectorLine } from '@/components/ws-components/connector-line'
import { ENV } from '@/types/constants'

/**
 * L3BTSgvConnector component
 *
 * Displays the connector line with SGV valves
 */

const PV_SETTINGS = {
  development: {
    SGV503_OPEN: 'BI_L3BT-VCS-SGV503:OPEN',
    SGV503_CLOSE: 'BI_L3BT-VCS-SGV503:CLOSED',
    SGV503_OPEN_C: 'BI_SGV503_OPEN_C', // TODO
    SGV503_CLOSE_C: 'BI_SGV503_CLOSE_C', // TODO
    SGV502_OPEN: 'BI_L3BT-VCS-SGV502:OPEN',
    SGV502_CLOSE: 'BI_L3BT-VCS-SGV502:CLOSED',
    SGV504_OPEN: 'BI_L3BT-VCS-SGV504:OPEN',
    SGV504_CLOSE: 'BI_L3BT-VCS-SGV504:CLOSED',
    SGV505_OPEN: 'BI_L3BT-VCS-SGV505:CLOSED',
    SGV505_CLOSE: 'BI_L3BT-VCS-SGV505:CLOSED',
  },
  production: {
    SGV503_OPEN: 'L3BT-VCS-SGV503:OPEN',
    SGV503_CLOSE: 'L3BT-VCS-SGV503:CLOSED',
    SGV503_OPEN_C: 'L3BT-SGV503:OPEN_C', // TODO
    SGV503_CLOSE_C: 'L3BT-SGV503:CLOSE_C', // TODO
    SGV502_OPEN: 'L3BT-VCS-SGV502:OPEN',
    SGV502_CLOSE: 'L3BT-VCS-SGV502:CLOSED',
    SGV504_OPEN: 'L3BT-VCS-SGV504:OPEN',
    SGV504_CLOSE: 'L3BT-VCS-SGV504:CLOSED',
    SGV505_OPEN: 'L3BT-VCS-SGV505:CLOSED',
    SGV505_CLOSE: 'L3BT-VCS-SGV505:CLOSED',
  },
  test: {
    SGV503_OPEN: 'BI_L3BT-VCS-SGV503:OPEN',
    SGV503_CLOSE: 'BI_L3BT-VCS-SGV503:CLOSED',
    SGV503_OPEN_C: 'BI_SGV503_OPEN_C_TEST', // TODO
    SGV503_CLOSE_C: 'BI_SGV503_CLOSE_C_TEST', // TODO
    SGV502_OPEN: 'BI_L3BT-VCS-SGV502:OPEN',
    SGV502_CLOSE: 'BI_L3BT-VCS-SGV502:CLOSED',
    SGV504_OPEN: 'BI_L3BT-VCS-SGV504:OPEN',
    SGV504_CLOSE: 'BI_L3BT-VCS-SGV504:CLOSED',
    SGV505_OPEN: 'BI_L3BT-VCS-SGV505:CLOSED',
    SGV505_CLOSE: 'BI_L3BT-VCS-SGV505:CLOSED',
  },
}

export const L3BTSgvConnector = () => {
  return (
    <ConnectorLine>
      <ConnectorLine.Line>
        <ConnectorLine.Valve label="SGV503">
          <ConnectorLine.ValveControlStatus
            statusOpenPV={PV_SETTINGS[ENV].SGV503_OPEN}
            statusClosePV={PV_SETTINGS[ENV].SGV503_CLOSE}
            controlOpenPV={PV_SETTINGS[ENV].SGV503_OPEN_C}
            controlClosePV={PV_SETTINGS[ENV].SGV503_CLOSE_C}
          />
        </ConnectorLine.Valve>
      </ConnectorLine.Line>
      <ConnectorLine.Line>
        <SimpleLine />
        <ConnectorLine.Valve label="SGV502">
          <ConnectorLine.ValveStatus
            openPV={PV_SETTINGS[ENV].SGV502_OPEN}
            closePV={PV_SETTINGS[ENV].SGV502_CLOSE}
          />
        </ConnectorLine.Valve>
        <ConnectorLine.LabelValue label="E2" />
      </ConnectorLine.Line>
      <ConnectorLine.Line>
        <SimpleLine />
        <ConnectorLine.Valve label="SGV504">
          <ConnectorLine.ValveStatus
            openPV={PV_SETTINGS[ENV].SGV504_OPEN}
            closePV={PV_SETTINGS[ENV].SGV504_CLOSE}
          />
        </ConnectorLine.Valve>
        <ConnectorLine.LabelValue label="E4" />
      </ConnectorLine.Line>
      <ConnectorLine.Line>
        <SimpleLine />
        <ConnectorLine.Valve label="SGV505">
          <ConnectorLine.ValveStatus
            openPV={PV_SETTINGS[ENV].SGV505_OPEN}
            closePV={PV_SETTINGS[ENV].SGV505_CLOSE}
          />
        </ConnectorLine.Valve>
        <ConnectorLine.LabelValue label="E5" />
      </ConnectorLine.Line>
    </ConnectorLine>
  )
}
