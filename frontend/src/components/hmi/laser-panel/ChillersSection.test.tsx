import { describe, it, expect } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { ChillersSection } from './ChillersSection'
import {
  createMockWebSocket,
  MockWebSocketProvider,
} from '@/test/ws-mock'

describe('ChillersSection', () => {
  it('renders the Flow/Temp/Water header row and one row per chiller with PV-name labels', async () => {
    const ws = createMockWebSocket()
    render(
      <MockWebSocketProvider ws={ws}>
        <ChillersSection laser="NL2" chillerIds={['11', '12']} />
      </MockWebSocketProvider>,
    )

    await waitFor(() =>
      expect(ws.subscriptions.get('AI_NL2_CHILLER_11_FLOW')?.size).toBe(1),
    )
    await waitFor(() =>
      expect(ws.subscriptions.get('AI_NL2_CHILLER_12_LEVEL')?.size).toBe(1),
    )

    act(() => {
      ws.push('AI_NL2_CHILLER_11_FLOW', 5.123, { units: 'L/min' })
      ws.push('AI_NL2_CHILLER_11_TEMP', 21.5, { units: '°C' })
      ws.push('AI_NL2_CHILLER_11_LEVEL', 0.85, { units: 'L' })
      ws.push('AI_NL2_CHILLER_12_FLOW', 4.999, { units: 'L/min' })
      ws.push('AI_NL2_CHILLER_12_TEMP', 22.0, { units: '°C' })
      ws.push('AI_NL2_CHILLER_12_LEVEL', 0.92, { units: 'L' })
    })

    expect(screen.getByText('Flow')).toBeInTheDocument()
    expect(screen.getByText('Temp')).toBeInTheDocument()
    expect(screen.getByText('Water')).toBeInTheDocument()
    expect(screen.getByText('Chiller PS1225:11')).toBeInTheDocument()
    expect(screen.getByText('Chiller PS1225:12')).toBeInTheDocument()
    expect(screen.getByText('5.123')).toBeInTheDocument()
    expect(screen.getByText('4.999')).toBeInTheDocument()
    expect(screen.getByText('22.000')).toBeInTheDocument()
  })
})
