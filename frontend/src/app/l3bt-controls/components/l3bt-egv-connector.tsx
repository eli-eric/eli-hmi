import { ConnectorLine } from '@/components/ws-components/connector-line'

/**
 * L3BTEgvConnector component
 *
 * Displays the connector line with EGV valve and WRG gate
 */
export const L3BTEgvConnector = () => {
  const BI_EGV501_OPEN_S = 'BI_EGV501_OPEN_S'
  const BI_EGV501_CLOSE_S = 'BI_EGV501_CLOSE_S'
  const BI_EGV501_OPEN_C = 'BI_EGV501_OPEN_C'
  const BI_EGV501_CLOSE_C = 'BI_EGV501_CLOSE_C'

  return (
    <ConnectorLine>
      <ConnectorLine.Line>
        <ConnectorLine.Valve label="EGV501">
          <ConnectorLine.ValveControlStatus
            statusOpenPV={BI_EGV501_OPEN_S}
            statusClosePV={BI_EGV501_CLOSE_S}
            controlOpenPV={BI_EGV501_OPEN_C}
            controlClosePV={BI_EGV501_CLOSE_C}
          />
        </ConnectorLine.Valve>
        <ConnectorLine.Gate
          label="WRG801"
          pvname="AI_MBAR_WRG801"
          href="/p3-controls"
          name="P3"
        />
      </ConnectorLine.Line>
    </ConnectorLine>
  )
}
