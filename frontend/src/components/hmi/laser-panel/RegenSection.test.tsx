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
