'use client'

import { Heading } from '@/components/ui/heading'
import {
  BottomContainer,
  PageLayout,
  SectionContainer,
  TopContainer,
  TopContentContainer,
} from '@/components/ui/layout'
import { BuilderExample } from './components/builder-example'

/**
 * Test page for the GUIBuilder component
 * Demonstrates how to use the GUIBuilder to create a UI using configuration
 */
export default function TestPage() {
  return (
    <PageLayout>
      <TopContainer>
        <TopContentContainer></TopContentContainer>
        <Heading title="GUI Builder Test"></Heading>
      </TopContainer>
      <BottomContainer>
        <SectionContainer>
          <BuilderExample />
        </SectionContainer>
      </BottomContainer>
    </PageLayout>
  )
}
