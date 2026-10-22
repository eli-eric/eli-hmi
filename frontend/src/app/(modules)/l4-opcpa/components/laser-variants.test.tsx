import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { stringify } from 'yaml'
import {
  makeFakeWebSocketContext,
  TestWebSocketProvider,
} from '@/test/ws-test-provider'
import { parseLaserSpecs } from '../config/schema'
import { LaserPanelInstance } from './laser-panel-instance'

/**
 * Lasers that are not NL2.
 *
 * NL2 was the reference while the panel was built, and the screen quietly
 * assumed every laser looks like it: a Modbox, two photodiodes, and NL2's own
 * device ids printed in the row labels. A hall does not work that way — one
 * laser has no Modbox at all, another has a different set of modules — so what
 * a laser *has* and what its rows are *called* both come from its config.
 *
 * These go through the real parser into the real panel, because the thing
 * under test is what an operator sees, not what the schema accepts.
 */

/** A laser with everything NL2 has; drop or override any part of it. */
function laser(overrides: Record<string, unknown> = {}) {
  const base: Record<string, unknown> = {
    id: 'NL9',
    pvs: {
      connection: 'BI_NL9_CONN',
      fullPower: 'BI_NL9_FULLP',
      shutter: 'BI_NL9_SHUTTER',
      phdMean: 'PHD:1',
      regenState: 'SY:1',
      regenTemp: 'TK:1',
      phd2Mean: 'PHD:2',
      attenuator: 'ATT:1',
      loadedWaveform: 'WF:1',
    },
    triggerDelay: ['TRIG:1'],
    mss: [{ label: 'MSS 1', pv: 'BI_NL9_MSS_1' }],
    moduleErrors: [{ label: 'REGEN', pv: 'BI_NL9_ERR_REGEN' }],
    chillers: [{ label: 'C1', flow: 'f', temp: 't', level: 'l' }],
    flashlamps: [{ label: 'F1', pv: 'SI_NL9_FL_1' }],
    modbox: [{ label: 'Modbox 1', pv: 'BI_NL9_MODBOX_1' }],
    delayPresets: [50],
    sequences: [{ label: 'Start Laser', pv: 'SEQ:1', command: 'START_LASER' }],
    commands: { START_LASER: 'START_LASER' },
  }
  const pvsDrop = (overrides.pvsDrop as string[] | undefined) ?? []
  delete overrides.pvsDrop
  for (const name of pvsDrop) {
    delete (base.pvs as Record<string, unknown>)[name]
  }
  // Everything about one signal sits in that signal's own entry, so a test
  // that changes how a row reads writes it where the PV already is.
  const signals =
    (overrides.signals as Record<string, object> | undefined) ?? {}
  delete overrides.signals
  const pvs = base.pvs as Record<string, unknown>
  for (const [role, extra] of Object.entries(signals)) {
    pvs[role] = { pv: pvs[role], ...extra }
  }
  const dropped = (overrides.drop as string[] | undefined) ?? []
  delete overrides.drop
  for (const key of dropped) delete base[key]
  return { ...base, ...overrides }
}

function panel(overrides: Record<string, unknown> = {}) {
  const spec = parseLaserSpecs(stringify({ lasers: [laser(overrides)] }))[0]
  const ws = makeFakeWebSocketContext()
  render(
    <TestWebSocketProvider value={ws.context}>
      <LaserPanelInstance spec={spec} />
    </TestWebSocketProvider>,
  )
}

describe('a laser without a modbox', () => {
  it('has no modbox section', () => {
    panel({ drop: ['modbox'], pvsDrop: ['loadedWaveform'] })
    expect(screen.queryByText('Modbox State')).toBeNull()
    expect(screen.queryByText('Waveform Preset')).toBeNull()
  })

  it('still renders the rest of the panel', () => {
    panel({ drop: ['modbox'], pvsDrop: ['loadedWaveform'] })
    expect(screen.getByText('Overview')).toBeInTheDocument()
    expect(screen.getByText('Flashlamps State')).toBeInTheDocument()
  })
})

