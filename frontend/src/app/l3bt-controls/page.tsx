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
      </BottomContainer>
    </PageLayout>
  )
}
