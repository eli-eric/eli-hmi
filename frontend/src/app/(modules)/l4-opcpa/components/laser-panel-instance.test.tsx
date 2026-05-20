import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LaserPanelInstance } from './laser-panel-instance'
import { LASER_SPECS } from './laser-specs'
import {
  makeFakeWebSocketContext,
  TestWebSocketProvider,
} from '@/test/ws-test-provider'

const ORIGINAL_FETCH = globalThis.fetch

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'localhost:8080')
  globalThis.fetch = vi.fn(
    async () => new Response(JSON.stringify([]), { status: 200 }),
  ) as unknown as typeof fetch
})

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  vi.unstubAllEnvs()
})

describe('LaserPanelInstance', () => {
  it('renders the column header and one representative row per section', () => {
    const nl2 = LASER_SPECS.find((s) => s.laser === 'NL2')!
    const ws = makeFakeWebSocketContext()
    render(
      <TestWebSocketProvider value={ws.context}>
        <LaserPanelInstance spec={nl2} />
      </TestWebSocketProvider>,
    )
    expect(screen.getByRole('heading', { name: 'NL2' })).toBeInTheDocument()
    expect(screen.getByText('Overview')).toBeInTheDocument()
    expect(screen.getByText('Shutter Position')).toBeInTheDocument()
    expect(screen.getByText('Regen SY3PL50M:32')).toBeInTheDocument()
    expect(screen.getByText('Chiller PS1225:11')).toBeInTheDocument()
    expect(screen.getByText('Flashlamps State')).toBeInTheDocument()
    expect(screen.getByText('Modbox State')).toBeInTheDocument()
    expect(screen.getByText('Loaded Waveform')).toBeInTheDocument()
  })
})
