import {
  type GUIConfig,
  type SensorConfig,
  type CardConfig,
  type SectionConfig,
  type VolumePanelConfig,
  type LineConfig,
  type ValveConfig,
  type LabelValueConfig,
  type ConnectorConfig,
} from './GUIBuilder'

/**
 * Helper class for building GUI configurations in a typesafe way
 */
export class GUIConfigBuilder {
  private config: GUIConfig = { volumePanels: [] }

  /**
   * Create a new GUI config builder
   * @returns A new builder instance
   */
  static create(): GUIConfigBuilder {
    return new GUIConfigBuilder()
  }

  /**
   * Add a volume panel to the configuration
   * @param panel The volume panel to add, or a callback to build it
   * @returns The builder instance for chaining
   */
  addVolumePanel(
    panel: VolumePanelConfig | ((builder: VolumePanelBuilder) => void),
  ): GUIConfigBuilder {
    if (typeof panel === 'function') {
      const builder = new VolumePanelBuilder()
      panel(builder)
      this.config.volumePanels.push(builder.build())
    } else {
      this.config.volumePanels.push(panel)
    }
    return this
  }

  /**
   * Add a connector to the configuration
   * @param connector The connector to add, or a callback to build it
   * @returns The builder instance for chaining
   */
  addConnector(
    connector: ConnectorConfig | ((builder: ConnectorBuilder) => void),
  ): GUIConfigBuilder {
    if (!this.config.connectors) {
      this.config.connectors = []
    }

    if (typeof connector === 'function') {
      const builder = new ConnectorBuilder()
      connector(builder)
      this.config.connectors.push(builder.build())
    } else {
      this.config.connectors.push(connector)
    }
    return this
  }

  /**
   * Build the final configuration
   * @returns The complete GUI configuration
   */
  build(): GUIConfig {
    return this.config
  }
}

/**
 * Builder for volume panels
 */
export class VolumePanelBuilder {
  private panel: VolumePanelConfig = {
    title: '',
    sections: [],
  }

  /**
   * Set the title of the panel
   * @param title The title to set
   * @returns The builder instance for chaining
   */
  title(title: string): VolumePanelBuilder {
    this.panel.title = title
    return this
  }

  /**
   * Set the width of the panel
   * @param width The width to set
   * @returns The builder instance for chaining
   */
  width(width: string): VolumePanelBuilder {
    this.panel.width = width
    return this
  }

  /**
   * Add a section to the panel
   * @param section The section to add, or a callback to build it
   * @returns The builder instance for chaining
   */
  addSection(
    section: SectionConfig | ((builder: SectionBuilder) => void),
  ): VolumePanelBuilder {
    if (typeof section === 'function') {
      const builder = new SectionBuilder()
      section(builder)
      this.panel.sections.push(builder.build())
    } else {
      this.panel.sections.push(section)
    }
    return this
  }

  /**
   * Add interlocks to the panel
   * @param items Array of interlock items with text and pvname
   * @returns The builder instance for chaining
   */
  addInterlocks(items: { text: string; pvname: string }[]): VolumePanelBuilder {
    this.panel.interlocks = { items }
    return this
  }

  /**
   * Build the volume panel configuration
   * @returns The complete volume panel configuration
   */
  build(): VolumePanelConfig {
    return this.panel
  }
}

/**
 * Builder for sections
 */
export class SectionBuilder {
  private section: SectionConfig = {
    label: '',
    cards: [],
  }

  /**
   * Set the label of the section
   * @param label The label to set
   * @returns The builder instance for chaining
   */
  label(label: string): SectionBuilder {
    this.section.label = label
    return this
  }

  /**
   * Add a card to the section
   * @param card The card to add, or a callback to build it
   * @returns The builder instance for chaining
   */
  addCard(card: CardConfig | ((builder: CardBuilder) => void)): SectionBuilder {
    if (typeof card === 'function') {
      const builder = new CardBuilder()
      card(builder)
      this.section.cards.push(builder.build())
    } else {
      this.section.cards.push(card)
    }
    return this
  }

  /**
   * Build the section configuration
   * @returns The complete section configuration
   */
  build(): SectionConfig {
    return this.section
  }
}

/**
 * Builder for cards
 */
export class CardBuilder {
  private card: CardConfig = {
    sensors: [],
  }

  /**
   * Set the title of the card
   * @param title The title to set
   * @returns The builder instance for chaining
   */
  title(title: string): CardBuilder {
    this.card.title = title
    return this
  }

  /**
   * Set the height of the card
   * @param height The height to set
   * @returns The builder instance for chaining
   */
  height(height: string): CardBuilder {
    this.card.height = height
    return this
  }

