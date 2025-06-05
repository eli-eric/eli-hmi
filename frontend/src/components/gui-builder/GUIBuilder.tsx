'use client'

import React, { FC } from 'react'
import { VolumePanel } from '../ws-components/volume-panel'
import { ConnectorLine } from '../ws-components/connector-line'

// Type definitions for the builder configuration
export type SensorType = 
  | 'pressure' 
  | 'valve' 
  | 'pump-speed' 
  | 'value' 
  | 'value-unit'
  | 'sensor-value'

export type ValveType = 'standard' | 'gate'

export interface SensorConfig {
  type: SensorType
  pvname: string
  label?: string
}

export interface CardConfig {
  title?: string
  height?: string
  sensors: SensorConfig[]
}

export interface SectionConfig {
  label: string
  cards: CardConfig[]
}

export interface InterlocksConfig {
  items: {
    text: string  // Using text to match VolumePanel.InterlockConnected expected prop
    pvname: string
  }[]
}

export interface VolumePanelConfig {
  title: string
  width?: string
  sections: SectionConfig[]
  interlocks?: InterlocksConfig
}

export interface ValveConfig {
  label: string
  pvNames: [string, string] // Open, Close PVs
  controlPv?: string
}

export interface LabelValueConfig {
  label: string
  pvname?: string
}

export interface LineConfig {
  valves: ValveConfig[]
  labels: LabelValueConfig[]
  gates?: {
    label: string
    pvname: string
  }[]
}

export interface ConnectorConfig {
  lines: LineConfig[]
}

export interface GUIConfig {
  volumePanels: VolumePanelConfig[]
  connectors?: ConnectorConfig[]
}

export interface GUIBuilderProps {
  config: GUIConfig
}

/**
 * GUIBuilder - Component for building GUI based on configuration
 * 
 * Takes a strictly typed configuration object and builds a GUI using
 * the compound component patterns of VolumePanel and ConnectorLine.
 * 
 * @example
 * ```tsx
 * <GUIBuilder config={{
 *   volumePanels: [{
 *     title: "System Pressure",
 *     sections: [{
 *       label: "Main Chamber",
 *       cards: [{
 *         title: "Pressure",
 *         sensors: [{ 
 *           type: "pressure", 
 *           pvname: "AI_MBAR_APG512", 
 *           label: "APG512" 
 *         }]
 *       }]
 *     }]
 *   }],
 *   connectors: [{
 *     lines: [{
 *       valves: [{ label: "SGV501", pvNames: ["BI_SGV501_OPEN", "BI_SGV501_CLOSE"] }],
 *       labels: [{ label: "L3 BIS" }]
 *     }]
 *   }]
 * }} />
 * ```
 */
