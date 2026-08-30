import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FlashlampsSection } from './FlashlampsSection'
import { LASER_COMMANDS } from '@/app/(modules)/l4-opcpa/lib/pv-names'
import type { LabeledPv } from '@/app/(modules)/l4-opcpa/config/schema'
import {
  makeFakeWebSocketContext,
  TestWebSocketProvider,
} from '@/test/ws-test-provider'

const ORIGINAL_FETCH = globalThis.fetch

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  vi.unstubAllEnvs()
})

const TRIGGER_DELAY = ['AI_NL2_TRIG_DELAY_CH1', 'AI_NL2_TRIG_DELAY_CH2']

/** Build the flashlamp channel list (label + PV) for the given box ids. */
function flashlamps(boxes: string[]): LabeledPv[] {
  return boxes.flatMap((b) => [
    { label: `${b} Ch1`, pv: `SI_NL2_FL_${b}_CH1` },
    { label: `${b} Ch2`, pv: `SI_NL2_FL_${b}_CH2` },
  ])
}

function renderFl(boxes: string[]) {
  const ws = makeFakeWebSocketContext()
  render(
    <TestWebSocketProvider value={ws.context}>
      <FlashlampsSection
        laser="NL2"
        flashlamps={flashlamps(boxes)}
        triggerDelay={TRIGGER_DELAY}
        delayPresets={[50, 500, 700, 790]}
        commands={LASER_COMMANDS}
      />
    </TestWebSocketProvider>,
  )
  return ws
}

