import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LaserPanelInstance } from './laser-panel-instance'
import type { LaserSpec } from '../config/schema'
import { LASER_COMMANDS } from '../lib/pv-names'
import {
  makeFakeWebSocketContext,
  TestWebSocketProvider,
} from '@/test/ws-test-provider'

// A self-contained fixture (NOT read from lasers.yaml) so editing the real
// config never breaks this rendering test.
const NL2: LaserSpec = {
  laser: 'NL2',
  pvs: {
    connection: 'BI_NL2_CONN',
    fullPower: 'BI_NL2_FULLP',
    shutter: 'BI_NL2_SHUTTER',
    phdMean: 'AI_NL2_PHD_MEAN',
    regenState: 'BI_NL2_REGEN_STATE',
    regenTemp: 'AI_TEMP_NL2_REGEN',
    phd2Mean: 'AI_NL2_PHD2_MEAN',
    attenuator: 'AI_NL2_ATT',
    loadedWaveform: 'SI_NL2_LOADED_WAVEFORM',
  },
  triggerDelay: ['AI_NL2_TRIG_DELAY_CH1', 'AI_NL2_TRIG_DELAY_CH2'],
  mss: [
    { label: 'MSS 1', pv: 'BI_NL2_MSS_1' },
    { label: 'MSS 2', pv: 'BI_NL2_MSS_2' },
  ],
  moduleErrors: [{ label: 'REGEN', pv: 'BI_NL2_ERR_REGEN' }],
  chillers: [
    {
      label: 'PS1225:11',
      flow: 'AI_NL2_CHILLER_11_FLOW',
      temp: 'AI_NL2_CHILLER_11_TEMP',
      level: 'AI_NL2_CHILLER_11_LEVEL',
    },
  ],
  flashlamps: [
    { label: '22 Ch1', pv: 'SI_NL2_FL_22_CH1' },
    { label: '22 Ch2', pv: 'SI_NL2_FL_22_CH2' },
  ],
  modbox: ['BI_NL2_MODBOX_1'],
  delayPresets: [50, 500, 700, 790],
  commands: LASER_COMMANDS,
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
    expect(screen.getByText('Waveform Preset')).toBeInTheDocument()
  })

  it('hides sections whose device bank is empty', () => {
    renderSpec({ ...NL2, chillers: [], flashlamps: [], modbox: [] })
    // General + Regen always render…
    expect(screen.getByText('Shutter Position')).toBeInTheDocument()
    expect(screen.getByText('Regen SY3PL50M:32')).toBeInTheDocument()
    // …empty banks drop their whole section.
    expect(screen.queryByText('Chiller PS1225:11')).not.toBeInTheDocument()
    expect(screen.queryByText('Flashlamps State')).not.toBeInTheDocument()
    expect(screen.queryByText('Modbox State')).not.toBeInTheDocument()
  })
})
