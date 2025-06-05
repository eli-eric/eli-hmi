'use client'

import React, { useState } from 'react'
import { GUIBuilder, type GUIConfig } from '@/components/gui-builder'

// Define a more complex GUI configuration
const complexSystemConfig: GUIConfig = {
  volumePanels: [
    {
      title: 'System Overview',
      width: '15rem',
      sections: [
        {
          label: 'Main Chamber',
          cards: [
            {
              title: 'Pressure',
              height: '15rem',
              sensors: [
                {
                  type: 'pressure',
                  pvname: 'AI_MBAR_MAIN',
                  label: 'Main Gauge',
                },
                {
                  type: 'pressure',
                  pvname: 'AI_MBAR_SECONDARY',
                  label: 'Secondary Gauge',
                },
              ],
            },
            {
              title: 'Temperature',
              sensors: [
                {
                  type: 'value-unit',
                  pvname: 'AI_TEMP_MAIN',
                  label: 'Temperature',
                },
              ],
            },
          ],
        },
        {
          label: 'Vacuum Controls',
          cards: [
            {
              title: 'Pumps',
              sensors: [
                {
                  type: 'pump-speed',
                  pvname: 'AI_SPEED_P01',
                },
                {
                  type: 'pump-speed',
                  pvname: 'AI_SPEED_P02',
                },
              ],
            },
          ],
        },
      ],
      interlocks: {
        items: [
          {
            text: 'Emergency Stop',
            pvname: 'BI_ESTOP',
          },
          {
            text: 'Door Interlock',
            pvname: 'BI_DOOR',
          },
        ],
      },
    },
    {
      title: 'Secondary Systems',
      width: '12rem',
      sections: [
        {
          label: 'Water Cooling',
          cards: [
            {
              title: 'Flow Rate',
              sensors: [
                {
                  type: 'value-unit',
                  pvname: 'AI_FLOW_WATER',
                  label: 'Flow',
                },
              ],
            },
            {
              title: 'Temperature',
              sensors: [
                {
                  type: 'value-unit',
                  pvname: 'AI_TEMP_WATER_IN',
                  label: 'Inlet Temp',
                },
                {
                  type: 'value-unit',
                  pvname: 'AI_TEMP_WATER_OUT',
                  label: 'Outlet Temp',
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  connectors: [
    {
      lines: [
        {
          labels: [
            { label: 'From Chamber' },
            { label: 'Pressure', pvname: 'AI_MBAR_LINE1' },
          ],
          valves: [
            {
              label: 'V101',
              pvNames: ['BI_V101_OPEN', 'BI_V101_CLOSE'],
              controlPv: 'BO_V101_CONTROL',
            },
            {
              label: 'V102',
              pvNames: ['BI_V102_OPEN', 'BI_V102_CLOSE'],
              controlPv: 'BO_V102_CONTROL',
            },
          ],
        },
        {
          labels: [{ label: 'To Pumping Station' }],
          valves: [
            {
              label: 'V201',
              pvNames: ['BI_V201_OPEN', 'BI_V201_CLOSE'],
            },
          ],
          gates: [
            {
              label: 'Gate A',
              pvname: 'BI_GATE_A_STATUS',
            },
          ],
        },
      ],
    },
  ],
}

/**
 * ComplexExample - A more complex example of using the GUIBuilder
 * Includes state to potentially modify the configuration at runtime
 */
export const ComplexExample = () => {
  const [config, setConfig] = useState<GUIConfig>(complexSystemConfig)

  // This function is used to modify the config dynamically
  // We're not using it directly yet, but it demonstrates the capability
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const updateConfig = () => {
    setConfig((prevConfig) => {
      const newConfig = { ...prevConfig }
      // Add a new sensor to the first card of the first section of the first panel
      if (newConfig.volumePanels[0]?.sections[0]?.cards[0]?.sensors) {
        newConfig.volumePanels[0].sections[0].cards[0].sensors.push({
          type: 'sensor-value',
          pvname: 'AI_NEW_SENSOR',
          label: 'New Sensor',
        })
      }
      return newConfig
    })
  }

  return <GUIBuilder config={config} />
}
