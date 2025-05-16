# ConnectorLine Component

A refactored compound component for displaying connector lines with valves, gates, and labels.

## Improvements

### 1. Consistent Naming Conventions

- Used PascalCase for component names (ConnectorLine, Valve, Line, etc.)
- Used camelCase for props and variables
- Used BEM methodology for CSS class names

### 2. Improved File Organization

- Created a logical folder structure:
  - `components/`: Individual UI components
  - `styles/`: CSS modules
- Separated components into their own files
- Organized CSS files by functionality

### 3. Optimized CSS with BEM Methodology

- Block: `connectorLine`, `valve`, `gate`
- Element: `connectorLine__label`, `valve__value`, etc.
- Modifier: (when needed) `valve--open`, `valve--closed`, etc.

### 4. Refined Compound Pattern Implementation

- Improved type definitions
- Enhanced documentation
- Made component composition more explicit and maintainable

## Usage Example

```tsx
<ConnectorLine>
  <ConnectorLine.Line>
    <ConnectorLine.LabelValue label="L3 BIS" />
    <ConnectorLine.Valve label="SGV501">
      <ConnectorLine.ValveStatus
        pvNames={['BI_SGV501_OPEN', 'BI_SGV501_CLOSE']}
      />
    </ConnectorLine.Valve>
    <ConnectorLine.LabelValue label="L3 CMP" />
  </ConnectorLine.Line>
</ConnectorLine>
```

## Component Structure

- **ConnectorLine**: Main container component
- **Line**: Horizontal line component for layout
- **Valve**: Valve component with label and status
- **ValveStatus**: Component for displaying valve state
- **ValveControlStatus**: Component for controlling valve state
- **LabelValue**: Simple label component
- **Gate**: Gate component with link functionality

## Folder Structure

```
connector-line/
├── index.ts                     # Main export file
├── ConnectorLine.tsx            # Main container component
├── README.md                    # Documentation
├── components/                  # Subcomponents
│   ├── Container.tsx            # Container component
│   ├── Line.tsx                 # Line component
│   ├── Valve.tsx                # Valve component with ValveStatus
│   ├── LabelValue.tsx           # Label component
│   ├── ValveControlStatus.tsx   # Valve control component
│   └── Gate.tsx                 # Gate component
└── styles/                      # CSS modules
    ├── connector-line.module.css # Main styles
    ├── valve.module.css         # Valve-specific styles
    ├── line.module.css          # Line-specific styles
    ├── label-value.module.css   # Label-specific styles
    └── gate.module.css          # Gate-specific styles
```
