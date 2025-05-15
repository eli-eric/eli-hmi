import { Container } from './container'
import { Line } from './line'
import { Valve, ValveStatus } from './valve'
import { LabelValue } from './label-value'
import { ValveControlStatus } from './valve-control-status'
import { Gate } from './gate'

export const Conector = Object.assign(Container, {
  Valve: Valve,
  Line: Line,
  ValveStatus: ValveStatus,
  LabelValue: LabelValue,
  ValveControlStatus: ValveControlStatus,
  Gate: Gate,
})
