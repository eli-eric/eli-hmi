import { ConnectorLine } from '@/components/hmi/connector-line'

export const P3EGVConnector = () => {
  return (
    <ConnectorLine>
      <ConnectorLine.Line>
        <ConnectorLine.Gate
          href="/l3bt-controls"
          label="WRG531"
          name="L3BT S3"
          pvname="AI_MBAR_WRG531"
        />
        <ConnectorLine.Valve label="EGV501">
          <ConnectorLine.ValveControlStatus
            statusOpenPV="BI_EGV501_OPEN_S"
            statusClosePV="BI_EGV501_CLOSE_S"
            controlOpenPV="BI_EGV501_OPEN_C"
            controlClosePV="BI_EGV501_CLOSE_C"
          />
        </ConnectorLine.Valve>
      </ConnectorLine.Line>
      <ConnectorLine.Line>
        <ConnectorLine.Gate
          href="/l4fbt-controls"
          label="WRG583"
          name="L4fBT S3"
          pvname="AI_MBAR_WRG583" //Add PV
        />
        <ConnectorLine.Valve label="EGV802">
          <ConnectorLine.ValveControlStatus
            statusOpenPV="BI_EGV802_OPEN_S" //Add PV
            statusClosePV="BI_EGV802_CLOSE_S" //Add PV
            controlOpenPV="BI_EGV802_OPEN_C" //Add PV
            controlClosePV="BI_EGV802_CLOSE_C" //Add PV
          />
        </ConnectorLine.Valve>
      </ConnectorLine.Line>
    </ConnectorLine>
  )
}
