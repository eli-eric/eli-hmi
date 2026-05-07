# VolumePanel Component

A refactored compound component for displaying volume panels with sensors, controls, and status information.

## Recent Refactoring (June 2025)

### 1. Consolidated CSS

- Created a single common styles file (`common.module.css`) that replaces multiple redundant CSS files
- Organized styles by category (typography, layouts, containers, etc.)
- Used semantic class names that follow a consistent naming pattern
- Removed 9 separate CSS files with duplicate styles

### 2. Improved Component Structure

- Maintained the compound component pattern
- Eliminated duplicate code while preserving functionality
- Standardized component props and interfaces
- Ensured backward compatibility with existing implementations

### 3. Enhanced Maintainability

- Centralized styling rules for easier updates
- Improved code organization with a dedicated styles folder
- Standardized typography and layout components
- Removed unused styles and redundant components

## Usage Example

```tsx
<VolumePanel title="Vacuum System" width="20rem" checkClearPv="CLEAR_PV">
  <VolumePanel.Container>
    <VolumePanel.SensorBar
      title="Pressure Readings"
      label="Sensors"
      sensorPVs={[
        { pvName: 'PRESSURE_1', label: 'Chamber 1' },
        { pvName: 'PRESSURE_2', label: 'Chamber 2' },
      ]}
    />
  </VolumePanel.Container>

  <VolumePanel.Interlocks
    interlocks={[
      { pvName: 'DOOR_INTERLOCK', title: 'Door Interlock' },
      { pvName: 'PRESSURE_INTERLOCK', title: 'Pressure Interlock' },
    ]}
  />

  <VolumePanel.WarningErrorControl
    warningPv="WARNING_PV"
    errorPv="ERROR_PV"
    checkClearPv="CLEAR_CHECK_PV"
  />

  <VolumePanel.TurbopumpBasic
    title="Turbopump"
    rpmPV="TURBO_RPM"
    valvePv="TURBO_VALVE"
    valveLabel="Valve Status"
  />
</VolumePanel>
```

## Component Structure

### Main Components

- **VolumePanel**: Main container component that uses compound component pattern
- **Container**: Flexible container for internal layout organization
- **MultiVolumes**: Container for organizing multiple volume panels side by side
- **WarningErrorControl**: Displays warning and error status with clear button

### External Components

- **SensorBar**: Displays multiple sensor readings with optional state control
- **Pump**: Shows pump status, RPM, and valve controls
- **TurbopumpBasic**: Displays turbopump data including RPM and valve status
- **Interlocks**: Displays system interlocks with status icons
- **Locking**: Controls for locking/unlocking system components
- **Config**: Configuration options for the volume panel
- **Doors**: Status and controls for chamber doors
- **MasterKey**: Master control for system access and permissions

### Internal Components

- **VolumeContainer**: Main container with title and clear button
- **VolumeCard**: Card component for content sections
- **VolumeTitle**: Title component for sections
- **SensorValue**: Component for displaying sensor readings
- **DropDownStateControl**: Dropdown for controlling states with target indication
- **CardTitle**: Reusable title component for cards

## External Components Documentation

### SensorBar

Displays multiple sensor readings with optional state control dropdown.

```tsx
<VolumePanel.SensorBar
  title="Pressure Readings" // Optional section title
  label="Sensor Values" // Label for the sensor group
  height="12rem" // Optional height constraint
  sensorPVs={[
    // Array of sensor PVs to display
    {
      pvName: 'SENSOR_1', // PV name for the sensor
      label: 'Chamber 1', // Display label
      options: { format: 'pressure' }, // Optional formatting options
    },
  ]}
  stateControl={{
    // Optional state control dropdown
    pvCurrentState: 'CURRENT_STATE', // PV for current state
    pvTargetState: 'TARGET_STATE', // PV for target state
    controlPvs: [
      // Control options in dropdown
      { pvName: 'CONTROL_1', label: 'Open' },
      { pvName: 'CONTROL_2', label: 'Close' },
    ],
  }}
  pumpCyclePv="PUMP_CYCLES" // Optional PV for pump cycles
/>
```

