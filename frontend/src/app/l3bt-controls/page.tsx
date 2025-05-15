'use client'

import { Heading } from '@/components/ui/heading'
import {
  BottomContainer,
  PageLayout,
  SectionContainer,
  TopContainer,
  TopContentContainer,
} from '@/components/ui/layout'
import { ClearDryAir } from './components/clean-dry-air'
import { Backing } from './components/backing'
import { Roughing } from './components/roughing'
import { L3BTInterlocks } from './components/L3BTInterlock'
import { L3BTMachineSafetyPermission } from './components/L3BTMachineSafetyPermission'
import { Conector } from '../ws-components/conector-line'
import { S1Volume } from './components/s1-volume'
import { S3Volume } from './components/s3-volume'

export default function L3btPage() {
  const BI_SGV501_OPEN = 'BI_SGV501_OPEN'
  const BI_SGV501_CLOSE = 'BI_SGV501_CLOSE'
  const BI_LN34_OPEN = 'BI_LN34_OPEN'
  const BI_LN34_CLOSE = 'BI_LN34_CLOSE'

  return (
    <PageLayout>
      <TopContainer>
        <TopContentContainer>
          <L3BTInterlocks />
          <L3BTMachineSafetyPermission />
        </TopContentContainer>
        <Heading title="L3BT"></Heading>
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
          <S1Volume />
          <Conector>
            <Conector.Line>
              <Conector.Valve label="SGV503">
                <Conector.ValveControlStatus
                  controlPvs={[BI_SGV501_OPEN, BI_SGV501_CLOSE]}
                  statusPvs={[BI_SGV501_OPEN, BI_SGV501_CLOSE]}
                />
              </Conector.Valve>
            </Conector.Line>
            <Conector.Line>
              <Conector.Valve label="SGV502">
                <Conector.ValveStatus
                  pvNames={[BI_SGV501_OPEN, BI_SGV501_CLOSE]}
                />
              </Conector.Valve>
              <Conector.LabelValue label="E2" />
            </Conector.Line>
            <Conector.Line>
              <Conector.Valve label="SGV504">
                <Conector.ValveStatus
                  pvNames={[BI_SGV501_OPEN, BI_SGV501_CLOSE]}
                />
              </Conector.Valve>
              <Conector.LabelValue label="E4" />
            </Conector.Line>
            <Conector.Line>
              <Conector.Valve label="SGV505">
                <Conector.ValveStatus
                  pvNames={[BI_SGV501_OPEN, BI_SGV501_CLOSE]}
                />
              </Conector.Valve>
              <Conector.LabelValue label="E5" />
            </Conector.Line>
          </Conector>
          <S3Volume />
          <Conector>
            <Conector.Line>
              <Conector.Valve label="EGV501">
                <Conector.ValveControlStatus
                  controlPvs={[BI_SGV501_OPEN, BI_SGV501_CLOSE]}
                  statusPvs={[BI_SGV501_OPEN, BI_SGV501_CLOSE]}
                />
              </Conector.Valve>
              <Conector.Gate
                label="WRG801"
                pvname="AI_MBAR_WRG801"
                href="/p3-controls"
                name="P3"
              />
            </Conector.Line>
          </Conector>
        </SectionContainer>
      </BottomContainer>
    </PageLayout>
  )
}
