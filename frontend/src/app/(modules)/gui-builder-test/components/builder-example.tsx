'use client'

import React from 'react'
import { GUIBuilder, GUIConfigBuilder } from '@/components/gui-builder'

/**
 * Example demonstrating the use of the builder pattern for creating GUI configurations
 */
export const BuilderExample = () => {
  // Initial configuration created using the builder pattern
  const config = GUIConfigBuilder.create()
    .addVolumePanel({
      title: 'Main Control Panel',
      sections: [
        {
          label: 'System Status',
          cards: [
            {
              title: 'Temperature Control',
              sensors: [
                {
                  type: 'pressure',
                  pvname: 'AI_TEMP_MAIN',
                  label: 'Main Temperature',
                },
              ],
            },
          ],
        },
      ],
    })
    .addConnector({
      lines: [
        {
          gates: [{ label: 'Gate 1', pvname: 'GATE_1_PV' }],
          valves: [
            {
              label: 'Valve 1',
              pvNames: ['VALVE_1_OPEN', 'VALVE_1_CLOSE'],
            },
          ],
          labels: [],
        },
      ],
    })
    .build()

  // Example function to demonstrate dynamically updating the configuration

  return <GUIBuilder config={config} />
}
