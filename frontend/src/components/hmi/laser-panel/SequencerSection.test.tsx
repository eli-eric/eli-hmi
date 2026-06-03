import { describe, it, expect } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SequencerSection } from './SequencerSection'
import type { LabeledPv } from '@/app/(modules)/l4-opcpa/config/schema'
import {
  makeFakeWebSocketContext,
  TestWebSocketProvider,
} from '@/test/ws-test-provider'

function renderSequencer(props: {
  sequencerPv?: string
  sequences?: readonly LabeledPv[]
}) {
  const ws = makeFakeWebSocketContext()
  render(
    <TestWebSocketProvider value={ws.context}>
      <SequencerSection {...props} />
    </TestWebSocketProvider>,
  )
  return ws
}

describe('SequencerSection', () => {
  it('renders a compact Sequencer row showing the unknown placeholder when no PV is configured', () => {
    renderSequencer({})
    expect(screen.getByText('Sequencer')).toBeInTheDocument()
    // No sequencer PV → unknown placeholder, not IDLE/RUNNING.
    expect(screen.getByText('<>')).toBeInTheDocument()
    expect(screen.queryByText('IDLE')).not.toBeInTheDocument()
    expect(screen.queryByText('RUNNING')).not.toBeInTheDocument()
  })

  it('is not expandable when no per-sequence detail PVs are configured', () => {
    renderSequencer({ sequencerPv: 'SEQ_NL2_STATE' })
    expect(
      screen.queryByRole('button', { name: 'Toggle sequencer detail' }),
    ).not.toBeInTheDocument()
  })

  it('shows IDLE / RUNNING from the configured sequencer PV', async () => {
    const ws = renderSequencer({ sequencerPv: 'SEQ_NL2_STATE' })
    await waitFor(() =>
      expect(ws.subscriptions.get('SEQ_NL2_STATE')?.size).toBe(1),
    )

    act(() => ws.push('SEQ_NL2_STATE', 0))
    expect(screen.getByText('IDLE')).toBeInTheDocument()

    act(() => ws.push('SEQ_NL2_STATE', 1))
    expect(screen.getByText('RUNNING')).toBeInTheDocument()
  })

  it('expands into a per-sequence detail list when sequence PVs are configured', async () => {
    const ws = renderSequencer({
      sequencerPv: 'SEQ_NL2_STATE',
      sequences: [
        { label: 'START soft', pv: 'SEQ_NL2_START_SOFT' },
        { label: 'System OFF', pv: 'SEQ_NL2_SYSTEM_OFF' },
      ],
    })
    await waitFor(() =>
      expect(ws.subscriptions.get('SEQ_NL2_START_SOFT')?.size).toBe(1),
    )
    act(() => {
      ws.push('SEQ_NL2_START_SOFT', 1)
      ws.push('SEQ_NL2_SYSTEM_OFF', 0)
    })

    const user = userEvent.setup()
    expect(screen.queryByText('START soft')).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Toggle sequencer detail' }),
    )

    expect(screen.getByText('START soft')).toBeInTheDocument()
    expect(screen.getByText('System OFF')).toBeInTheDocument()
  })

  it('renders a sequence row as unknown (N/A), not IDLE, when ok but value is null', async () => {
    const ws = renderSequencer({
      sequencerPv: 'SEQ_NL2_STATE',
      sequences: [
        { label: 'START soft', pv: 'SEQ_NL2_START_SOFT' },
        { label: 'System OFF', pv: 'SEQ_NL2_SYSTEM_OFF' },
      ],
    })
    await waitFor(() =>
      expect(ws.subscriptions.get('SEQ_NL2_START_SOFT')?.size).toBe(1),
    )
    act(() => {
      // ok=true but no numeric value yet — must stay unknown, not fall to IDLE.
      ws.push('SEQ_NL2_START_SOFT', { ok: true, value: null })
      ws.push('SEQ_NL2_SYSTEM_OFF', 1)
    })

    const user = userEvent.setup()
    await user.click(
      screen.getByRole('button', { name: 'Toggle sequencer detail' }),
    )

    expect(screen.getByText('START soft')).toBeInTheDocument()
    expect(screen.getByText('N/A')).toBeInTheDocument()
    // A valid numeric sequence still resolves to RUNNING.
    expect(screen.getByText('RUNNING')).toBeInTheDocument()
    expect(screen.queryByText('IDLE')).not.toBeInTheDocument()
  })
})
