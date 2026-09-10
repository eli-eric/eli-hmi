import { describe, it, expect } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { ChillersSection } from './ChillersSection'
import {
  makeFakeWebSocketContext,
  TestWebSocketProvider,
} from '@/test/ws-test-provider'

describe('ChillersSection', () => {
  it('renders the Flow/Temp/Water header row and one row per chiller with PV-name labels', async () => {
    const ws = makeFakeWebSocketContext()
    render(
      <TestWebSocketProvider value={ws.context}>
        <ChillersSection
          chillers={[
            {
              label: 'PS1225:11',
              flow: 'AI_NL2_CHILLER_11_FLOW',
              temp: 'AI_NL2_CHILLER_11_TEMP',
              level: 'AI_NL2_CHILLER_11_LEVEL',
            },
            {
              label: 'PS1225:12',
              flow: 'AI_NL2_CHILLER_12_FLOW',
              temp: 'AI_NL2_CHILLER_12_TEMP',
              level: 'AI_NL2_CHILLER_12_LEVEL',
            },
          ]}
        />
      </TestWebSocketProvider>,
    )

    await waitFor(() =>
      expect(ws.subscriptions.get('AI_NL2_CHILLER_11_FLOW')?.size).toBe(1),
    )
    await waitFor(() =>
      expect(ws.subscriptions.get('AI_NL2_CHILLER_12_LEVEL')?.size).toBe(1),
    )

    act(() => {
      ws.push('AI_NL2_CHILLER_11_FLOW', { value: 5.123, units: 'L/min' })
      ws.push('AI_NL2_CHILLER_11_TEMP', { value: 21.5, units: '°C' })
      ws.push('AI_NL2_CHILLER_11_LEVEL', { value: 0.85, units: 'L' })
      ws.push('AI_NL2_CHILLER_12_FLOW', { value: 4.999, units: 'L/min' })
      ws.push('AI_NL2_CHILLER_12_TEMP', { value: 22.0, units: '°C' })
      ws.push('AI_NL2_CHILLER_12_LEVEL', { value: 0.92, units: 'L' })
    })

    // No config units here, so the headers pick up the PVs' own metadata.
    expect(screen.getByText('Flow (L/min)')).toBeInTheDocument()
    expect(screen.getByText('Temp (°C)')).toBeInTheDocument()
    expect(screen.getByText('Water (L)')).toBeInTheDocument()
    expect(screen.getByText('Chiller PS1225:11')).toBeInTheDocument()
    expect(screen.getByText('Chiller PS1225:12')).toBeInTheDocument()
    expect(screen.getByText('5.123')).toBeInTheDocument()
    expect(screen.getByText('4.999')).toBeInTheDocument()
    expect(screen.getByText('22.000')).toBeInTheDocument()
  })

  it('puts configured units in the column headers, not on every cell', async () => {
    const ws = makeFakeWebSocketContext()
    render(
      <TestWebSocketProvider value={ws.context}>
        <ChillersSection
          chillers={[
            {
              label: 'PS1225:11',
              flow: 'AI_NL2_CHILLER_11_FLOW',
              temp: 'AI_NL2_CHILLER_11_TEMP',
              level: 'AI_NL2_CHILLER_11_LEVEL',
            },
          ]}
          units={{ chillerFlow: 'L/min', chillerTemp: '°C', chillerLevel: '%' }}
        />
      </TestWebSocketProvider>,
    )
    await waitFor(() =>
      expect(ws.subscriptions.get('AI_NL2_CHILLER_11_FLOW')?.size).toBe(1),
    )

    act(() => {
      ws.push('AI_NL2_CHILLER_11_TEMP', { value: 24.81 })
    })

    expect(screen.getByText('Flow (L/min)')).toBeInTheDocument()
    expect(screen.getByText('Temp (°C)')).toBeInTheDocument()
    expect(screen.getByText('Water (%)')).toBeInTheDocument()
    // The cell itself stays bare — it is only ~3.9rem wide.
    expect(screen.getByText('24.810')).toBeInTheDocument()
  })

  it('leaves headers unlabelled when no unit is configured or published', async () => {
    const ws = makeFakeWebSocketContext()
    render(
      <TestWebSocketProvider value={ws.context}>
        <ChillersSection
          chillers={[
            {
              label: 'PS1225:11',
              flow: 'AI_NL2_CHILLER_11_FLOW',
              temp: 'AI_NL2_CHILLER_11_TEMP',
              level: 'AI_NL2_CHILLER_11_LEVEL',
            },
          ]}
        />
      </TestWebSocketProvider>,
    )
    await waitFor(() =>
      expect(ws.subscriptions.get('AI_NL2_CHILLER_11_FLOW')?.size).toBe(1),
    )

    expect(screen.getByText('Flow')).toBeInTheDocument()
    expect(screen.getByText('Temp')).toBeInTheDocument()
    expect(screen.getByText('Water')).toBeInTheDocument()
  })
})
