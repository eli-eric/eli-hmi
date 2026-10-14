import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, act, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SequencerSection } from './SequencerSection'
import {
  makeFakeWebSocketContext,
  TestWebSocketProvider,
} from '@/test/ws-test-provider'

afterEach(() => {
  vi.unstubAllEnvs()
})

// What a laser's `sequences:` resolve to: a name and the PV carrying its state.
const SEQUENCES = [
  { label: 'Start Laser', statePv: 'NL2:SEQ:StartLaser' },
  { label: 'Stop Laser', statePv: 'NL2:SEQ:StopLaser' },
  { label: 'Set All Flashlamps to Run', statePv: 'NL2:SEQ:FlashlampsRun' },
]

function renderSequencer() {
  const ws = makeFakeWebSocketContext()
  render(
    <TestWebSocketProvider value={ws.context}>
      <SequencerSection sequences={SEQUENCES} />
    </TestWebSocketProvider>,
  )
  return ws
}

describe('SequencerSection', () => {
  it('reads RUNNING while any sequence does, and IDLE when none does', async () => {
    // Derived from the list rather than from a flag of its own: a second PV
    // repeating what the rows below already say is a second thing that can be
    // wrong, and it would show as a pill contradicting its own list.
    const ws = renderSequencer()
    await waitFor(() =>
      expect(ws.subscriptions.get('NL2:SEQ:StartLaser')?.size).toBe(1),
    )

    expect(screen.getByText('Sequencer')).toBeInTheDocument()

    act(() => {
      ws.push('NL2:SEQ:StartLaser', 0)
      ws.push('NL2:SEQ:StopLaser', 0)
      ws.push('NL2:SEQ:FlashlampsRun', 0)
    })
    expect(screen.getByText('IDLE')).toBeInTheDocument()

    act(() => ws.push('NL2:SEQ:FlashlampsRun', 1))
    expect(screen.getByText('RUNNING')).toBeInTheDocument()
  })

  it('subscribes to a state PV for every sequence', async () => {
    const ws = renderSequencer()
    await waitFor(() =>
      expect(ws.subscriptions.get('NL2:SEQ:StartLaser')?.size).toBe(1),
    )
    expect(ws.subscriptions.get('NL2:SEQ:FlashlampsRun')?.size).toBe(1)
  })

  it('expands to list each sequence with its individual IDLE/RUNNING state', async () => {
    const ws = renderSequencer()
    await waitFor(() =>
      expect(ws.subscriptions.get('NL2:SEQ:StartLaser')?.size).toBe(1),
    )
    const user = userEvent.setup()

    // Per-sequence states: Start Laser RUNNING, the rest IDLE.
    act(() => {
      ws.push('NL2:SEQ:StartLaser', 1)
      ws.push('NL2:SEQ:StopLaser', 0)
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

    // Clicking elsewhere leaves it open: an expanded list is dismissed only
    // by the operator clicking its own trigger again. Nothing in the app —
    // the palette selector in the header above all — may close it as a side
    // effect of being used while the list is being read.
    await user.click(document.body)
    expect(screen.getByText('Start Laser')).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Toggle Sequencer detail' }),
    )
    expect(screen.queryByText('Start Laser')).not.toBeInTheDocument()
  })
})