describe('FlashlampsSection', () => {
  it('renders SB / RUN / STOP / FAIL counts as a column-headed row', async () => {
    const ws = renderFl(['22', '23'])

    await waitFor(() =>
      expect(ws.subscriptions.get('SI_NL2_FL_22_CH1')?.size).toBe(1),
    )

    act(() => {
      ws.push('SI_NL2_FL_22_CH1', 'RUN')
      ws.push('SI_NL2_FL_22_CH2', 'RUN')
      ws.push('SI_NL2_FL_23_CH1', 'STANDBY')
      ws.push('SI_NL2_FL_23_CH2', 'FAILURE')
    })

    expect(screen.getByText('Flashlamps State')).toBeInTheDocument()
    expect(screen.getByTestId('count-SB')).toHaveTextContent('1')
    expect(screen.getByTestId('count-RUN')).toHaveTextContent('2')
    expect(screen.getByTestId('count-STOP')).toHaveTextContent('0')
    expect(screen.getByTestId('count-FAIL')).toHaveTextContent('1')
    // A non-zero FAIL count styles as a MAJOR-severity (error) tone, matching
    // an EPICS MAJOR alarm elsewhere in the panel.
    expect(screen.getByTestId('count-FAIL')).toHaveAttribute(
      'data-tone',
      'error',
    )
    // A zero count never gets a tone.
    expect(screen.getByTestId('count-STOP')).not.toHaveAttribute('data-tone')
  })

  it('exposes Set All Run / Set All Standby behind a cog toggle', async () => {
    const ws = renderFl(['22'])
    await waitFor(() =>
      expect(ws.subscriptions.get('SI_NL2_FL_22_CH1')?.size).toBe(1),
    )

    const user = userEvent.setup()
    expect(
      screen.queryByRole('button', { name: 'Set All to Run' }),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Flashlamps actions' }),
    )

    expect(
      screen.getByRole('button', { name: 'Set All to Run' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Set All to Standby' }),
    ).toBeInTheDocument()
  })

  it('exposes the trigger-delay preset input behind a cog', async () => {
    const ws = renderFl(['22'])
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
    const ws = renderFl(['22', '23'])
    await waitFor(() =>
      expect(ws.subscriptions.get('SI_NL2_FL_22_CH1')?.size).toBe(1),
    )

    act(() => {
      ws.push('SI_NL2_FL_22_CH1', 'RUN')
      ws.push('SI_NL2_FL_22_CH2', 'STANDBY')
      ws.push('SI_NL2_FL_23_CH1', 'STOP')
      ws.push('SI_NL2_FL_23_CH2', 'FAILURE')
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
    // Each row shows the raw incoming enum string, not an abbreviated code.
    // ("RUN"/"STOP" also appear as column headers, so allow >1 match.)
    expect(screen.getAllByText('RUN').length).toBeGreaterThan(0)
    expect(screen.getByText('STANDBY')).toBeInTheDocument()
    expect(screen.getAllByText('STOP').length).toBeGreaterThan(0)
    expect(screen.getByText('FAILURE')).toBeInTheDocument()
  })

  it('shows the raw enum value for a channel state with no dedicated column yet', async () => {
    const ws = renderFl(['22'])
    await waitFor(() =>
      expect(ws.subscriptions.get('SI_NL2_FL_22_CH1')?.size).toBe(1),
    )

    act(() => {
      ws.push('SI_NL2_FL_22_CH1', 'IGNITION')
      ws.push('SI_NL2_FL_22_CH2', 'BUSY')
    })

    // Not counted in any of the 4 existing columns.
    expect(screen.getByTestId('count-SB')).toHaveTextContent('0')
    expect(screen.getByTestId('count-RUN')).toHaveTextContent('0')
    expect(screen.getByTestId('count-STOP')).toHaveTextContent('0')
    expect(screen.getByTestId('count-FAIL')).toHaveTextContent('0')

    const user = userEvent.setup()
    await user.click(
      screen.getByRole('button', {
        name: 'Toggle Flashlamps channel detail',
      }),
    )

    // The raw value is still shown per-channel even without a bucket, and it
    // does NOT get the "unknown"/invalid-data styling — only actually
    // missing/invalid data should look like that.
    expect(screen.getByText('IGNITION')).toBeInTheDocument()
    expect(screen.getByText('IGNITION').closest('[data-state]')).toHaveAttribute(
      'data-state',
      'neutral',
    )
    expect(screen.getByText('BUSY')).toBeInTheDocument()
    expect(screen.getByText('BUSY').closest('[data-state]')).toHaveAttribute(
      'data-state',
      'neutral',
    )
  })

  it('only shows the invalid/unknown style when a channel has no data', async () => {
    const ws = renderFl(['22'])
    await waitFor(() =>
      expect(ws.subscriptions.get('SI_NL2_FL_22_CH1')?.size).toBe(1),
    )
    // SI_NL2_FL_22_CH1 never receives a message.

    const user = userEvent.setup()
    await user.click(
      screen.getByRole('button', {
        name: 'Toggle Flashlamps channel detail',
      }),
    )

    expect(screen.getByText('22 Ch1').closest('li')).toHaveTextContent('<>')
    expect(
      screen.getByText('22 Ch1').parentElement?.querySelector('[data-state]'),
    ).toHaveAttribute('data-state', 'unknown')
  })

  it('overrides a channel colour with EPICS severity, regardless of the enum value', async () => {
    const ws = renderFl(['22'])
    await waitFor(() =>
      expect(ws.subscriptions.get('SI_NL2_FL_22_CH1')?.size).toBe(1),
    )

    act(() => {
      // MINOR alarm despite a "RUN" value, which would normally be green.
      ws.push('SI_NL2_FL_22_CH1', { value: 'RUN', severity: 1 })
      // Disconnected despite a normal-looking "STOP" value.
      ws.push('SI_NL2_FL_22_CH2', { value: 'STOP', ok: false })
    })

    const user = userEvent.setup()
    await user.click(
      screen.getByRole('button', {
        name: 'Toggle Flashlamps channel detail',
      }),
    )

    const ch1 = screen.getByText('22 Ch1').closest('li')
    expect(ch1?.querySelector('[data-state]')).toHaveAttribute(
      'data-state',
      'warning',
    )
    expect(ch1).toHaveTextContent('WARN')
    expect(ch1).not.toHaveTextContent('RUN')

    const ch2 = screen.getByText('22 Ch2').closest('li')
    expect(ch2?.querySelector('[data-state]')).toHaveAttribute(
      'data-state',
      'invalid',
    )
    expect(ch2).toHaveTextContent('INVALID')
    expect(ch2).not.toHaveTextContent('STOP')
  })

  it('shows a Trigger Delay mismatch error when the readouts disagree', async () => {
    const ws = renderFl(['22'])
    await waitFor(() =>
      expect(ws.subscriptions.get('AI_NL2_TRIG_DELAY_CH2')?.size).toBe(1),
    )

    act(() => {
      ws.push('AI_NL2_TRIG_DELAY_CH1', 790)
      ws.push('AI_NL2_TRIG_DELAY_CH2', 50)
    })

    expect(screen.getByText(/MISMATCH 790\/50/)).toBeInTheDocument()
  })

  it('shows INVALID for Trigger Delay when any readout has invalid severity, ahead of a mismatch', async () => {
    const ws = renderFl(['22'])
    await waitFor(() =>
      expect(ws.subscriptions.get('AI_NL2_TRIG_DELAY_CH2')?.size).toBe(1),
    )

    act(() => {
      ws.push('AI_NL2_TRIG_DELAY_CH1', 790)
      // Disconnected — even though the value that arrived also disagrees
      // with CH1, INVALID takes priority over the mismatch display.
      ws.push('AI_NL2_TRIG_DELAY_CH2', { value: 50, ok: false })
    })

    expect(screen.getByText('INVALID')).toBeInTheDocument()
    expect(screen.queryByText(/MISMATCH/)).not.toBeInTheDocument()
  })

  it('shows INVALID for Trigger Delay on EPICS severity 3, even when the readouts agree', async () => {
    const ws = renderFl(['22'])
    await waitFor(() =>
      expect(ws.subscriptions.get('AI_NL2_TRIG_DELAY_CH2')?.size).toBe(1),
    )

    act(() => {
      ws.push('AI_NL2_TRIG_DELAY_CH1', { value: 790, severity: 3 })
      ws.push('AI_NL2_TRIG_DELAY_CH2', 790)
    })

    expect(screen.getByText('INVALID')).toBeInTheDocument()
    expect(screen.queryByText('790')).not.toBeInTheDocument()
  })

  it('hides the flashlamp action buttons when those commands are not exposed', async () => {
    const ws = makeFakeWebSocketContext()
    render(
      <TestWebSocketProvider value={ws.context}>
        <FlashlampsSection
          laser="NL2"
          flashlamps={flashlamps(['22'])}
          triggerDelay={TRIGGER_DELAY}
          delayPresets={[50]}
          commands={[]}
        />
      </TestWebSocketProvider>,
    )
    await waitFor(() =>
      expect(ws.subscriptions.get('SI_NL2_FL_22_CH1')?.size).toBe(1),
    )
    // No Flashlamps-actions cog and no Set-delay cog when commands are empty.
    expect(
      screen.queryByRole('button', { name: 'Flashlamps actions' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Set trigger delay' }),
    ).not.toBeInTheDocument()
    // The state row still renders.
    expect(screen.getByText('Flashlamps State')).toBeInTheDocument()
  })
})
