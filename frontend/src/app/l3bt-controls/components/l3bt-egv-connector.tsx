import { ConnectorLine } from '@/app/ws-components/connector-line'

/**
 * L3BTEgvConnector component
 *
 * Displays the connector line with EGV valve and WRG gate
 */
export const L3BTEgvConnector = () => {
  const BI_SGV501_OPEN = 'BI_SGV501_OPEN'
  const BI_SGV501_CLOSE = 'BI_SGV501_CLOSE'

  return (
    <ConnectorLine>
      <ConnectorLine.Line>
        <ConnectorLine.Valve label="EGV501">
          <ConnectorLine.ValveControlStatus
            controlPvs={[BI_SGV501_OPEN, BI_SGV501_CLOSE]}
            statusPvs={[BI_SGV501_OPEN, BI_SGV501_CLOSE]}
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
