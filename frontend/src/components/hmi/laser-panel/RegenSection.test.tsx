import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RegenSection } from './RegenSection'
import {
  createMockWebSocket,
  MockWebSocketProvider,
} from '@/test/ws-mock'

const ORIGINAL_FETCH = globalThis.fetch

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'localhost:8080')
})

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  vi.unstubAllEnvs()
})

describe('RegenSection', () => {
  it('renders the four read rows with PV-name labels', async () => {
    const ws = createMockWebSocket()
    render(
      <MockWebSocketProvider ws={ws}>
        <RegenSection laser="NL2" />
      </MockWebSocketProvider>,
    )
    await waitFor(() =>
      expect(ws.subscriptions.get('BI_NL2_REGEN_STATE')?.size).toBe(1),
    )

    act(() => {
      ws.push('BI_NL2_REGEN_STATE', 1)
      ws.push('AI_TEMP_NL2_REGEN', 24.81, { units: '°C' })
      ws.push('AI_NL2_PHD2_MEAN', 4.567, { units: 'a.u.' })
      ws.push('AI_NL2_ATT', 1024)
    })

    expect(screen.getByText('Regen SY3PL50M:32')).toBeInTheDocument()
    expect(screen.getByText('is ON')).toBeInTheDocument()
    expect(screen.getByText('Regen Temp TK6:44')).toBeInTheDocument()
    expect(screen.getByText('24.810')).toBeInTheDocument()
    expect(screen.getByText('PHD1K000:48/Mean')).toBeInTheDocument()
    expect(screen.getByText('4.567')).toBeInTheDocument()
    expect(screen.getByText('Atten. SM5:ATT1:51')).toBeInTheDocument()
    expect(screen.getByText('1024')).toBeInTheDocument()
  })

  it('exposes the attenuator write input behind a cog', async () => {
    const ws = createMockWebSocket()
    render(
      <MockWebSocketProvider ws={ws}>
        <RegenSection laser="NL2" />
      </MockWebSocketProvider>,
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
