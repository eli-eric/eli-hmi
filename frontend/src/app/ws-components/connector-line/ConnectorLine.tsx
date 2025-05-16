'use client'

import { FC } from 'react'
import { Container } from './components/Container'
import { Line } from './components/Line'
import { Valve, ValveStatus } from './components/Valve'
import { LabelValue } from './components/LabelValue'
import { ValveControlStatus } from './components/ValveControlStatus'
import { GateConnected } from './components/GateConnected'

interface ConnectorLineProps {
  children: React.ReactNode
}

/**
 * ConnectorLine - Main container component for connector lines
 *
 * Uses compound component pattern to provide a flexible and composable interface
 * for creating connector lines with various subcomponents.
 *
 * @example
 * ```tsx
 * <ConnectorLine>
 *   <ConnectorLine.Line>
 *     <ConnectorLine.LabelValue label="L3 BIS" />
 *     <ConnectorLine.Valve label="SGV501">
 *       <ConnectorLine.ValveStatus pvNames={["BI_SGV501_OPEN", "BI_SGV501_CLOSE"]} />
 *     </ConnectorLine.Valve>
 *   </ConnectorLine.Line>
 * </ConnectorLine>
 * ```
 */
export const ConnectorLine: FC<ConnectorLineProps> & {
  Line: typeof Line
  Valve: typeof Valve
  ValveStatus: typeof ValveStatus
  LabelValue: typeof LabelValue
  ValveControlStatus: typeof ValveControlStatus
  Gate: typeof GateConnected
} = ({ children }) => {
  return <Container>{children}</Container>
}

// Attach subcomponents to ConnectorLine
ConnectorLine.Line = Line
ConnectorLine.Valve = Valve
ConnectorLine.ValveStatus = ValveStatus
ConnectorLine.LabelValue = LabelValue
ConnectorLine.ValveControlStatus = ValveControlStatus
ConnectorLine.Gate = GateConnected
