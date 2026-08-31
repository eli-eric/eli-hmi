import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ModboxSection } from './ModboxSection'
import type { LabeledPv } from '@/app/(modules)/l4-opcpa/config/schema'
import { LASER_COMMANDS } from '@/app/(modules)/l4-opcpa/lib/pv-names'
import {
  makeFakeWebSocketContext,
  TestWebSocketProvider,
} from '@/test/ws-test-provider'

const ORIGINAL_FETCH = globalThis.fetch

beforeEach(() => {
  globalThis.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify(['std-100ps', 'narrow-50ps']), {
        status: 200,
      }),
  ) as unknown as typeof fetch
})

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  vi.unstubAllEnvs()
})

const MODBOX_3: LabeledPv[] = [
  { label: 'Modbox 1', pv: 'BI_NL2_MODBOX_1' },
  { label: 'Modbox 2', pv: 'BI_NL2_MODBOX_2' },
  { label: 'Modbox 3', pv: 'BI_NL2_MODBOX_3' },
]

function renderModbox() {
  const ws = makeFakeWebSocketContext()
  render(
    <TestWebSocketProvider value={ws.context}>
      <ModboxSection
        laser="NL2"
        modbox={MODBOX_3}
        loadedWaveformPv="SI_NL2_LOADED_WAVEFORM"
        commands={LASER_COMMANDS}
      />
    </TestWebSocketProvider>,
  )
  return ws
}

