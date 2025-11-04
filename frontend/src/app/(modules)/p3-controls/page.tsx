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
import { CleanDryAir } from './components/clean-dry-air'
import { Backing } from './components/backing'
import { Roughing } from './components/roughing'
import { P3Volumes } from './components/p3-volumes'
import { P3EGVConnector } from './components/p3-egv-connector'

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
          <CleanDryAir />
          <Backing />
          <Roughing />
        </SectionContainer>
        {/* TODO pro connector line nevime Pvcka */}
        <SectionContainer gap="0rem">
          <P3EGVConnector />
          <P3Volumes />
        </SectionContainer>
      </BottomContainer>
    </PageLayout>
  )
}
