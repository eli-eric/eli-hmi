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
import { ValveIcon } from '@/components/ui/icons'

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
          <ValveIcon />
        </SectionContainer>
      </BottomContainer>
    </PageLayout>
  )
}
