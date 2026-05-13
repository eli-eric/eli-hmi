import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FlashlampsSection } from './FlashlampsSection'
import {
  createMockWebSocket,
  MockWebSocketProvider,
} from '@/test/ws-mock'

const ORIGINAL_FETCH = globalThis.fetch

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'localhost:8080')
})

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  vi.unstubAllEnvs()
})

describe('FlashlampsSection', () => {
  it('renders SB / RUN / STOP / FAIL counts as a column-headed row', async () => {
    const ws = createMockWebSocket()
    render(
      <MockWebSocketProvider ws={ws}>
        <FlashlampsSection
          laser="NL2"
          boxIds={['22', '23']}
          delayPresets={[50, 500, 700, 790]}
        />
      </MockWebSocketProvider>,
    )

    await waitFor(() =>
      expect(ws.subscriptions.get('SI_NL2_FL_22_CH1')?.size).toBe(1),
    )

    act(() => {
      ws.push('SI_NL2_FL_22_CH1', 'RUN')
      ws.push('SI_NL2_FL_22_CH2', 'RUN')
      ws.push('SI_NL2_FL_23_CH1', 'SB')
      ws.push('SI_NL2_FL_23_CH2', 'FAIL')
    })

    expect(screen.getByText('Flashlamps State')).toBeInTheDocument()
    expect(screen.getByTestId('count-SB')).toHaveTextContent('1')
    expect(screen.getByTestId('count-RUN')).toHaveTextContent('2')
    expect(screen.getByTestId('count-STOP')).toHaveTextContent('0')
    expect(screen.getByTestId('count-FAIL')).toHaveTextContent('1')
  })

  it('exposes Set All Run / Set All Standby behind a cog toggle', async () => {
    const ws = createMockWebSocket()
    render(
      <MockWebSocketProvider ws={ws}>
        <FlashlampsSection
          laser="NL2"
          boxIds={['22']}
          delayPresets={[50, 500, 700, 790]}
        />
      </MockWebSocketProvider>,
    )
    await waitFor(() =>
      expect(ws.subscriptions.get('SI_NL2_FL_22_CH1')?.size).toBe(1),
    )

    const user = userEvent.setup()
    expect(
      screen.queryByRole('button', { name: 'Set All Run' }),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Flashlamps actions' }),
    )

    expect(
      screen.getByRole('button', { name: 'Set All Run' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Set All Standby' }),
    ).toBeInTheDocument()
  })

  it('exposes the trigger-delay preset input behind a cog', async () => {
    const ws = createMockWebSocket()
    render(
      <MockWebSocketProvider ws={ws}>
        <FlashlampsSection
          laser="NL2"
          boxIds={['22']}
          delayPresets={[50, 500, 700, 790]}
        />
      </MockWebSocketProvider>,
    )
    await waitFor(() =>
      expect(ws.subscriptions.get('AI_NL2_TRIG_DELAY_CH1')?.size).toBe(1),
    )

    act(() => {
      ws.push('AI_NL2_TRIG_DELAY_CH1', 790)
      ws.push('AI_NL2_TRIG_DELAY_CH2', 790)
    })
    expect(screen.getByText('Trigger Delay')).toBeInTheDocument()
    // "790" appears both as the readout value and as a preset chip.
    expect(screen.getAllByText('790').length).toBeGreaterThan(0)

    const user = userEvent.setup()
    expect(
      screen.queryByRole('button', { name: '50' }),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Set trigger delay' }),
    )

    expect(screen.getByRole('button', { name: '50' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '500' })).toBeInTheDocument()
  })

  it('expands to a per-channel state list when the Flashlamps State row is clicked', async () => {
    const ws = createMockWebSocket()
    render(
      <MockWebSocketProvider ws={ws}>
        <FlashlampsSection
          laser="NL2"
          boxIds={['22', '23']}
          delayPresets={[50, 500, 700, 790]}
        />
      </MockWebSocketProvider>,
    )
    await waitFor(() =>
      expect(ws.subscriptions.get('SI_NL2_FL_22_CH1')?.size).toBe(1),
    )

    act(() => {
      ws.push('SI_NL2_FL_22_CH1', 'RUN')
      ws.push('SI_NL2_FL_22_CH2', 'SB')
      ws.push('SI_NL2_FL_23_CH1', 'STOP')
      ws.push('SI_NL2_FL_23_CH2', 'FAIL')
    })

    // Collapsed initially.
    expect(screen.queryByText('22 Ch1')).not.toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(
      screen.getByRole('button', {
        name: 'Toggle Flashlamps channel detail',
      }),
    )

    // 4 channels visible in the detail list with their state.
    expect(screen.getByText('22 Ch1')).toBeInTheDocument()
    expect(screen.getByText('22 Ch2')).toBeInTheDocument()
    expect(screen.getByText('23 Ch1')).toBeInTheDocument()
    expect(screen.getByText('23 Ch2')).toBeInTheDocument()
  })

  it('shows a Trigger Delay mismatch error when Ch1 and Ch2 disagree', async () => {
    const ws = createMockWebSocket()
    render(
      <MockWebSocketProvider ws={ws}>
        <FlashlampsSection
          laser="NL2"
          boxIds={['22']}
          delayPresets={[50, 500, 700, 790]}
        />
      </MockWebSocketProvider>,
    )
    await waitFor(() =>
      expect(ws.subscriptions.get('AI_NL2_TRIG_DELAY_CH2')?.size).toBe(1),
    )

    act(() => {
      ws.push('AI_NL2_TRIG_DELAY_CH1', 790)
      ws.push('AI_NL2_TRIG_DELAY_CH2', 50)
    })

    expect(screen.getByText(/MISMATCH 790\/50/)).toBeInTheDocument()
  })
})
