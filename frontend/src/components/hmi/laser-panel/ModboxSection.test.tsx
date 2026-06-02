import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ModboxSection } from './ModboxSection'
import { LASER_COMMANDS } from '@/app/(modules)/l4-opcpa/lib/pv-names'
import {
  makeFakeWebSocketContext,
  TestWebSocketProvider,
} from '@/test/ws-test-provider'

const ORIGINAL_FETCH = globalThis.fetch

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'localhost:8080')
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

const MODBOX_3 = ['BI_NL2_MODBOX_1', 'BI_NL2_MODBOX_2', 'BI_NL2_MODBOX_3']

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
  it('renders the merged Modbox state pill and Loaded Waveform readout', async () => {
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
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    expect(screen.getByText('Waveform Latest')).toBeInTheDocument()
    expect(screen.getAllByText('std-100ps').length).toBeGreaterThan(0)
  })

  it('renders the full Modbox row structure: BOOL, MBC1, MBC2, Waveform Preset, Waveform Latest, and Modbox Actions', async () => {
    const ws = renderModbox()
    await waitFor(() =>
      expect(ws.subscriptions.get('BI_NL2_MODBOX_1')?.size).toBe(1),
    )

    // Merged BOOL count + the two MBC float columns from the wireframe.
    expect(screen.getByText('Modbox State')).toBeInTheDocument()
    expect(screen.getByText('BOOL')).toBeInTheDocument()
    expect(screen.getByText('MBC1')).toBeInTheDocument()
    expect(screen.getByText('MBC2')).toBeInTheDocument()
    // Both waveform rows.
    expect(screen.getByText('Waveform Preset')).toBeInTheDocument()
    expect(screen.getByText('Waveform Latest')).toBeInTheDocument()
    // Modbox actions cog.
    expect(
      screen.getByRole('button', { name: 'Modbox actions' }),
    ).toBeInTheDocument()
  })

  it('shows the unknown placeholder for MBC1/MBC2/Waveform Preset when their PVs are not configured', async () => {
    const ws = renderModbox()
    await waitFor(() =>
      expect(ws.subscriptions.get('SI_NL2_LOADED_WAVEFORM')?.size).toBe(1),
    )

    // Give the configured readouts real values: Modbox State shows a count,
    // Waveform Latest a string — so the only remaining `<>` placeholders are
    // the three unconfigured cells (MBC1, MBC2, Waveform Preset).
    act(() => {
      ws.push('BI_NL2_MODBOX_1', 1)
      ws.push('BI_NL2_MODBOX_2', 1)
      ws.push('BI_NL2_MODBOX_3', 1)
      ws.push('SI_NL2_LOADED_WAVEFORM', 'std-100ps')
    })

    expect(screen.getAllByText('<>').length).toBe(3)
  })

  it('does not subscribe to MBC1/MBC2/Waveform Preset PVs when unconfigured', async () => {
    const ws = renderModbox()
    await waitFor(() =>
      expect(ws.subscriptions.get('BI_NL2_MODBOX_1')?.size).toBe(1),
    )
    // Only the configured PVs (modbox + loaded waveform) get subscriptions;
    // no undefined PV names leak into the subscription set.
    expect([...ws.subscriptions.keys()]).toEqual(
      expect.arrayContaining([...MODBOX_3, 'SI_NL2_LOADED_WAVEFORM']),
    )
    expect([...ws.subscriptions.keys()]).not.toContain(undefined)
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
  })

  it('exposes the waveform selector behind a cog toggle', async () => {
    const ws = renderModbox()
    await waitFor(() =>
      expect(ws.subscriptions.get('SI_NL2_LOADED_WAVEFORM')?.size).toBe(1),
    )

    const user = userEvent.setup()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Set waveform' }),
    )

    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })
})
