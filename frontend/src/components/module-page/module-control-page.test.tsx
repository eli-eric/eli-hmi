import { TooltipProvider } from '@radix-ui/react-tooltip'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ModuleControlPage } from './module-control-page'
import type { ModuleConfig } from '@/lib/modules/types'
import {
  makeFakeWebSocketContext,
  TestWebSocketProvider,
} from '@/test/ws-test-provider'

function makeConfigFixture({
  heading,
  cdaVolumeTitles,
  pvPrefix = 'TEST',
}: {
  heading: string
  cdaVolumeTitles: string[]
  pvPrefix?: string
}): ModuleConfig {
  return {
    heading,
    interlocks: {
      title: `${heading} Interlocks`,
      checkClearPv: `${pvPrefix}:INTERLOCK:CLEAR`,
      items: [
        { pvname: `${pvPrefix}:INTERLOCK:ONE`, title: `${heading} Volume` },
        { pvname: `${pvPrefix}:INTERLOCK:TWO`, title: `${heading} Valve` },
      ],
    },
    safetyPermission: {
      title: `${heading} Machine Safety Permissions`,
      items: [
        {
          pvname: `${pvPrefix}:SAFETY:ROUGHING`,
          title: `${heading} Roughing`,
        },
        {
          pvname: `${pvPrefix}:SAFETY:HIGH_VACUUM`,
          title: `${heading} High Vacuum`,
        },
      ],
    },
    cleanDryAir: {
      title: `${heading} Clean Dry Air (CDA)`,
      volumes: cdaVolumeTitles.map((title, index) => ({
        title,
        pressure: {
          pvName: `${pvPrefix}:CDA:${index}:PRESSURE`,
          label: `PPS${index}`,
        },
        flow: {
          pvName: `${pvPrefix}:CDA:${index}:FLOW`,
          label: `PFS${index}`,
          options: { format: 'precision' },
        },
      })),
    },
    backing: {
      title: `${heading} Backing`,
      sensorBar: {
        title: `${heading} Backing Line`,
        label: 'Pressure',
        sensorPVs: [{ pvName: `${pvPrefix}:BACKING:PRESSURE`, label: 'APG1' }],
      },
      pump: {
        title: 'Backing Pump',
        rpmPV: `${pvPrefix}:BACKING:RPM`,
        valvePv: `${pvPrefix}:BACKING:VALVE`,
        valveLabel: 'GV1',
      },
    },
    roughing: {
      title: 'Roughing',
      sensorBar: {
        title: `${heading} Roughing Line`,
        label: 'Pressure',
        sensorPVs: [{ pvName: `${pvPrefix}:ROUGHING:PRESSURE`, label: 'APG2' }],
      },
      pump: {
        title: 'Roughing Pump',
        rpmPV: `${pvPrefix}:ROUGHING:RPM`,
        valvePv: `${pvPrefix}:ROUGHING:VALVE`,
        valveLabel: 'GV2',
      },
      locking: {
        label: 'Used And Locked By',
        pvName: `${pvPrefix}:ROUGHING:LOCKED`,
      },
    },
  }
}

const l3btConfig = makeConfigFixture({
  heading: 'L3BT',
  cdaVolumeTitles: ['L3BT CDA Valve Actuation', 'L3BT CDA Venting'],
})

const p3Config = makeConfigFixture({
  heading: 'P3',
  cdaVolumeTitles: ['P3 CDA Valve Actuation'],
})

const l4fbtConfig = makeConfigFixture({
  heading: 'L4fBT',
  cdaVolumeTitles: ['L4fBT CDA Valve Actuation', 'L4fBT CDA Venting'],
  pvPrefix: 'undefined',
})

function renderWith(config: ModuleConfig) {
  const fake = makeFakeWebSocketContext()
  return render(
    <TestWebSocketProvider value={fake.context}>
      <TooltipProvider>
        <ModuleControlPage config={config} bottomRow={null} />
      </TooltipProvider>
    </TestWebSocketProvider>,
  )
}

describe('ModuleControlPage', () => {
  it('renders the heading from config', () => {
    renderWith(l3btConfig)
    expect(screen.getByText('L3BT')).toBeInTheDocument()
  })

  it('renders the Interlocks panel title', () => {
    renderWith(l3btConfig)
    expect(screen.getByText('L3BT Interlocks')).toBeInTheDocument()
  })

  it('renders one row per Interlock item', () => {
    renderWith(l3btConfig)
    for (const item of l3btConfig.interlocks.items) {
      expect(screen.getByText(item.title)).toBeInTheDocument()
    }
  })

  it('renders Safety Permission rows', () => {
    renderWith(l3btConfig)
    for (const item of l3btConfig.safetyPermission.items) {
      expect(screen.getByText(item.title)).toBeInTheDocument()
    }
  })

  it('renders P3 (single-volume CDA shape)', () => {
    renderWith(p3Config)
    expect(screen.getByText('P3')).toBeInTheDocument()
    expect(screen.getByText('P3 Clean Dry Air (CDA)')).toBeInTheDocument()
    expect(screen.getByText('P3 CDA Valve Actuation')).toBeInTheDocument()
  })

  it('renders every volume from a multi-volume CDA shape', () => {
    renderWith(l3btConfig)
    expect(screen.getByText('L3BT CDA Valve Actuation')).toBeInTheDocument()
    expect(screen.getByText('L3BT CDA Venting')).toBeInTheDocument()
  })

  it('renders L4fBT (placeholder PVs allowed)', () => {
    renderWith(l4fbtConfig)
    expect(screen.getByText('L4fBT')).toBeInTheDocument()
    expect(screen.getByText('L4fBT Backing')).toBeInTheDocument()
  })

  it('renders the bottomRow slot verbatim', () => {
    const fake = makeFakeWebSocketContext()
    render(
      <TestWebSocketProvider value={fake.context}>
        <TooltipProvider>
          <ModuleControlPage
            config={l3btConfig}
            bottomRow={<div data-testid="custom-row">RIBBON</div>}
          />
        </TooltipProvider>
      </TestWebSocketProvider>,
    )
    const row = screen.getByTestId('custom-row')
    expect(row).toBeInTheDocument()
    expect(within(row).getByText('RIBBON')).toBeInTheDocument()
  })
})
