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
import { S1Volume } from './components/s1-volume'
import { S3Volume } from './components/s3-volume'
import { L3BTBisConnector } from './components/l3bt-bis-connector'
import { L3BTSgvConnector } from './components/l3bt-sgv-connector'
import { L3BTEgvConnector } from './components/l3bt-egv-connector'

export default function L3btPage() {
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
          <L3BTBisConnector />
          <S1Volume />
          <L3BTSgvConnector />
          <S3Volume />
          <L3BTEgvConnector />
        </SectionContainer>
      </BottomContainer>
    </PageLayout>
  )
}