export const GUIBuilder: FC<GUIBuilderProps> = ({ config }) => {
  const renderSensor = (sensor: SensorConfig) => {
    switch (sensor.type) {
      case 'pressure':
        return (
          <VolumePanel.SensorPressureConnected 
            pvname={sensor.pvname} 
            label={sensor.label || ''} 
          />
        )
      case 'valve':
        return (
          <VolumePanel.ValveStatusConnected 
            pvname={sensor.pvname} 
            label={sensor.label || ''} 
          />
        )
      case 'pump-speed':
        return (
          <VolumePanel.PumpSpeedConnected 
            pvname={sensor.pvname} 
          />
        )
      case 'value':
        return (
          <VolumePanel.PureValueConnected 
            pvname={sensor.pvname} 
            label={sensor.label || ''} 
          />
        )
      case 'value-unit':
        return (
          <VolumePanel.ValueUnitConnected 
            pvname={sensor.pvname} 
            label={sensor.label || ''} 
          />
        )
      case 'sensor-value':
        return (
          <VolumePanel.SensorValueConnected 
            pvname={sensor.pvname} 
            label={sensor.label || ''} 
          />
        )
      default:
        return null
    }
  }

  const renderCard = (card: CardConfig) => {
    return (
      <VolumePanel.Card height={card.height}>
        {card.title && <VolumePanel.CardLabel>{card.title}</VolumePanel.CardLabel>}
        {card.sensors.map((sensor, index) => (
          <React.Fragment key={`sensor-${index}`}>
            {renderSensor(sensor)}
          </React.Fragment>
        ))}
      </VolumePanel.Card>
    )
  }

  const renderVolumePanel = (panel: VolumePanelConfig) => {
    return (
      <VolumePanel width={panel.width}>
        <VolumePanel.Title label={panel.title} />
        
        {panel.sections.map((section, sectionIndex) => (
          <VolumePanel.Container key={`section-${sectionIndex}`}>
            <VolumePanel.Label label={section.label} />
            {section.cards.map((card, cardIndex) => (
              <React.Fragment key={`card-${cardIndex}`}>
                {renderCard(card)}
              </React.Fragment>
            ))}
          </VolumePanel.Container>
        ))}

        {panel.interlocks && (
          <VolumePanel.Interlocks>
            {panel.interlocks.items.map((interlock, index) => (
              <VolumePanel.InterlockConnected 
                key={`interlock-${index}`}
                title={interlock.text}  // Use text property here
                pvname={interlock.pvname}
              />
            ))}
          </VolumePanel.Interlocks>
        )}
      </VolumePanel>
    )
  }

  const renderValve = (valve: ValveConfig) => {
    return (
      <ConnectorLine.Valve label={valve.label}>
        <ConnectorLine.ValveStatus openPV={valve.pvNames[0]} closePV={valve.pvNames[1]} />
        {valve.controlPv && (
          <ConnectorLine.ValveControlStatus 
            statusOpenPV={valve.pvNames[0]} 
            statusClosePV={valve.pvNames[1]}
            controlOpenPV={valve.controlPv || ''}
            controlClosePV={valve.controlPv ? `${valve.controlPv}_CLOSE` : ''}
          />
        )}
      </ConnectorLine.Valve>
    )
  }

  const renderLabel = (label: LabelValueConfig) => {
    // Only pass the label property since LabelValueProps doesn't accept pvname
    return (
      <ConnectorLine.LabelValue 
        label={label.label}
      />
    )
  }

  const renderGate = (gate: { label: string, pvname: string }) => {
    // Using ConnectorLine.Gate with minimum required props
    return (
      <ConnectorLine.Gate
        name={gate.label}
        label={gate.label}
        href="#"  // Default href
        pvname={gate.pvname}  // Pass pvname for the connected component
      />
    )
  }

  const renderLine = (line: LineConfig) => {
    return (
      <ConnectorLine.Line>
        {line.labels.map((label, index) => (
          <React.Fragment key={`label-${index}`}>
            {renderLabel(label)}
          </React.Fragment>
        ))}
        {line.valves.map((valve, index) => (
          <React.Fragment key={`valve-${index}`}>
            {renderValve(valve)}
          </React.Fragment>
        ))}
        {line.gates?.map((gate, index) => (
          <React.Fragment key={`gate-${index}`}>
            {renderGate(gate)}
          </React.Fragment>
        ))}
      </ConnectorLine.Line>
    )
  }

  const renderConnector = (connector: ConnectorConfig) => {
    return (
      <ConnectorLine>
        {connector.lines.map((line, index) => (
          <React.Fragment key={`line-${index}`}>
            {renderLine(line)}
          </React.Fragment>
        ))}
      </ConnectorLine>
    )
  }

  return (
    <>
      {config.volumePanels.map((panel, index) => (
        <React.Fragment key={`panel-${index}`}>
          {renderVolumePanel(panel)}
        </React.Fragment>
      ))}
      
      {config.connectors?.map((connector, index) => (
        <React.Fragment key={`connector-${index}`}>
          {renderConnector(connector)}
        </React.Fragment>
      ))}
    </>
  )
}
