import { TooltipProvider } from '@radix-ui/react-tooltip'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PVDisplay } from './pv-display'

import type { Message } from '@/app/providers/types'

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <TooltipProvider>{children}</TooltipProvider>
)

const baseMessage = (overrides: Partial<Message<number>> = {}): Message<number> => ({
  type: 'pv',
  name: 'AI_X',
  value: 1.23,
  severity: 0,
  units: 'mbar',
  timestamp: 0,
  ok: true,
  error: null,
  ...overrides,
})

describe('PVDisplay', () => {
  it('renders disconnected fallback when not connected', () => {
    render(<PVDisplay isConnected={false} data={null} />)
    expect(screen.getByText('N/A')).toBeInTheDocument()
  })

  it('renders custom disconnectedComponent', () => {
    render(
      <PVDisplay
        isConnected={false}
        data={null}
        disconnectedComponent={<span>OFFLINE</span>}
      />,
    )
    expect(screen.getByText('OFFLINE')).toBeInTheDocument()
  })

  it('renders loading dots when connected but data is undefined', () => {
    const { container } = render(<PVDisplay isConnected={true} data={undefined} />)
    expect(container.querySelectorAll('span').length).toBe(3)
  })

  it('renders loading dots when connected but data is null (regression: copilot review)', () => {
    const { container } = render(<PVDisplay isConnected={true} data={null} />)
    expect(container.querySelectorAll('span').length).toBe(3)
  })

  it('renders custom loadingComponent', () => {
    render(
      <PVDisplay
        isConnected={true}
        data={undefined}
        loadingComponent={<span>WAIT</span>}
      />,
    )
    expect(screen.getByText('WAIT')).toBeInTheDocument()
  })

  it('renders value + units when ok', () => {
    render(<PVDisplay isConnected={true} data={baseMessage()} />)
    expect(screen.getByText('1.23')).toBeInTheDocument()
    expect(screen.getByText('mbar', { exact: false })).toBeInTheDocument()
  })

  it('formats value through formatValue', () => {
    render(
      <PVDisplay
        isConnected={true}
        data={baseMessage({ value: 4 })}
        formatValue={(v) => `Speed=${v}`}
      />,
    )
    expect(screen.getByText('Speed=4')).toBeInTheDocument()
  })

  it('renders N/A for null value', () => {
    render(<PVDisplay isConnected={true} data={baseMessage({ value: null })} />)
    expect(screen.getByText('N/A')).toBeInTheDocument()
  })

  it('renders error icon when ok=false', () => {
    render(
      <PVDisplay
        isConnected={true}
        data={baseMessage({ ok: false, error: 'PV unavailable' })}
      />,
      { wrapper },
    )
    expect(screen.getByText('N/A')).toBeInTheDocument()
  })

  it('calls onError when message is not ok', () => {
    const onError = vi.fn()
    render(
      <PVDisplay
        isConnected={true}
        data={baseMessage({ ok: false, error: 'fail' })}
        onError={onError}
      />,
      { wrapper },
    )
    expect(onError).toHaveBeenCalledWith('fail')
  })

  it('renders children instead of value when provided', () => {
    render(
      <PVDisplay isConnected={true} data={baseMessage()}>
        <span data-testid="custom">CUSTOM</span>
      </PVDisplay>,
    )
    expect(screen.getByTestId('custom')).toBeInTheDocument()
  })
})
