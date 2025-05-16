# VolumePanel Component

A refactored compound component for displaying volume panels with sensors, controls, and status information.

## Improvements

### 1. Consistent Naming Conventions

- Used PascalCase for component names (VolumePanel, VolumeTitle, etc.)
- Used camelCase for props and variables
- Used BEM methodology for CSS class names

### 2. Improved File Organization

- Created a logical folder structure:
  - `components/`: Individual UI components
  - `context/`: Context providers
  - `styles/`: CSS modules
- Separated components into their own files
- Organized CSS files by functionality

### 3. Optimized CSS with BEM Methodology

- Block: `volumePanel`, `sensor`, `control`
- Element: `volumePanel__label`, `sensor__value`, etc.
- Modifier: (when needed) `volumePanel__card--active`, etc.

### 4. Refined Compound Pattern Implementation

- Improved type definitions
- Enhanced documentation
- Made component composition more explicit and maintainable

## Usage Example

```tsx
<VolumePanel>
  <VolumePanel.Title label="Pressure Readings">
    <VolumePanel.TitleButton onClick={handleClick} />
  </VolumePanel.Title>
  <VolumePanel.Label label="System Status" />
  <VolumePanel.Card>
    <VolumePanel.CardLabel>Readings</VolumePanel.CardLabel>
    <VolumePanel.SensorPressureConnected pvname="pressure" label="Chamber" />
  </VolumePanel.Card>
  <VolumePanel.Card>
    <VolumePanel.CardLabel>Safety Interlocks</VolumePanel.CardLabel>
    <VolumePanel.Interlocks>
      <VolumePanel.InterlockConnected
        pvname="BI_INTERLOCK_DOOR"
        title="Door Interlock"
      />
      <VolumePanel.InterlockConnected
        pvname="BI_INTERLOCK_PRESSURE"
        title="Pressure Interlock"
      />
    </VolumePanel.Interlocks>
  </VolumePanel.Card>
</VolumePanel>
```

## Component Structure

- **VolumePanel**: Main container component
- **VolumeTitle**: Title component with optional buttons
- **VolumeLabel**: Label component for section headers
- **VolumeCard**: Card component for content sections
- **SensorComponents**: Various sensor display components
- **StateControl**: Controls for volume state
- **Container**: Flexible container for layout
- **Interlocks**: Component for displaying system interlocks

## Folder Structure

```
volume-panel/
├── index.ts                     # Main export file
├── VolumePanel.tsx              # Main container component
├── README.md                    # Documentation
├── components/                  # Subcomponents
│   ├── VolumeTitle.tsx          # Title component
│   ├── VolumeLabel.tsx          # Label component
│   ├── VolumeCard.tsx           # Card component
│   ├── SensorComponents.tsx     # Sensor-related components
│   ├── StateControl.tsx         # State control component
│   ├── Container.tsx            # Container component
│   ├── MultiVolumePanel.tsx     # Multi-volume layout component
│   └── Interlocks.tsx           # Interlocks component
├── context/                     # Context providers
│   └── VolumePanelContext.tsx   # Context definition
└── styles/                      # CSS modules
    ├── volume-panel.module.css  # Main styles
    ├── sensors.module.css       # Sensor-specific styles
    ├── controls.module.css      # Control-specific styles
    └── interlocks.module.css    # Interlocks-specific styles
```
