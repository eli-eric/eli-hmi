import { ConnectorLine } from '@/components/ws-components/connector-line'

/**
 * L3BTSgvConnector component
 *
 * Displays the connector line with SGV valves
 */
export const L3BTSgvConnector = () => {
  const BI_SGV501_OPEN = 'BI_SGV501_OPEN'
  const BI_SGV501_CLOSE = 'BI_SGV501_CLOSE'

  return (
    <ConnectorLine>
      <ConnectorLine.Line>
        <ConnectorLine.Valve label="SGV503">
          <ConnectorLine.ValveControlStatus
            controlPvs={[BI_SGV501_OPEN, BI_SGV501_CLOSE]}
            statusPvs={[BI_SGV501_OPEN, BI_SGV501_CLOSE]}
          />
        </ConnectorLine.Valve>
      </ConnectorLine.Line>
      <ConnectorLine.Line>
        <ConnectorLine.Valve label="SGV502">
          <ConnectorLine.ValveStatus
            pvNames={[BI_SGV501_OPEN, BI_SGV501_CLOSE]}
          />
        </ConnectorLine.Valve>
        <ConnectorLine.LabelValue label="E2" />
      </ConnectorLine.Line>
      <ConnectorLine.Line>
        <ConnectorLine.Valve label="SGV504">
          <ConnectorLine.ValveStatus
            pvNames={[BI_SGV501_OPEN, BI_SGV501_CLOSE]}
          />
        </ConnectorLine.Valve>
        <ConnectorLine.LabelValue label="E4" />
      </ConnectorLine.Line>
      <ConnectorLine.Line>
        <ConnectorLine.Valve label="SGV505">
          <ConnectorLine.ValveStatus
            pvNames={[BI_SGV501_OPEN, BI_SGV501_CLOSE]}
          />
        </ConnectorLine.Valve>
        <ConnectorLine.LabelValue label="E5" />
      </ConnectorLine.Line>
    </ConnectorLine>
  )
}
