import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LaserPanelInstance } from './laser-panel-instance'
import type { LaserSpec } from '../config/schema'
import {
  makeFakeWebSocketContext,
  TestWebSocketProvider,
} from '@/test/ws-test-provider'

const NL2: LaserSpec = {
  laser: 'NL2',
  mssCount: 6,
  moduleErrors: [
    'REGEN',
    'CHILLER_11',
    'CHILLER_12',
    'CHILLER_13',
    'CHILLER_14',
    'FLASHLAMPS',
  ],
  chillerIds: ['11', '12', '13', '14'],
  boxIds: ['22', '23', '24', '25', '26', '27', '28'],
  channelsPerBox: 2,
  delayPresets: [50, 500, 700, 790],
  modboxStateCount: 5,
  commands: [
    'START_LASER',
    'STOP_LASER',
    'ALIGNMENT_MODE',
    'SYSTEM_STANDBY',
    'FLASHLAMPS_RUN',
    'FLASHLAMPS_STANDBY',
    'MODBOX_ON',
    'MODBOX_OFF',
    'SET_DELAY',
    'LOAD_WAVEFORM',
  ],
}

function renderSpec(spec: LaserSpec) {
  const ws = makeFakeWebSocketContext()
  return render(
    <TestWebSocketProvider value={ws.context}>
      <LaserPanelInstance spec={spec} />
    </TestWebSocketProvider>,
  )
}

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
    renderSpec(NL2)
    expect(screen.getByRole('heading', { name: 'NL2' })).toBeInTheDocument()
    expect(screen.getByText('Overview')).toBeInTheDocument()
    expect(screen.getByText('Shutter Position')).toBeInTheDocument()
    expect(screen.getByText('Regen SY3PL50M:32')).toBeInTheDocument()
    expect(screen.getByText('Chiller PS1225:11')).toBeInTheDocument()
    expect(screen.getByText('Flashlamps State')).toBeInTheDocument()
    expect(screen.getByText('Modbox State')).toBeInTheDocument()
    expect(screen.getByText('Loaded Waveform')).toBeInTheDocument()
  })

  it('hides sections whose device bank is empty', () => {
    renderSpec({
      ...NL2,
      chillerIds: [],
      boxIds: [],
      modboxStateCount: 0,
    })
    // General + Regen always render…
    expect(screen.getByText('Shutter Position')).toBeInTheDocument()
    expect(screen.getByText('Regen SY3PL50M:32')).toBeInTheDocument()
    // …empty banks drop their whole section.
    expect(screen.queryByText('Chiller PS1225:11')).not.toBeInTheDocument()
    expect(screen.queryByText('Flashlamps State')).not.toBeInTheDocument()
    expect(screen.queryByText('Modbox State')).not.toBeInTheDocument()
  })
})
