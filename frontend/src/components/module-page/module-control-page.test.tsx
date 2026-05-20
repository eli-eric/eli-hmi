import { TooltipProvider } from '@radix-ui/react-tooltip'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ModuleControlPage } from './module-control-page'
import { l3btConfig } from '@/lib/modules/l3bt.config'
import { p3Config } from '@/lib/modules/p3.config'
import { l4fbtConfig } from '@/lib/modules/l4fbt.config'
import {
  makeFakeWebSocketContext,
  TestWebSocketProvider,
} from '@/test/ws-test-provider'

function renderWith(config: typeof l3btConfig) {
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
