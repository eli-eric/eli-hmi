'use client'

import { Heading } from '@/components/ui/heading'
import {
  BottomContainer,
  PageLayout,
  SectionContainer,
  TopContainer,
  TopContentContainer,
} from '@/components/ui/layout'
import { L4fBTInterlocks } from './components/L4fBTInterlock'
import { L4fBTMachineSafetyPermission } from './components/L4fBTMachineSafetyPermission'
import { CleanDryAir } from './components/clean-dry-air'
import { Backing } from './components/backing'
import { Roughing } from './components/roughing'
import { L4fBTS1Connector } from './components/l4fbt-s1-connector'
import { S3Volumes } from '../l4fbt-controls/components/s3-volumes'
import { L4fBTP3Connector } from './components/l4fbt-p3-connector'

export default function L4fBTPage() {
  return (
    <PageLayout>
      <TopContainer>
        <TopContentContainer>
          <L4fBTInterlocks />
          <L4fBTMachineSafetyPermission />
        </TopContentContainer>
        <Heading title="L4fBT"></Heading>
      </TopContainer>
      <BottomContainer>
        <SectionContainer>
          <CleanDryAir />
          <Backing />
          <Roughing />
        </SectionContainer>
        <SectionContainer gap="0rem">
          <L4fBTS1Connector />
          <S3Volumes />
          <L4fBTP3Connector />
        </SectionContainer>
      </BottomContainer>
    </PageLayout>
  )
}
