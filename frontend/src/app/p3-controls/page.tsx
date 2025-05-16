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
import { P3Volumes } from './components/p3-volumes'

export default function P3ControlsPage() {
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
              <Conector.Gate
                href="/l3bt-controls"
                label="WRG531"
                name="L3BT S3"
                pvname="AI_MBAR_WRG531"
              />
              <Conector.Valve label="EGV501">
                <Conector.ValveControlStatus
                  controlPvs={['BI_OPEN_EGV501', 'BI_CLOSE_EGV502']}
                  statusPvs={['BI_OPEN_EGV501', 'BI_CLOSE_EGV502']}
                />
              </Conector.Valve>
            </Conector.Line>
          </Conector>
          <P3Volumes />
        </SectionContainer>
      </BottomContainer>
    </PageLayout>
  )
}
