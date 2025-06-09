import { ConnectorLine } from '@/components/ws-components/connector-line'

/**
 * L3BTEgvConnector component
 *
 * Displays the connector line with EGV valve and WRG gate
 */

export const L3BTEgvConnector = () => {
  return (
    <ConnectorLine>
      <ConnectorLine.Line>
        <ConnectorLine.Valve label="EGV501">
          <ConnectorLine.ValveControlStatus
            statusOpenPV={'L3BT-VCS-EGV501:OPEN'}
            statusClosePV={'L3BT-VCS-EGV501:CLOSED'}
            controlOpenPV={'L3BT-VCS-EGV501:SET_OPEN'}
            controlClosePV={'L3BT-VCS-EGV501:SET_CLOSED'}
          />
        </ConnectorLine.Valve>
        <ConnectorLine.Gate
          label="WRG801"
          pvname={'AI_MBAR_WRG801_TEST'} // TODO
          href="/p3-controls"
          name="P3"
        />
      </ConnectorLine.Line>
    </ConnectorLine>
  )
}
