import { ConnectorLine } from '@/components/ws-components/connector-line'

/**
 * L3BTBisConnector component
 *
 * Displays the connector line between L3 BIS and L3 CMP with SGV501 and LN34 valves
 */
export const L3BTBisConnector = () => {
  const BI_SGV501_OPEN = 'BI_SGV501_OPEN'
  const BI_SGV501_CLOSE = 'BI_SGV501_CLOSE'
  const BI_LN34_OPEN = 'BI_LN34_OPEN'
  const BI_LN34_CLOSE = 'BI_LN34_CLOSE'

  return (
    <ConnectorLine>
      <ConnectorLine.Line>
        <ConnectorLine.LabelValue label="L3 BIS" />
        <ConnectorLine.Valve label="SGV501">
          <ConnectorLine.ValveStatus
            pvNames={[BI_SGV501_OPEN, BI_SGV501_CLOSE]}
          />
        </ConnectorLine.Valve>
        <ConnectorLine.LabelValue label="L3 CMP" />
        <ConnectorLine.Valve label="LN34">
          <ConnectorLine.ValveStatus pvNames={[BI_LN34_OPEN, BI_LN34_CLOSE]} />
        </ConnectorLine.Valve>
      </ConnectorLine.Line>
    </ConnectorLine>
  )
}
