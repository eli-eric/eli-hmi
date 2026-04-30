import { SimpleLine } from '@/components/ui/icons/simple-line-icon'
import { ConnectorLine } from '@/components/ws-components/connector-line'

/**
 * L3BTSgvConnector component
 *
 * Displays the connector line with SGV valves
 */

export const L3BTSgvConnector = () => {
  return (
    <ConnectorLine>
      <ConnectorLine.Line>
        <ConnectorLine.Valve label="SGV503">
          <ConnectorLine.ValveControlStatus
            statusOpenPV={'L3BT-VCS-SGV503:OPEN'}
            statusClosePV={'L3BT-VCS-SGV503:CLOSED'}
            controlOpenPV={'L3BT-VCS-SGV503:SET_OPEN'}
            controlClosePV={'L3BT-VCS-SGV503:SET_CLOSED'}
          />
        </ConnectorLine.Valve>
      </ConnectorLine.Line>
      <ConnectorLine.Line>
        <SimpleLine />
        <ConnectorLine.Valve label="SGV502">
          <ConnectorLine.ValveStatus
            openPV={'L3BT-VCS-SGV502:OPEN'}
            closePV={'L3BT-VCS-SGV502:CLOSED'}
          />
        </ConnectorLine.Valve>
        <ConnectorLine.LabelValue label="E2" />
      </ConnectorLine.Line>
      <ConnectorLine.Line>
        <SimpleLine />
        <ConnectorLine.Valve label="SGV504">
          <ConnectorLine.ValveStatus
            openPV={'L3BT-VCS-SGV504:OPEN'}
            closePV={'BI_L3BT-VCS-SGV504:CLOSED'}
          />
        </ConnectorLine.Valve>
        <ConnectorLine.LabelValue label="E4" />
      </ConnectorLine.Line>
      <ConnectorLine.Line>
        <SimpleLine />
        <ConnectorLine.Valve label="SGV505">
          <ConnectorLine.ValveStatus
            openPV={'BI_L3BT-VCS-SGV505:CLOSED'}
            closePV={'BI_L3BT-VCS-SGV505:CLOSED'}
          />
        </ConnectorLine.Valve>
        <ConnectorLine.LabelValue label="E5" />
      </ConnectorLine.Line>
    </ConnectorLine>
  )
}
