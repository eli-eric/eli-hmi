import { Container } from './container'
import { Line } from './line'
import { Valve, ValveStatus } from './valve'
import { LabelValue } from './label-value'

export const Conector = Object.assign(Container, {
  Valve: Valve,
  Line: Line,
  ValveStatus: ValveStatus,
  LabelValue: LabelValue,
})
