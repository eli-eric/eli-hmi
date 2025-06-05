/**
 * GUI Builder Component
 * 
 * A component for building GUI based on a strongly-typed configuration object.
 * Uses the compound component pattern of VolumePanel and ConnectorLine underneath.
 * 
 * @module GUIBuilder
 */

export { 
  GUIBuilder, 
  type GUIBuilderProps, 
  type GUIConfig, 
  type VolumePanelConfig,
  type SectionConfig,
  type CardConfig, 
  type SensorConfig,
  type ConnectorConfig,
  type LineConfig,
  type ValveConfig,
  type LabelValueConfig
} from './GUIBuilder'

export {
  GUIConfigBuilder,
  VolumePanelBuilder,
  SectionBuilder,
  CardBuilder,
  ConnectorBuilder,
  LineBuilder,
  ValveBuilder
} from './ConfigBuilder'
