import { ConnectorLine } from '@/components/ws-components/connector-line'

/**
 * L4fBTS1Connector component
 *
 * Displays the connector line between L4fBT S1 and L4fBT S3 with SGV404 as valve
 */

export const L4fBTS1Connector = () => {
  return (
    <ConnectorLine>
      <ConnectorLine.Line>
        <ConnectorLine.LabelValue label="L4fBT S1" />
        <ConnectorLine.Valve label="SGV404" />
      </ConnectorLine.Line>
    </ConnectorLine>
  )
}
