'use client'

import { SettingsButton } from '@/components/ui/buttons/settings-btn'
import { TestComp } from '../components/test'
import DropdownExample from '@/components/ui/dropdown/example-usage'

export default function L3btPage() {
  return (
    <div>
      <TestComp pvname="AI_TEMP_2" />
      <SettingsButton />
      <DropdownExample />
    </div>
  )
}
