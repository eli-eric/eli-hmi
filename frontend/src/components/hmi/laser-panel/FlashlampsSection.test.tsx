import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FlashlampsSection } from './FlashlampsSection'
import {
  LASER_COMMANDS,
  makeCommandPv,
} from '@/app/(modules)/l4-opcpa/lib/pv-names'
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
        cmdPv={makeCommandPv('NL2', {})}
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
    // Counts are never coloured by the count itself — not even FAIL. A failed
    // flashlamp is an alarm the IOC raises, and the shared severity table
    // paints it; colouring the tally too would be a second, independent
    // notion of "bad" living in the frontend.
    expect(screen.getByTestId('count-FAIL')).not.toHaveAttribute('data-tone')
    expect(screen.getByTestId('count-STOP')).not.toHaveAttribute('data-tone')
  })

  it('does not count a channel whose reading cannot be trusted', async () => {
    const ws = renderFl(['22', '23'])
    await waitFor(() =>
      expect(ws.subscriptions.get('SI_NL2_FL_22_CH1')?.size).toBe(1),
    )

    act(() => {
      ws.push('SI_NL2_FL_22_CH1', 'RUN')
      // Both of these still carry a plausible "RUN", but neither reading can
      // be trusted — a dead channel must not report itself as running.
      ws.push('SI_NL2_FL_22_CH2', { value: 'RUN', ok: false })
      ws.push('SI_NL2_FL_23_CH1', { value: 'RUN', severity: 3 })
      // An alarmed channel is still a real reading, so it is counted.
      ws.push('SI_NL2_FL_23_CH2', { value: 'RUN', severity: 2 })
    })

    expect(screen.getByTestId('count-RUN')).toHaveTextContent('2')
    expect(screen.getByTestId('count-RUN').title).toContain(
      '2 of 4 channels have no usable reading',
    )
  })

  it('leaves the counts untitled when every channel is readable', async () => {
    const ws = renderFl(['22'])
    await waitFor(() =>
      expect(ws.subscriptions.get('SI_NL2_FL_22_CH1')?.size).toBe(1),
    )
    act(() => {
      ws.push('SI_NL2_FL_22_CH1', 'RUN')
      ws.push('SI_NL2_FL_22_CH2', 'STOP')
    })

    expect(screen.getByTestId('count-RUN')).toHaveTextContent('1')
    expect(screen.getByTestId('count-RUN')).not.toHaveAttribute('title')
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

    await user.click(screen.getByRole('button', { name: 'Flashlamps actions' }))

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
    expect(screen.queryByRole('button', { name: '50' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Set trigger delay' }))

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

  it('declares one grid column per state, so the header/count row never wraps', async () => {
    const ws = renderFl(['22'])
    await waitFor(() =>
      expect(ws.subscriptions.get('SI_NL2_FL_22_CH1')?.size).toBe(1),
    )

    // Every state renders a header AND a count cell, and the grid must be
    // told how many there are — otherwise the row wraps and the cells land
    // under the wrong headers.
    const headers = screen.getAllByTestId(/^count-/)
    const grid = headers[0].parentElement
    expect(grid?.style.getPropertyValue('--flashlamp-state-count')).toBe(
      String(headers.length),
    )
  })

  it('shows uncounted states (IGNITION / BUSY) as raw text in the detail list only', async () => {
    const ws = renderFl(['22'])
    await waitFor(() =>
      expect(ws.subscriptions.get('SI_NL2_FL_22_CH1')?.size).toBe(1),
    )

    act(() => {
      ws.push('SI_NL2_FL_22_CH1', 'IGNITION')
      ws.push('SI_NL2_FL_22_CH2', 'BUSY')
    })

    // Only four states have a column; these are counted in none of them.
    expect(screen.getByTestId('count-SB')).toHaveTextContent('0')
    expect(screen.getByTestId('count-RUN')).toHaveTextContent('0')
    expect(screen.getByTestId('count-STOP')).toHaveTextContent('0')
    expect(screen.getByTestId('count-FAIL')).toHaveTextContent('0')
    expect(screen.queryByTestId('count-IGN')).not.toBeInTheDocument()
    expect(screen.queryByTestId('count-BUSY')).not.toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(
      screen.getByRole('button', {
        name: 'Toggle Flashlamps channel detail',
      }),
    )

    // Their raw value is still visible per-channel and untoned — NOT the
    // "unknown"/invalid styling, which is reserved for missing or
    // untrustworthy data.
    const ch1 = screen.getByText('22 Ch1').closest('li')
    const ch2 = screen.getByText('22 Ch2').closest('li')
    expect(ch1).toHaveTextContent('IGNITION')
    expect(ch1?.querySelector('[data-tone-surface]')).not.toHaveAttribute(
      'data-tone',
    )
    expect(ch2).toHaveTextContent('BUSY')
    expect(ch2?.querySelector('[data-tone-surface]')).not.toHaveAttribute(
      'data-tone',
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
      screen.getByText('22 Ch1').parentElement?.querySelector('[data-tone]'),
    ).toHaveAttribute('data-tone', 'unknown')
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

    // A MINOR alarm tones the row but keeps the reading: the value is still
    // trustworthy, it is just alarmed. Only an unusable reading is replaced.
    const ch1 = screen.getByText('22 Ch1').closest('li')
    expect(ch1?.querySelector('[data-tone]')).toHaveAttribute(
      'data-tone',
      'warning',
    )
    expect(ch1).toHaveTextContent('RUN')

    const ch2 = screen.getByText('22 Ch2').closest('li')
    expect(ch2?.querySelector('[data-tone]')).toHaveAttribute(
      'data-tone',
      'invalid',
    )
    expect(ch2).toHaveTextContent('PV DSC')
    expect(ch2).not.toHaveTextContent('STOP')
  })

  it('shows the configured unit beside a valid Trigger Delay, and none otherwise', async () => {
    const ws = renderFl(['22'])
    await waitFor(() =>
      expect(ws.subscriptions.get('AI_NL2_TRIG_DELAY_CH2')?.size).toBe(1),
    )

    act(() => {
      ws.push('AI_NL2_TRIG_DELAY_CH1', 790)
      ws.push('AI_NL2_TRIG_DELAY_CH2', 790)
    })
    // 'ns' is the component fallback — no config unit is passed here.
    expect(screen.getByText('ns')).toBeInTheDocument()

    // A disconnect replaces the value, so the unit goes with it.
    act(() => {
      ws.push('AI_NL2_TRIG_DELAY_CH1', { value: null, ok: false })
    })
    expect(screen.getByText('PV DSC')).toBeInTheDocument()
    expect(screen.queryByText('ns')).not.toBeInTheDocument()
  })

  it('shows a numeric enum index as-is rather than pretending there is no data', async () => {
    const ws = renderFl(['22'])
    await waitFor(() =>
      expect(ws.subscriptions.get('SI_NL2_FL_22_CH1')?.size).toBe(1),
    )

    // An enum record read at its native type arrives as the index, not the
    // state name (only `datatype: enum_string` yields the name).
    act(() => ws.push('SI_NL2_FL_22_CH1', 2))

    const user = userEvent.setup()
    await user.click(
      screen.getByRole('button', {
        name: 'Toggle Flashlamps channel detail',
      }),
    )

    const ch1 = screen.getByText('22 Ch1').closest('li')
    expect(ch1).toHaveTextContent('2')
    expect(ch1).not.toHaveTextContent('<>')
    // It maps to no named state, so it stays neutral and uncounted.
    expect(ch1?.querySelector('[data-tone-surface]')).not.toHaveAttribute(
      'data-tone',
    )
    expect(screen.getByTestId('count-RUN')).toHaveTextContent('0')
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

    expect(screen.getByText(/MISMATCH 790\/50/)).toHaveAttribute(
      'data-tone',
      'negative-important',
    )
  })

  it('shows PV DSC for Trigger Delay when a readout is disconnected, ahead of a mismatch', async () => {
    const ws = renderFl(['22'])
    await waitFor(() =>
      expect(ws.subscriptions.get('AI_NL2_TRIG_DELAY_CH2')?.size).toBe(1),
    )

    act(() => {
      ws.push('AI_NL2_TRIG_DELAY_CH1', 790)
      // Disconnected — even though the value that arrived also disagrees
      // with CH1, the disconnect takes priority over the mismatch display.
      ws.push('AI_NL2_TRIG_DELAY_CH2', { value: 50, ok: false })
    })

    expect(screen.getByText('PV DSC')).toBeInTheDocument()
    expect(screen.queryByText(/MISMATCH/)).not.toBeInTheDocument()
  })

  it('shows PV INV for Trigger Delay on EPICS severity 3, even when the readouts agree', async () => {
    const ws = renderFl(['22'])
    await waitFor(() =>
      expect(ws.subscriptions.get('AI_NL2_TRIG_DELAY_CH2')?.size).toBe(1),
    )

    act(() => {
      ws.push('AI_NL2_TRIG_DELAY_CH1', { value: 790, severity: 3 })
      ws.push('AI_NL2_TRIG_DELAY_CH2', 790)
    })

    expect(screen.getByText('PV INV')).toBeInTheDocument()
    expect(screen.queryByText('790')).not.toBeInTheDocument()
  })

  it('hides the flashlamp action buttons when those commands are not exposed', async () => {
    const ws = makeFakeWebSocketContext()
    render(
      <TestWebSocketProvider value={ws.context}>
        <FlashlampsSection
          cmdPv={makeCommandPv('NL2', {})}
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
