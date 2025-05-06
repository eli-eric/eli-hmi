'use client'

import {
  PageLayout,
  TopContainer,
  TopContentContainer,
} from '@/components/ui/layout'
import { L3BTInterlocks } from './components/L3BTInterlock'
import { L3BTMachineSafetyPermission } from './components/L3BTMachineSafetyPermission'
import { Heading } from '@/components/ui/heading'

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
    </PageLayout>
  )
}
