'use client'
import { ClearButton, SettingsButton } from '@/components/ui/buttons'
import { ContainerCard, ContentCard } from '@/components/ui/cards'
import Dropdown from '@/components/ui/dropdown'

export default function ExamplesPage() {
  return (
    <div
      style={{
        gap: '2rem',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
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
        />
      </div>
      <ClearButton tooltipContent="disabled" disabled />
      <ContainerCard
        title="P3 Clean Dry Air"
        controller={() => <ClearButton tooltipContent="jedna dve" disabled />}
      >
        <Dropdown
          title="High Vacuum"
          items={[
            {
              label: 'Standby',
              onClick: () => console.log('Standby clicked'),
            },
            { label: 'Vented', onClick: () => console.log('Vented clicked') },
            {
              label: 'Rough Vacuum',
              onClick: () => console.log('Rough Vacuum clicked'),
            },
          ]}
        />
        <ContentCard>
          <ClearButton
            tooltipContent="Check/Clear"
            isProcessing={true}
            timeout={8}
          />
        </ContentCard>
      </ContainerCard>
    </div>
  )
}
