import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { L4OpcpaView } from './l4-opcpa-view'
import type { LaserSpec } from '../config/schema'
import { LASER_COMMANDS } from '../lib/pv-names'
import {
  makeFakeWebSocketContext,
  TestWebSocketProvider,
} from '@/test/ws-test-provider'

// Minimal self-contained spec (NOT read from lasers.yaml). Section banks are
// empty so the rendered panel stays light for this layout-focused test.
function makeSpec(laser: string): LaserSpec {
  return {
    laser,
    pvs: {
      connection: `BI_${laser}_CONN`,
      fullPower: `BI_${laser}_FULLP`,
      shutter: `BI_${laser}_SHUTTER`,
      phdMean: `AI_${laser}_PHD_MEAN`,
      regenState: `BI_${laser}_REGEN_STATE`,
      regenTemp: `AI_TEMP_${laser}_REGEN`,
      phd2Mean: `AI_${laser}_PHD2_MEAN`,
      attenuator: `AI_${laser}_ATT`,
      loadedWaveform: `SI_${laser}_LOADED_WAVEFORM`,
    },
    triggerDelay: [`AI_${laser}_TRIG_DELAY_CH1`],
    mss: [`BI_${laser}_MSS_1`],
    moduleErrors: [{ label: 'REGEN', pv: `BI_${laser}_ERR_REGEN` }],
    chillers: [],
    flashlamps: [],
    modbox: [],
    delayPresets: [50, 500],
    commands: LASER_COMMANDS,
  }
}

function renderView(specs: readonly LaserSpec[]) {
  const ws = makeFakeWebSocketContext()
  return render(
    <TestWebSocketProvider value={ws.context}>
      <L4OpcpaView specs={specs} />
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

describe('L4OpcpaView', () => {
  it('does not render the panel switcher when only one laser is present', () => {
    renderView([makeSpec('NL2')])
    expect(
      screen.queryByRole('group', { name: /laser panel switcher/i }),
    ).not.toBeInTheDocument()
  })

  it('renders the switcher and pages between panels when several lasers are present', async () => {
    const user = userEvent.setup()
    const { container } = renderView([makeSpec('NL2'), makeSpec('NL3')])

    expect(
      screen.getByRole('group', { name: /laser panel switcher/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('1 of 2')).toBeInTheDocument()

    // The first slot starts active.
    const slots = () => Array.from(container.querySelectorAll('[data-active]'))
    expect(slots().map((s) => s.getAttribute('data-active'))).toEqual([
      'true',
      'false',
    ])

    await user.click(screen.getByRole('button', { name: /next laser panel/i }))

    expect(screen.getByText('2 of 2')).toBeInTheDocument()
    expect(slots().map((s) => s.getAttribute('data-active'))).toEqual([
      'false',
      'true',
    ])
  })

  it('renders a misconfiguration notice and no switcher when specs is empty', () => {
    renderView([])
    expect(
      screen.getByText(/no laser panels are configured/i),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('group', { name: /laser panel switcher/i }),
    ).not.toBeInTheDocument()
  })
})
