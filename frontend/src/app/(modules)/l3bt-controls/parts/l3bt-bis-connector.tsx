import { ConnectorLine } from '@/components/ws-components/connector-line'

/**
 * L3BTBisConnector component
 *
 * Displays the connector line between L3 BIS and L3 CMP with SGV501 and LN34 valves
 */

export const L3BTBisConnector = () => {
  return (
    <ConnectorLine>
      <ConnectorLine.Line>
        <ConnectorLine.LabelValue label="L3 BIS" />
        <ConnectorLine.Valve label="SGV501">
          <ConnectorLine.ValveStatus
            openPV={'L3BT-BIS-SGV501:OPEN'}
            closePV={'L3BT-BIS-SGV501:CLOSE'}
          />
        </ConnectorLine.Valve>
        <ConnectorLine.LabelValue label="L3 CMP" />
        <ConnectorLine.Valve label="LN34">
          <ConnectorLine.ValveStatus
            openPV={'L3BT-CMP-LN34:OPEN'}
            closePV={'L3BT-CMP-LN34:CLOSE'}
          />
        </ConnectorLine.Valve>
      </ConnectorLine.Line>
    </ConnectorLine>
  )
}
