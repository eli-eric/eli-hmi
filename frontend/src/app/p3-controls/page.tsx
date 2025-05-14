'use client'

import { Heading } from '@/components/ui/heading'
import {
  BottomContainer,
  PageLayout,
  SectionContainer,
  TopContainer,
  TopContentContainer,
} from '@/components/ui/layout'
import { P3Interlocks } from './components/P3Interlocks'
import { P3MachineSafetyPermission } from './components/P3MachineSafetyPermission'
import { ClearDryAir } from './components/clean-dry-air'
import { Backing } from './components/backing'
import { Roughing } from './components/roughing'
import { Conector } from '../ws-components/conector-line'

export default function P3ControlsPage() {
  const BI_SGV501_OPEN = 'BI_SGV501_OPEN'
  const BI_SGV501_CLOSE = 'BI_SGV501_CLOSE'
  const BI_LN34_OPEN = 'BI_LN34_OPEN'
  const BI_LN34_CLOSE = 'BI_LN34_CLOSE'

  return (
    <PageLayout>
      <TopContainer>
        <TopContentContainer>
          <P3Interlocks />
          <P3MachineSafetyPermission />
        </TopContentContainer>
        <Heading title="P3" />
      </TopContainer>
      <BottomContainer>
        <SectionContainer>
          <ClearDryAir />
          <Backing />
          <Roughing />
        </SectionContainer>
        <SectionContainer gap="0rem">
          <Conector>
            <Conector.Line>
              <Conector.LabelValue label="L3 BIS" />
              <Conector.Valve label="SGV501">
                <Conector.ValveStatus
                  pvNames={[BI_SGV501_OPEN, BI_SGV501_CLOSE]}
                />
              </Conector.Valve>
              <Conector.LabelValue label="L3 CMP" />
              <Conector.Valve label="LN34">
                <Conector.ValveStatus pvNames={[BI_LN34_OPEN, BI_LN34_CLOSE]} />
              </Conector.Valve>
            </Conector.Line>
          </Conector>
          <Roughing />
          <Conector>
            <Conector.Line>
              <Conector.Valve label="SGV503">
                <Conector.ValveStatus
                  pvNames={[BI_SGV501_OPEN, BI_SGV501_CLOSE]}
                />
              </Conector.Valve>
            </Conector.Line>
            <Conector.Line>
              <Conector.Valve label="SGV503">
                <Conector.ValveStatus
                  pvNames={[BI_SGV501_OPEN, BI_SGV501_CLOSE]}
                />
              </Conector.Valve>
              <Conector.LabelValue label="E2" />
            </Conector.Line>
            <Conector.Line>
              <Conector.Valve label="SGV503">
                <Conector.ValveStatus
                  pvNames={[BI_SGV501_OPEN, BI_SGV501_CLOSE]}
                />
              </Conector.Valve>
              <Conector.LabelValue label="E4" />
            </Conector.Line>
            <Conector.Line>
              <Conector.Valve label="SGV503">
                <Conector.ValveStatus
                  pvNames={[BI_SGV501_OPEN, BI_SGV501_CLOSE]}
                />
              </Conector.Valve>
              <Conector.LabelValue label="E5" />
            </Conector.Line>
          </Conector>
          <Roughing />
        </SectionContainer>
      </BottomContainer>
    </PageLayout>
  )
}
