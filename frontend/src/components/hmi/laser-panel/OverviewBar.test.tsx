import { describe, it, expect } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OverviewBar } from './OverviewBar'
import {
  makeFakeWebSocketContext,
  TestWebSocketProvider,
} from '@/test/ws-test-provider'

function renderOverview() {
  const ws = makeFakeWebSocketContext()
  render(
    <TestWebSocketProvider value={ws.context}>
      <OverviewBar
        connectionPv="CONN"
        fullPowerPv="FULLP"
        mssPvs={['MSS_1', 'MSS_2']}
        moduleErrors={[{ label: 'Err A', pv: 'ERR_A' }]}
      />
    </TestWebSocketProvider>,
  )
  return ws
}

describe('OverviewBar', () => {
  it('renders the CONN, FULLP, MSS and ERR overview cells', () => {
    renderOverview()
    expect(screen.getByText('CONN')).toBeInTheDocument()
    expect(screen.getByText('FULLP')).toBeInTheDocument()
    expect(screen.getByText('MSS')).toBeInTheDocument()
    expect(screen.getByText('ERR')).toBeInTheDocument()
  })

  it('renders an MSS detail row as unknown (N/A), not NO, when ok but value is null', async () => {
    const ws = renderOverview()
    await waitFor(() => expect(ws.subscriptions.get('MSS_1')?.size).toBe(1))

    act(() => {
      // ok=true but value null — must read as unknown, not a "NO" indicator.
      ws.push('MSS_1', { ok: true, value: null })
      ws.push('MSS_2', 1)
    })

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Toggle MSS detail' }))

    expect(screen.getByText('MSS 1')).toBeInTheDocument()
    expect(screen.getByText('MSS 2')).toBeInTheDocument()
    // MSS 1 (null) → unknown (N/A); MSS 2 (=1) → YES; nothing renders NO.
    expect(screen.getByText('N/A')).toBeInTheDocument()
    expect(screen.getByText('YES')).toBeInTheDocument()
    expect(screen.queryByText('NO')).not.toBeInTheDocument()
  })
})
