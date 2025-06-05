# GUI Builder Component

A strongly-typed builder for creating control system GUIs based on the compound component pattern.

## Features

- **Declarative Configuration**: Create complex UI layouts using a simple configuration object
- **TypeScript Support**: Fully typed interface for configuration and components
- **Builder Pattern**: Use builder pattern for creating configurations in a fluent, chainable way
- **Component Reuse**: Leverages existing compound components (VolumePanel, ConnectorLine)

## Usage Examples

### Basic Usage - Object Literal Configuration

```tsx
import { GUIBuilder, type GUIConfig } from '@/components/gui-builder'

const config: GUIConfig = {
  volumePanels: [
    {
      title: 'System Pressure',
      sections: [
        {
          label: 'Main Chamber',
          cards: [
            {
              title: 'Pressure',
              sensors: [
                { 
                  type: 'pressure', 
                  pvname: 'AI_MBAR_APG512', 
                  label: 'APG512' 
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}

// Then in your component:
<GUIBuilder config={config} />
```

### Using Builder Pattern

```tsx
import { 
  GUIBuilder, 
  GUIConfigBuilder 
} from '@/components/gui-builder'

const config = GUIConfigBuilder.create()
  .addVolumePanel(panel => {
    panel.title('System Pressure')
      .width('12rem')
      .addSection(section => {
        section.label('Main Chamber')
          .addCard(card => {
            card.title('Pressure')
              .addPressureSensor('AI_MBAR_APG512', 'APG512')
          })
      })
  })
  .addConnector(connector => {
    connector.addLine(line => {
      line.addLabel('To Chamber')
        .addValve(valve => {
          valve.label('V101')
            .statusPvs('BI_V101_OPEN', 'BI_V101_CLOSE')
        })
    })
  })
  .build()

// Then in your component:
<GUIBuilder config={config} />
```

## Available Components

### VolumePanel Components

- Titles and Labels
- Cards with sensors
- Pressure sensors
- Valve status indicators
- Pump speed indicators
- Value/unit displays
- Interlocks

### ConnectorLine Components

- Connection lines
- Valves with status
- Gates
- Label/value displays

## Configuration Types

The builder uses a set of strictly typed configuration objects:

- `GUIConfig`: Top-level configuration
  - `volumePanels`: Array of panel configurations
  - `connectors`: Optional array of connector configurations

- `VolumePanelConfig`: Configuration for a volume panel
  - `title`: Panel title
  - `width`: Optional width
  - `sections`: Array of section configurations
  - `interlocks`: Optional interlock configuration

- `SectionConfig`: Configuration for a section within a panel
  - `label`: Section label
  - `cards`: Array of card configurations

- `CardConfig`: Configuration for a card within a section
  - `title`: Optional card title
  - `height`: Optional height
  - `sensors`: Array of sensor configurations

- `SensorConfig`: Configuration for a sensor
  - `type`: Sensor type ('pressure', 'valve', 'pump-speed', etc.)
  - `pvname`: Process variable name
  - `label`: Optional label

- `ConnectorConfig`: Configuration for connectors
  - `lines`: Array of line configurations

- `LineConfig`: Configuration for a line
  - `valves`: Array of valve configurations
  - `labels`: Array of label configurations
  - `gates`: Optional array of gate configurations

## Builder Classes

The module provides builder classes for all configuration types:

- `GUIConfigBuilder`: Top-level builder
- `VolumePanelBuilder`: Builder for volume panels
- `SectionBuilder`: Builder for sections
- `CardBuilder`: Builder for cards
- `ConnectorBuilder`: Builder for connectors
- `LineBuilder`: Builder for lines
- `ValveBuilder`: Builder for valves
