import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ModboxSection } from './ModboxSection'
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

describe('ModboxSection', () => {
  it('renders the merged Modbox state pill and Loaded Waveform readout', async () => {
    const ws = makeFakeWebSocketContext()
    render(
      <TestWebSocketProvider value={ws.context}>
        <ModboxSection laser="NL2" modboxStateCount={3} />
      </TestWebSocketProvider>,
    )

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
    expect(screen.getByText('Loaded Waveform')).toBeInTheDocument()
    expect(screen.getAllByText('std-100ps').length).toBeGreaterThan(0)
  })

  it('exposes Modbox ON / Modbox OFF behind a cog toggle', async () => {
    const ws = makeFakeWebSocketContext()
    render(
      <TestWebSocketProvider value={ws.context}>
        <ModboxSection laser="NL2" modboxStateCount={3} />
      </TestWebSocketProvider>,
    )
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
    const ws = makeFakeWebSocketContext()
    render(
      <TestWebSocketProvider value={ws.context}>
        <ModboxSection laser="NL2" modboxStateCount={3} />
      </TestWebSocketProvider>,
    )
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
    const ws = makeFakeWebSocketContext()
    render(
      <TestWebSocketProvider value={ws.context}>
        <ModboxSection laser="NL2" modboxStateCount={3} />
      </TestWebSocketProvider>,
    )
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
