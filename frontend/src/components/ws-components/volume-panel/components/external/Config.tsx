import { FC } from 'react'

import { Container } from '../Container'
import { VolumeTitle } from '../internal/VolumeTitle'
import { DropDownStateControl } from '../internal/DropDownStateControl'

interface ConfigProps {
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
 * Configuration panel with a state-control dropdown.
 */
export const Config: FC<ConfigProps> = ({ title, stateControl }) => {
  return (
    <Container>
      <VolumeTitle title={title} />
      {stateControl && (
        <DropDownStateControl
          controlPvs={stateControl.controlPvs}
          pvNameCurrent={stateControl.pvCurrentState}
          pvNameTarget={stateControl.pvTargetState}
        />
      )}
    </Container>
  )
}