describe('a laser without a second photodiode', () => {
  it('has no second photodiode row', () => {
    panel({ pvsDrop: ['phd2Mean'] })
    expect(screen.queryByText('PHD1K000:48/Mean')).toBeNull()
    expect(screen.getByText('PHD1K000:49/Mean')).toBeInTheDocument()
  })
})

describe('the sequencer', () => {
  // Which sequences a laser has is the laser's business: the set was a
  // constant in the component, copied from the reference laser.
  it('lists the sequences the laser has', async () => {
    panel({
      sequences: [
        { label: 'Start Laser', pv: 'SEQ:1', command: 'START_LASER' },
        { label: 'Warm Up', pv: 'SEQ:2' },
      ],
    })
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Toggle Sequencer detail' }))
    const listed = screen.getByText('Warm Up').closest('ul')!
    // Several sequence names are also the names of the buttons that start
    // them, so this is scoped to the list.
    expect(within(listed).queryByText('Set to Alignment Mode')).toBeNull()
    expect(listed.querySelectorAll('li')).toHaveLength(2)
  })

  it('has no section when the laser runs none', () => {
    panel({ sequences: [] })
    expect(screen.queryByText('Sequencer')).toBeNull()
  })
})

describe('the write side of a device', () => {
  // A setpoint record is not a readback. The shutter opened by writing to the
  // record that reports its position only works where the two are one PV —
  // the mock backend — and does nothing in the hall.
  /** Did anything write to this PV? The name is encoded into the path. */
  const wrote = (spy: ReturnType<typeof vi.fn<typeof fetch>>, pv: string) =>
    spy.mock.calls.some(([url]) =>
      String(url).endsWith(`/pv/${encodeURIComponent(pv)}`),
    )

  const writeSpy = () => {
    const spy = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    globalThis.fetch = spy as unknown as typeof fetch
    return spy
  }

  it('opens the shutter through its own command', async () => {
    const spy = writeSpy()
    panel({
      commands: {
        START_LASER: 'START_LASER',
        OPEN_SHUTTER: { pv: 'L4-OPCPA-NL9:SH:SetPosition', value: 1 },
      },
    })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Shutter actions' }))
    await user.click(screen.getByRole('button', { name: 'Open Shutter' }))
    await waitFor(() =>
      expect(wrote(spy, 'L4-OPCPA-NL9:SH:SetPosition')).toBe(true),
    )
  })

  it('sets the attenuator through its own command', async () => {
    const spy = writeSpy()
    panel({
      commands: {
        START_LASER: 'START_LASER',
        SET_ATTENUATOR: 'L4-OPCPA-NL9:ATT:SetPosition',
      },
    })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Set attenuator' }))
    await user.type(screen.getByRole('spinbutton'), '1024')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(wrote(spy, 'L4-OPCPA-NL9:ATT:SetPosition')).toBe(true),
    )
  })
})

describe('units', () => {
  // What a reading is measured in follows from the reading, not from where it
  // is deployed: every zone's file used to carry the same seven lines.
  it('the component knows without being told', () => {
    panel()
    expect(screen.getByText('Flow (l/min)')).toBeInTheDocument()
    expect(screen.getByText('Temp (°C)')).toBeInTheDocument()
    expect(screen.getByText('Water (%)')).toBeInTheDocument()
  })
})

describe('row labels', () => {
  it('a laser names its own devices', () => {
    panel({
      signals: {
        phdMean: { label: 'PHD1K000:12/Mean' },
        regenState: { label: 'Regen SY9PL20M:07' },
        attenuator: { label: 'Atten. SM1:ATT3:22' },
      },
    })
    expect(screen.getByText('PHD1K000:12/Mean')).toBeInTheDocument()
    expect(screen.getByText('Regen SY9PL20M:07')).toBeInTheDocument()
    expect(screen.getByText('Atten. SM1:ATT3:22')).toBeInTheDocument()
    expect(screen.queryByText('Regen SY3PL50M:32')).toBeNull()
  })

  it('an unnamed row keeps its default', () => {
    panel({ signals: { phdMean: { label: 'PHD1K000:12/Mean' } } })
    expect(screen.getByText('Regen Temp TK6:44')).toBeInTheDocument()
  })
})
