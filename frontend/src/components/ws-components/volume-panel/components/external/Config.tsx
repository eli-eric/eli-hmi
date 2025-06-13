import { Container } from '../Container'
import { FC } from 'react'
import { getPrefixedPV } from '@/lib/utils/pv-helpers'
import { VolumeTitle } from '../internal/VolumeTitle'
import { DropDownStateControl } from '../internal/DropDownStateControl'

interface SensorBarProps {
  stateControl?: {
    pvCurrentState: string
    pvTargetState: string
    controlPvs: {
      pvName: string
      label: string
    }[]
  }
  title: string
}

/**
 * Config component
 *
 * @param stateControl - Optional state control with PV name and control PVs
 * @param title - Optional title for the sensor bar
 * @return JSX.Element
 *  */
export const Config: FC<SensorBarProps> = ({ title, stateControl }) => {
  return (
    <Container>
      <VolumeTitle title={title} />
      {stateControl && (
        <DropDownStateControl
          {...{
            controlPvs: stateControl.controlPvs.map((pv) => ({
              pvName: getPrefixedPV(pv.pvName),
              label: pv.label,
            })),
            pvNameCurrent: getPrefixedPV(stateControl.pvCurrentState),
            pvNameTarget: getPrefixedPV(stateControl.pvTargetState),
          }}
        />
      )}
    </Container>
  )
}
