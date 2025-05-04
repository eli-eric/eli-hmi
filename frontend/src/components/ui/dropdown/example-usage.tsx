'use client'

import Dropdown from '.'

// Example showing how to use the dropdown
export default function DropdownExample() {
  return (
    <div style={{ padding: '20px' }}>
      <h2>Dropdown Example</h2>
      
      {/* Fixed width dropdown */}
      <div style={{ marginBottom: '20px', width: '250px' }}>
        <Dropdown
          title="High Vacuum"
          items={[
            { label: 'Standby', onClick: () => console.log('Standby clicked') },
            { label: 'Vented', onClick: () => console.log('Vented clicked') },
            { label: 'Rough Vacuum', onClick: () => console.log('Rough Vacuum clicked') }
          ]}
          width="250px"
        />
      </div>

      {/* Responsive width dropdown */}
      <div style={{ marginBottom: '20px', width: '100%', maxWidth: '400px' }}>
        <Dropdown
          title="System Settings"
          items={[
            { label: 'Option 1', onClick: () => console.log('Option 1 clicked') },
            { label: 'Option 2', onClick: () => console.log('Option 2 clicked') },
            { label: 'Option 3', onClick: () => console.log('Option 3 clicked') },
            { label: 'Disabled Option', disabled: true }
          ]}
        />
      </div>

      {/* Custom width dropdown */}
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '180px' }}>
          <Dropdown
            title="Presets"
            items={[
              { label: 'Low', onClick: () => console.log('Low clicked') },
              { label: 'Medium', onClick: () => console.log('Medium clicked') },
              { label: 'High', onClick: () => console.log('High clicked') }
            ]}
            width="100%"
            align="center"
          />
        </div>
      </div>
    </div>
  )
}