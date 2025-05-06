'use client'
import { ClearButton, SettingsButton } from '@/components/ui/buttons'
import Dropdown from '@/components/ui/dropdown'

export default function ExamplesPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h1>Examples Page</h1>
      <SettingsButton disabled />
      <SettingsButton />
      <div style={{ width: '250px' }}>
        <Dropdown
          title="High Vacuum"
          items={[
            { label: 'Standby', onClick: () => console.log('Standby clicked') },
            { label: 'Vented', onClick: () => console.log('Vented clicked') },
            {
              label: 'Rough Vacuum',
              onClick: () => console.log('Rough Vacuum clicked'),
            },
          ]}
          width="250px"
        />
      </div>
      <ClearButton tooltipContent="jedna dve" />
      <ClearButton tooltipContent="disabled" disabled />
      <ClearButton
        tooltipContent="Check/Clear"
        isProcessing={true}
        timeout={8}
      />
    </div>
  )
}
