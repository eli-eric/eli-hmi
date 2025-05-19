import { ConnectorLine } from '@/components/ws-components/connector-line'

/**
 * L3BTSgvConnector component
 *
 * Displays the connector line with SGV valves
 */
export const L3BTSgvConnector = () => {
  const BI_SGV503_OPEN = 'BI_SGV503_OPEN'
  const BI_SGV503_CLOSE = 'BI_SGV503_CLOSE'
  const BI_SGV503_OPEN_C = 'BI_SGV503_OPEN_C'
  const BI_SGV503_CLOSE_C = 'BI_SGV503_CLOSE_C'
  const BI_SGV502_OPEN = 'BI_SGV502_OPEN'
  const BI_SGV502_CLOSE = 'BI_SGV502_CLOSE'
  const BI_SGV504_OPEN = 'BI_SGV504_OPEN'
  const BI_SGV504_CLOSE = 'BI_SGV504_CLOSE'
  const BI_SGV505_OPEN = 'BI_SGV505_OPEN'
  const BI_SGV505_CLOSE = 'BI_SGV505_CLOSE'

  return (
    <ConnectorLine>
      <ConnectorLine.Line>
        <ConnectorLine.Valve label="SGV503">
          <ConnectorLine.ValveControlStatus
            statusOpenPV={BI_SGV503_OPEN}
            statusClosePV={BI_SGV503_CLOSE}
            controlOpenPV={BI_SGV503_OPEN_C}
            controlClosePV={BI_SGV503_CLOSE_C}
          />
        </ConnectorLine.Valve>
      </ConnectorLine.Line>
      <ConnectorLine.Line>
        <ConnectorLine.Valve label="SGV502">
          <ConnectorLine.ValveStatus
            openPV={BI_SGV502_OPEN}
            closePV={BI_SGV502_CLOSE}
          />
        </ConnectorLine.Valve>
        <ConnectorLine.LabelValue label="E2" />
      </ConnectorLine.Line>
      <ConnectorLine.Line>
        <ConnectorLine.Valve label="SGV504">
          <ConnectorLine.ValveStatus
            openPV={BI_SGV504_OPEN}
            closePV={BI_SGV504_CLOSE}
          />
        </ConnectorLine.Valve>
        <ConnectorLine.LabelValue label="E4" />
      </ConnectorLine.Line>
      <ConnectorLine.Line>
        <ConnectorLine.Valve label="SGV505">
          <ConnectorLine.ValveStatus
            openPV={BI_SGV505_OPEN}
            closePV={BI_SGV505_CLOSE}
          />
        </ConnectorLine.Valve>
        <ConnectorLine.LabelValue label="E5" />
      </ConnectorLine.Line>
    </ConnectorLine>
  )
}
