'use client'

import { SettingsButton } from '@/components/ui/buttons/settings-btn'
import { TestComp } from '../components/test'

export default function L3btPage() {
  return (
    <div>
      <TestComp pvname="AI_TEMP_2" />
      <SettingsButton />
    </div>
  )
}
