import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SequencerSection, L4_OPCPA_SEQUENCES } from './SequencerSection'
import {
  makeFakeWebSocketContext,
  TestWebSocketProvider,
} from '@/test/ws-test-provider'

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'localhost:8080')
})
afterEach(() => {
  vi.unstubAllEnvs()
})

// Build the same labeled descriptors the instance builds for NL2.
const SEQUENCES = L4_OPCPA_SEQUENCES.map((s) => ({
  label: s.label,
  statePv: `BI_NL2_SEQ_${s.id}`,
}))

function renderSequencer() {
  const ws = makeFakeWebSocketContext()
  render(
    <TestWebSocketProvider value={ws.context}>
      <SequencerSection
        sequencerRunningPv="BI_NL2_SEQUENCER_RUNNING"
        sequences={SEQUENCES}
      />
    </TestWebSocketProvider>,
  )
  return ws
}

describe('SequencerSection', () => {
  it('shows IDLE / RUNNING from the running PV', async () => {
    const ws = renderSequencer()
    await waitFor(() =>
      expect(ws.subscriptions.get('BI_NL2_SEQUENCER_RUNNING')?.size).toBe(1),
    )

    expect(screen.getByText('Sequencer')).toBeInTheDocument()

    act(() => ws.push('BI_NL2_SEQUENCER_RUNNING', 0))
    expect(screen.getByText('IDLE')).toBeInTheDocument()

    act(() => ws.push('BI_NL2_SEQUENCER_RUNNING', 1))
    expect(screen.getByText('RUNNING')).toBeInTheDocument()
  })

  it('subscribes to a per-sequence state PV for every sequence', async () => {
    const ws = renderSequencer()
    await waitFor(() =>
      expect(ws.subscriptions.get('BI_NL2_SEQ_START_LASER')?.size).toBe(1),
    )
    expect(ws.subscriptions.get('BI_NL2_SEQ_FLASHLAMPS_RUN')?.size).toBe(1)
  })

  it('expands to list each sequence with its individual IDLE/RUNNING state', async () => {
    const ws = renderSequencer()
    await waitFor(() =>
      expect(ws.subscriptions.get('BI_NL2_SEQUENCER_RUNNING')?.size).toBe(1),
    )
    const user = userEvent.setup()

    // Per-sequence states: Start Laser RUNNING, the rest IDLE.
    act(() => {
      ws.push('BI_NL2_SEQ_START_LASER', 1)
      ws.push('BI_NL2_SEQ_STOP_LASER', 0)
    })

    expect(screen.queryByText('Start Laser')).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Toggle Sequencer detail' }),
    )

    // Each sequence row shows its label and a state badge.
    const startRow = screen.getByText('Start Laser').closest('li')!
    expect(within(startRow).getByText('RUNNING')).toBeInTheDocument()

    const stopRow = screen.getByText('Stop Laser').closest('li')!
    expect(within(stopRow).getByText('IDLE')).toBeInTheDocument()

    // Click outside collapses it.
    await user.click(document.body)
    expect(screen.queryByText('Start Laser')).not.toBeInTheDocument()
  })
})
