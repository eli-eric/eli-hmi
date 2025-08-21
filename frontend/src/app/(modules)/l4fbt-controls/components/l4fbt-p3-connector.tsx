import { ConnectorLine } from '@/components/ws-components/connector-line'

/**
 * L4fBTS1Connector component
 *
 * Displays the connector line between L4fBT S1 and L4fBT S3 with SGV404 as valve
 */

export const L4fBTP3Connector = () => {
  return (
    <ConnectorLine>
      <ConnectorLine.Line>
        <ConnectorLine.Valve label="EGV802">
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
