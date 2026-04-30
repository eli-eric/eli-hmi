import { ConnectorLine } from '@/components/hmi/connector-line'

/**
 * L4fBTP3Connector component
 *
 * Displays the connector line between L4fBT S3 and P3 with EGV802 as valve
 */

export const L4fBTP3Connector = () => {
  return (
    <ConnectorLine>
      <ConnectorLine.Line>
        <ConnectorLine.Valve label="EGV802">
          <ConnectorLine.ValveControlStatus
            statusOpenPV={'undefined1:OPEN'} //Add PV
            statusClosePV={'undefined2:CLOSED'} //Add PV
            controlOpenPV={'undefined3:SET_OPEN'} //Add PV
            controlClosePV={'undefined4:SET_CLOSED'} //Add PV
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