describe('ModboxSection', () => {
  it('renders the merged Modbox state pill and Waveform Preset readout', async () => {
    const ws = renderModbox()

    await waitFor(() =>
      expect(ws.subscriptions.get('BI_NL2_MODBOX_1')?.size).toBe(1),
    )
    await waitFor(() =>
      expect(ws.subscriptions.get('SI_NL2_LOADED_WAVEFORM')?.size).toBe(1),
    )

    act(() => {
      ws.push('BI_NL2_MODBOX_1', 1)
      ws.push('BI_NL2_MODBOX_2', 1)
      ws.push('BI_NL2_MODBOX_3', 0)
      ws.push('SI_NL2_LOADED_WAVEFORM', 'std-100ps')
    })

    expect(screen.getByText('Modbox State')).toBeInTheDocument()
    expect(screen.getByText('2/3')).toBeInTheDocument()
    expect(screen.getByText('Waveform Preset')).toBeInTheDocument()
    expect(screen.getAllByText('std-100ps').length).toBeGreaterThan(0)
    // Modbox state is a plain readout, not pass/fail — no ok/error tone on
    // the summary pill even with a mix of 1s and 0s.
    expect(screen.getByText('2/3').closest('.modboxStatePill')).not.toHaveAttribute(
      'data-tone',
    )
  })

  it('exposes Modbox ON / Modbox OFF behind a cog toggle', async () => {
    const ws = renderModbox()
    await waitFor(() =>
      expect(ws.subscriptions.get('BI_NL2_MODBOX_1')?.size).toBe(1),
    )

    const user = userEvent.setup()
    expect(
      screen.queryByRole('button', { name: 'Set Modbox ON' }),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Modbox actions' }),
    )

    expect(
      screen.getByRole('button', { name: 'Set Modbox ON' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Set Modbox OFF' }),
    ).toBeInTheDocument()
  })

  it('expands the Modbox state detail list when the state pill is clicked', async () => {
    const ws = renderModbox()
    await waitFor(() =>
      expect(ws.subscriptions.get('BI_NL2_MODBOX_1')?.size).toBe(1),
    )
    act(() => {
      ws.push('BI_NL2_MODBOX_1', 1)
      ws.push('BI_NL2_MODBOX_2', 0)
      ws.push('BI_NL2_MODBOX_3', 1)
    })

    const user = userEvent.setup()
    expect(screen.queryByText('Modbox 1')).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Toggle Modbox state detail' }),
    )

    expect(screen.getByText('Modbox 1')).toBeInTheDocument()
    expect(screen.getByText('Modbox 2')).toBeInTheDocument()
    expect(screen.getByText('Modbox 3')).toBeInTheDocument()
    // Per-channel entries show the raw value with a neutral (not ok/err) tone.
    expect(
      screen.getByText('Modbox 1').closest('li')?.querySelector('[data-state]'),
    ).toHaveAttribute('data-state', 'neutral')
    expect(
      screen.getByText('Modbox 2').closest('li')?.querySelector('[data-state]'),
    ).toHaveAttribute('data-state', 'neutral')
  })

  it('overrides a channel colour with EPICS severity, regardless of the raw value', async () => {
    const ws = renderModbox()
    await waitFor(() =>
      expect(ws.subscriptions.get('BI_NL2_MODBOX_1')?.size).toBe(1),
    )
    act(() => {
      // MAJOR alarm despite value=1, which would otherwise be a plain neutral "1".
      ws.push('BI_NL2_MODBOX_1', { value: 1, severity: 2 })
    })

    const user = userEvent.setup()
    await user.click(
      screen.getByRole('button', { name: 'Toggle Modbox state detail' }),
    )

    const modbox1 = screen.getByText('Modbox 1').closest('li')
    expect(modbox1?.querySelector('[data-state]')).toHaveAttribute(
      'data-state',
      'err',
    )
    expect(modbox1).toHaveTextContent('ERR')
  })

  it('colours the summary pill by the worst channel severity, not the raw bits', async () => {
    const ws = renderModbox()
    await waitFor(() =>
      expect(ws.subscriptions.get('BI_NL2_MODBOX_1')?.size).toBe(1),
    )

    act(() => {
      ws.push('BI_NL2_MODBOX_1', 1)
      ws.push('BI_NL2_MODBOX_2', 1)
      ws.push('BI_NL2_MODBOX_3', 1)
    })
    const pill = screen
      .getByRole('button', { name: 'Toggle Modbox state detail' })
      .querySelector('.modboxStatePill')
    // All channels healthy (severity none) — still no colour, per the
    // "not pass/fail" decision for the raw bit value.
    expect(pill).not.toHaveAttribute('data-tone')

    act(() => {
      // MINOR alarm on one channel, still value=1.
      ws.push('BI_NL2_MODBOX_2', { value: 1, severity: 1 })
    })
    expect(pill).toHaveAttribute('data-tone', 'warning')

    act(() => {
      // Now a disconnected channel — worse than a MINOR alarm.
      ws.push('BI_NL2_MODBOX_3', { value: 1, ok: false })
    })
    expect(pill).toHaveAttribute('data-tone', 'invalid')
  })

  it('exposes the waveform selector behind a cog toggle', async () => {
    const ws = renderModbox()
    await waitFor(() =>
      expect(ws.subscriptions.get('SI_NL2_LOADED_WAVEFORM')?.size).toBe(1),
    )

    const user = userEvent.setup()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Set waveform preset' }),
    )

    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('exposes "Set Waveform to…" inside the Modbox Actions group and reveals the selectbox + CONFIRM', async () => {
    const ws = renderModbox()
    await waitFor(() =>
      expect(ws.subscriptions.get('BI_NL2_MODBOX_1')?.size).toBe(1),
    )

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Modbox actions' }))

    const waveformAction = screen.getByRole('button', {
      name: 'Set Waveform to…',
    })
    expect(waveformAction).toBeInTheDocument()
    // Collapsed until pressed.
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()

    await user.click(waveformAction)

    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'CONFIRM' }),
    ).toBeInTheDocument()
  })

  it('collapses "Set Waveform to…" when Modbox Actions is closed and reopened', async () => {
    const ws = renderModbox()
    await waitFor(() =>
      expect(ws.subscriptions.get('BI_NL2_MODBOX_1')?.size).toBe(1),
    )

    const user = userEvent.setup()
    const actionsToggle = screen.getByRole('button', {
      name: 'Modbox actions',
    })

    await user.click(actionsToggle)
    await user.click(
      screen.getByRole('button', { name: 'Set Waveform to…' }),
    )
    expect(screen.getByRole('combobox')).toBeInTheDocument()

    await user.click(actionsToggle)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()

    await user.click(actionsToggle)
    expect(
      screen.getByRole('button', { name: 'Set Waveform to…' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('renders MBC1 / MBC2 readouts and the Waveform Latest row when configured', async () => {
    const ws = makeFakeWebSocketContext()
    render(
      <TestWebSocketProvider value={ws.context}>
        <ModboxSection
          laser="NL2"
          modbox={MODBOX_3}
          loadedWaveformPv="SI_NL2_LOADED_WAVEFORM"
          latestWaveformPv="SI_NL2_LATEST_WAVEFORM"
          mbc1Pv="AI_NL2_MBC1"
          mbc2Pv="AI_NL2_MBC2"
          commands={LASER_COMMANDS}
        />
      </TestWebSocketProvider>,
    )

    await waitFor(() =>
      expect(ws.subscriptions.get('AI_NL2_MBC1')?.size).toBe(1),
    )
    await waitFor(() =>
      expect(ws.subscriptions.get('SI_NL2_LATEST_WAVEFORM')?.size).toBe(1),
    )

    act(() => {
      ws.push('AI_NL2_MBC1', 12.34)
      ws.push('AI_NL2_MBC2', 56.78)
      ws.push('SI_NL2_LATEST_WAVEFORM', 'narrow-50ps')
    })

    expect(screen.getByText('MBC1')).toBeInTheDocument()
    expect(screen.getByText('MBC2')).toBeInTheDocument()
    expect(screen.getByText('12.34')).toBeInTheDocument()
    expect(screen.getByText('56.78')).toBeInTheDocument()
    expect(screen.getByText('Waveform Latest')).toBeInTheDocument()
    expect(screen.getAllByText('narrow-50ps').length).toBeGreaterThan(0)
  })
})
