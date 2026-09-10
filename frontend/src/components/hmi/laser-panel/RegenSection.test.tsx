import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RegenSection } from './RegenSection'
import {
  makeFakeWebSocketContext,
  TestWebSocketProvider,
} from '@/test/ws-test-provider'

const ORIGINAL_FETCH = globalThis.fetch

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  vi.unstubAllEnvs()
})

describe('RegenSection', () => {
  it('asks for the state name, not the enum index', async () => {
    // `:State` is an mbbi: read at its native type Channel Access sends the
    // index, which the row cannot display. A mock that pushes strings hides
    // this, so assert the subscription itself.
    const ws = makeFakeWebSocketContext()
    render(
      <TestWebSocketProvider value={ws.context}>
        <RegenSection
          regenStatePv="BI_NL2_REGEN_STATE"
          regenTempPv="AI_TEMP_NL2_REGEN"
          phd2MeanPv="AI_NL2_PHD2_MEAN"
          attenuatorPv="AI_NL2_ATT"
        />
      </TestWebSocketProvider>,
    )
    await waitFor(() =>
      expect(ws.subscriptions.get('BI_NL2_REGEN_STATE')?.size).toBe(1),
    )

    expect(ws.subscribeOptions.get('BI_NL2_REGEN_STATE')).toEqual({
      datatype: 'enum_string',
    })
    // The analog readouts stay native — one datatype per subscription.
    expect(ws.subscribeOptions.get('AI_TEMP_NL2_REGEN')).toBeUndefined()
  })

  it('renders the four read rows with PV-name labels', async () => {
    const ws = makeFakeWebSocketContext()
    render(
      <TestWebSocketProvider value={ws.context}>
        <RegenSection
          regenStatePv="BI_NL2_REGEN_STATE"
          regenTempPv="AI_TEMP_NL2_REGEN"
          phd2MeanPv="AI_NL2_PHD2_MEAN"
          attenuatorPv="AI_NL2_ATT"
        />
      </TestWebSocketProvider>,
    )
    await waitFor(() =>
      expect(ws.subscriptions.get('BI_NL2_REGEN_STATE')?.size).toBe(1),
    )

    act(() => {
      ws.push('BI_NL2_REGEN_STATE', 'RUNNING')
      ws.push('AI_TEMP_NL2_REGEN', { value: 24.81, units: '°C' })
      ws.push('AI_NL2_PHD2_MEAN', { value: 4.567, units: 'a.u.' })
      ws.push('AI_NL2_ATT', 1024)
    })

    expect(screen.getByText('Regen SY3PL50M:32')).toBeInTheDocument()
    expect(screen.getByText('RUNNING')).toBeInTheDocument()
    expect(screen.getByText('Regen Temp TK6:44')).toBeInTheDocument()
    expect(screen.getByText('24.810')).toBeInTheDocument()
    expect(screen.getByText('PHD1K000:48/Mean')).toBeInTheDocument()
    expect(screen.getByText('4.567')).toBeInTheDocument()
    expect(screen.getByText('Atten. SM5:ATT1:51')).toBeInTheDocument()
    expect(screen.getByText('1024')).toBeInTheDocument()
  })

  it('styles the Regen status by EPICS severity', async () => {
    const ws = makeFakeWebSocketContext()
    render(
      <TestWebSocketProvider value={ws.context}>
        <RegenSection
          regenStatePv="BI_NL2_REGEN_STATE"
          regenTempPv="AI_TEMP_NL2_REGEN"
          phd2MeanPv="AI_NL2_PHD2_MEAN"
          attenuatorPv="AI_NL2_ATT"
        />
      </TestWebSocketProvider>,
    )
    await waitFor(() =>
      expect(ws.subscriptions.get('BI_NL2_REGEN_STATE')?.size).toBe(1),
    )

    act(() => {
      ws.push('BI_NL2_REGEN_STATE', { value: 'RUNNING', severity: 2 })
    })

    expect(screen.getByText('RUNNING')).toHaveAttribute('data-tone', 'error')
  })

  it('on disconnect, shows PV DSC with the PV name and last known value in a tooltip', async () => {
    const ws = makeFakeWebSocketContext()
    render(
      <TestWebSocketProvider value={ws.context}>
        <RegenSection
          regenStatePv="BI_NL2_REGEN_STATE"
          regenTempPv="AI_TEMP_NL2_REGEN"
          phd2MeanPv="AI_NL2_PHD2_MEAN"
          attenuatorPv="AI_NL2_ATT"
        />
      </TestWebSocketProvider>,
    )
    await waitFor(() =>
      expect(ws.subscriptions.get('AI_TEMP_NL2_REGEN')?.size).toBe(1),
    )

    // A good reading first, then the PV disconnects (value comes back null).
    act(() => ws.push('AI_TEMP_NL2_REGEN', { value: 24.81 }))
    expect(screen.getByText('24.810')).toBeInTheDocument()

    act(() =>
      ws.push('AI_TEMP_NL2_REGEN', {
        value: null,
        ok: false,
        error: 'CA disconnected',
      }),
    )

    const cell = screen.getByText('PV DSC')
    expect(cell).toHaveAttribute('data-tone', 'invalid')
    // The last trustworthy value survives the transition into invalid.
    expect(cell.getAttribute('title')).toContain('AI_TEMP_NL2_REGEN')
    expect(cell.getAttribute('title')).toContain('Last known value: 24.81')
    expect(cell.getAttribute('title')).toContain('CA disconnected')
  })

  it('exposes the attenuator write input behind a cog', async () => {
    const ws = makeFakeWebSocketContext()
    render(
      <TestWebSocketProvider value={ws.context}>
        <RegenSection
          regenStatePv="BI_NL2_REGEN_STATE"
          regenTempPv="AI_TEMP_NL2_REGEN"
          phd2MeanPv="AI_NL2_PHD2_MEAN"
          attenuatorPv="AI_NL2_ATT"
        />
      </TestWebSocketProvider>,
    )
    await waitFor(() =>
      expect(ws.subscriptions.get('BI_NL2_REGEN_STATE')?.size).toBe(1),
    )

    const user = userEvent.setup()
    expect(screen.queryByLabelText(/custom/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Set attenuator' }))

    expect(screen.getByLabelText(/custom/i)).toBeInTheDocument()
  })
})
