import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  TestWebSocketProvider,
  makeFakeWebSocketContext,
} from '@/test/ws-test-provider'
import { ConnectionIndicator } from './connection-indicator'

function renderIndicator(isConnected: boolean) {
  const { context } = makeFakeWebSocketContext({ isConnected })
  return render(
    <TestWebSocketProvider value={context}>
      <ConnectionIndicator />
    </TestWebSocketProvider>,
  )
}

describe('ConnectionIndicator', () => {
  it('reports a connected WebSocket with an accessible status label', () => {
    renderIndicator(true)
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute(
      'aria-label',
      expect.stringMatching(/connected/i),
    )
    expect(status).toHaveAttribute('data-connected', 'true')
  })

  it('reports a disconnected WebSocket with an accessible status label', () => {
    renderIndicator(false)
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute(
      'aria-label',
      expect.stringMatching(/disconnected/i),
    )
    expect(status).toHaveAttribute('data-connected', 'false')
  })
})