  /**
   * Add a sensor to the card
   * @param sensor The sensor configuration
   * @returns The builder instance for chaining
   */
  addSensor(sensor: SensorConfig): CardBuilder {
    this.card.sensors.push(sensor)
    return this
  }

  /**
   * Add multiple sensors to the card
   * @param sensors The sensor configurations
   * @returns The builder instance for chaining
   */
  addSensors(sensors: SensorConfig[]): CardBuilder {
    this.card.sensors.push(...sensors)
    return this
  }

  /**
   * Add a pressure sensor
   * @param pvname The PV name
   * @param label Optional label
   * @returns The builder instance for chaining
   */
  addPressureSensor(pvname: string, label?: string): CardBuilder {
    this.card.sensors.push({
      type: 'pressure',
      pvname,
      label,
    })
    return this
  }

  /**
   * Add a valve status sensor
   * @param pvname The PV name
   * @param label Optional label
   * @returns The builder instance for chaining
   */
  addValveStatus(pvname: string, label?: string): CardBuilder {
    this.card.sensors.push({
      type: 'valve',
      pvname,
      label,
    })
    return this
  }

  /**
   * Add a pump speed sensor
   * @param pvname The PV name
   * @returns The builder instance for chaining
   */
  addPumpSpeed(pvname: string): CardBuilder {
    this.card.sensors.push({
      type: 'pump-speed',
      pvname,
    })
    return this
  }

  /**
   * Build the card configuration
   * @returns The complete card configuration
   */
  build(): CardConfig {
    return this.card
  }
}

/**
 * Builder for connectors
 */
export class ConnectorBuilder {
  private connector: ConnectorConfig = {
    lines: [],
  }

  /**
   * Add a line to the connector
   * @param line The line to add, or a callback to build it
   * @returns The builder instance for chaining
   */
  addLine(
    line: LineConfig | ((builder: LineBuilder) => void),
  ): ConnectorBuilder {
    if (typeof line === 'function') {
      const builder = new LineBuilder()
      line(builder)
      this.connector.lines.push(builder.build())
    } else {
      this.connector.lines.push(line)
    }
    return this
  }

  /**
   * Build the connector configuration
   * @returns The complete connector configuration
   */
  build(): ConnectorConfig {
    return this.connector
  }
}

/**
 * Builder for lines
 */
export class LineBuilder {
  private line: LineConfig = {
    valves: [],
    labels: [],
  }

  /**
   * Add a label to the line
   * @param label The label text or label configuration
   * @returns The builder instance for chaining
   */
  addLabel(label: string | LabelValueConfig): LineBuilder {
    if (typeof label === 'string') {
      this.line.labels.push({ label })
    } else {
      this.line.labels.push(label)
    }
    return this
  }

  /**
   * Add a valve to the line
   * @param valve The valve configuration or a callback to build it
   * @returns The builder instance for chaining
   */
  addValve(
    valve: ValveConfig | ((builder: ValveBuilder) => void),
  ): LineBuilder {
    if (typeof valve === 'function') {
      const builder = new ValveBuilder()
      valve(builder)
      this.line.valves.push(builder.build())
    } else {
      this.line.valves.push(valve)
    }
    return this
  }

  /**
   * Add a gate to the line
   * @param label The gate label
   * @param pvname The PV name for the gate status
   * @returns The builder instance for chaining
   */
  addGate(label: string, pvname: string): LineBuilder {
    if (!this.line.gates) {
      this.line.gates = []
    }
    this.line.gates.push({ label, pvname })
    return this
  }

  /**
   * Build the line configuration
   * @returns The complete line configuration
   */
  build(): LineConfig {
    return this.line
  }
}

/**
 * Builder for valves
 */
export class ValveBuilder {
  private valve: ValveConfig = {
    label: '',
    pvNames: ['', ''],
  }

  /**
   * Set the label of the valve
   * @param label The label to set
   * @returns The builder instance for chaining
   */
  label(label: string): ValveBuilder {
    this.valve.label = label
    return this
  }

  /**
   * Set the PV names for the valve status (open and close)
   * @param openPv The PV name for open status
   * @param closePv The PV name for close status
   * @returns The builder instance for chaining
   */
  statusPvs(openPv: string, closePv: string): ValveBuilder {
    this.valve.pvNames = [openPv, closePv]
    return this
  }

  /**
   * Set the control PV for the valve
   * @param pvname The control PV name
   * @returns The builder instance for chaining
   */
  controlPv(pvname: string): ValveBuilder {
    this.valve.controlPv = pvname
    return this
  }

  /**
   * Build the valve configuration
   * @returns The complete valve configuration
   */
  build(): ValveConfig {
    return this.valve
  }
}