### Pump

Displays pump status, RPM, and valve controls.

```tsx
<VolumePanel.Pump
  title="Roughing Pump" // Title for the pump section
  rpmPV="PUMP_RPM" // PV for pump RPM value
  valvePv="VALVE_STATUS" // PV for valve status (0/1)
  valveLabel="Isolation Valve" // Label for the valve
/>
```

### TurbopumpBasic

Shows turbopump data including RPM and basic status.

```tsx
<VolumePanel.TurbopumpBasic
  title="Turbopump" // Title for the turbopump section
  rpmPV="TURBO_RPM" // PV for turbopump RPM
  valvePv="TURBO_VALVE" // PV for valve status
  valveLabel="Backing Valve" // Label for the valve
/>
```

### Interlocks

Displays system interlocks with visual status indicators.

```tsx
<VolumePanel.Interlocks
  interlocks={[
    // Array of interlock PVs
    {
      pvName: 'DOOR_INTERLOCK', // PV name for the interlock
      title: 'Door Interlock', // Display label
    },
    {
      pvName: 'PRESSURE_INTERLOCK',
      title: 'Pressure Interlock',
    },
  ]}
/>
```

### Locking

Controls for locking/unlocking system components.

```tsx
<VolumePanel.Locking
  title="Access Control" // Title for the locking section
  lockPvs={[
    // Array of lock control PVs
    {
      pvName: 'LOCK_CONTROL', // PV name for the lock control
      label: 'Panel Lock', // Display label
    },
  ]}
/>
```

### Config

Configuration options for system parameters.

```tsx
<VolumePanel.Config
  title="System Configuration" // Title for the config section
  configPvs={[
    // Array of configuration PVs
    {
      pvName: 'CONFIG_PARAM', // PV name for the config parameter
      label: 'Max Pressure', // Display label
    },
  ]}
/>
```

### Doors

Status and controls for chamber doors.

```tsx
<VolumePanel.Doors
  title="Chamber Access" // Title for the doors section
  doorPvs={[
    // Array of door control PVs
    {
      statusPv: 'DOOR_STATUS', // PV for door status
      controlPv: 'DOOR_CONTROL', // PV for door control
      label: 'Main Door', // Display label
    },
  ]}
/>
```

### MasterKey

Master control for system access.

```tsx
<VolumePanel.MasterKey
  title="System Access" // Title for the master key section
  keyPv="MASTER_KEY" // PV for master key status
  unlockPv="UNLOCK_SYSTEM" // PV for unlock control
/>
```

## Folder Structure

```
volume-panel/
├── index.ts                     # Main export file
├── VolumePanel.tsx              # Main container component
├── README.md                    # Documentation
├── context/                     # Context providers
│   └── VolumePanelContext.tsx   # Context definition
├── components/                  # All components
│   ├── Container.tsx            # Container component
│   ├── MultiVolumePanel.tsx     # Multi-volume layout component
│   ├── WarningErrorControl.tsx  # Warning/error display component
│   ├── external/                # External components
│   │   ├── SensorBar.tsx        # Sensor bar component
│   │   ├── Pump.tsx             # Pump component
│   │   ├── TurboPumpBasic.tsx   # Turbopump component
│   │   ├── InterLocks.tsx       # Interlocks component
│   │   ├── Locking.tsx          # Locking component
│   │   ├── Config.tsx           # Config component
│   │   ├── Doors.tsx            # Doors component
│   │   └── MasterKey.tsx        # Master key component
│   └── internal/                # Internal helper components
│       ├── VolumeContainer.tsx  # Main container component
│       ├── VolumeCard.tsx       # Card component
│       ├── VolumeTitle.tsx      # Title component
│       ├── SensorValue.tsx      # Sensor value display
│       ├── card-title.tsx       # Card title component
│       └── DropDownStateControl.tsx # State control dropdown
└── styles/                      # CSS modules
    └── common.module.css        # Consolidated styles
```
