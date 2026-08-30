import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GeneralSection } from './GeneralSection'
import type { LabeledPv } from '@/app/(modules)/l4-opcpa/config/schema'
import {
  LASER_COMMANDS,
  type LaserCommand,
} from '@/app/(modules)/l4-opcpa/lib/pv-names'
import {
  makeFakeWebSocketContext,
  TestWebSocketProvider,
} from '@/test/ws-test-provider'

const ORIGINAL_FETCH = globalThis.fetch

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  vi.unstubAllEnvs()
})

const MODULE_ERRORS: LabeledPv[] = [
  { label: 'REGEN', pv: 'BI_NL2_ERR_REGEN' },
  { label: 'CHILLER_11', pv: 'BI_NL2_ERR_CHILLER_11' },
]

const MSS: LabeledPv[] = [
  { label: 'MSS 1', pv: 'BI_NL2_MSS_1' },
  { label: 'MSS 2', pv: 'BI_NL2_MSS_2' },
  { label: 'MSS 3', pv: 'BI_NL2_MSS_3' },
]

function baseProps(commands: readonly LaserCommand[] = LASER_COMMANDS) {
  return {
    laser: 'NL2',
    connectionPv: 'BI_NL2_CONN',
    fullPowerPv: 'BI_NL2_FULLP',
    shutterPv: 'BI_NL2_SHUTTER',
    phdMeanPv: 'AI_NL2_PHD_MEAN',
    mss: MSS,
    moduleErrors: MODULE_ERRORS,
    commands,
  }
}

function renderGeneral(commands?: readonly LaserCommand[]) {
  const ws = makeFakeWebSocketContext()
  render(
    <TestWebSocketProvider value={ws.context}>
      <GeneralSection {...baseProps(commands)} />
    </TestWebSocketProvider>,
  )
  return ws
}

async function setup() {
  const ws = renderGeneral()
  await waitFor(() =>
    expect(ws.subscriptions.get('BI_NL2_CONN')?.size).toBe(1),
  )
  return ws
}

describe('GeneralSection', () => {
  it('renders the Overview row with CONN / FULLP / MSS / ERR cells', async () => {
    const ws = await setup()
    act(() => {
      ws.push('BI_NL2_CONN', 1)
      ws.push('BI_NL2_FULLP', 0)
      ws.push('BI_NL2_MSS_1', 1)
      ws.push('BI_NL2_MSS_2', 1)
      ws.push('BI_NL2_MSS_3', 1)
      ws.push('BI_NL2_ERR_REGEN', '0000')
      ws.push('BI_NL2_ERR_CHILLER_11', '1000')
    })

    expect(screen.getByText('Overview')).toBeInTheDocument()
    expect(screen.getByText('CONN')).toBeInTheDocument()
    expect(screen.getByText('FULLP')).toBeInTheDocument()
    expect(screen.getByText('MSS')).toBeInTheDocument()
    expect(screen.getByText('ERR')).toBeInTheDocument()
    // CONN=1 and MSS(all ok)=YES → two YES pills.
    expect(screen.getAllByText('YES')).toHaveLength(2)
    expect(screen.getByText('NO')).toBeInTheDocument()
    // MSS overall must be YES/NO, never a numeric count (spec).
    expect(screen.queryByText('3/3')).not.toBeInTheDocument()
    // ERR remains a numeric count: 1 module in error out of 2 total.
    expect(screen.getByText('1/2')).toBeInTheDocument()
  })

  it('shows MSS overall as NO (not a count) when any indicator is not ok', async () => {
    const ws = await setup()
    act(() => {
      ws.push('BI_NL2_MSS_1', 1)
      ws.push('BI_NL2_MSS_2', 0)
      ws.push('BI_NL2_MSS_3', 1)
    })
    // Only MSS has data here → exactly one NO pill, and no "2/3" count.
    expect(screen.getByText('NO')).toBeInTheDocument()
    expect(screen.queryByText('2/3')).not.toBeInTheDocument()
  })

  it('renders the Shutter row with an inline status pill', async () => {
    const ws = await setup()
    act(() => ws.push('BI_NL2_SHUTTER', 0))
    expect(screen.getByText('Shutter Position')).toBeInTheDocument()
    expect(screen.getByText('is CLOSED')).toBeInTheDocument()
  })

  it('renders the PHD readout row using the PV name as label', async () => {
    const ws = await setup()
    act(() => ws.push('AI_NL2_PHD_MEAN', { value: 12.345, units: 'a.u.' }))
    expect(screen.getByText('PHD1K000:49/Mean')).toBeInTheDocument()
    expect(screen.getByText('12.345')).toBeInTheDocument()
  })

  it('exposes lifecycle actions behind a single "General Actions" cog toggle', async () => {
    await setup()
    const user = userEvent.setup()
    expect(
      screen.queryByRole('button', { name: 'Start Laser' }),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'General Actions' }),
    )

    expect(
      screen.getByRole('button', { name: 'Start Laser' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Stop Laser' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Set to Alignment Mode' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Set to System Standby' }),
    ).toBeInTheDocument()
  })

  it('exposes Open/Close Shutter behind the shutter cog', async () => {
    await setup()
    const user = userEvent.setup()
    expect(
      screen.queryByRole('button', { name: 'Open Shutter' }),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Shutter actions' }),
    )

    expect(
      screen.getByRole('button', { name: 'Open Shutter' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Close Shutter' }),
    ).toBeInTheDocument()
  })

  it('expands the MSS detail list when the MSS overview cell is clicked', async () => {
    const ws = await setup()
    act(() => {
      ws.push('BI_NL2_MSS_1', 1)
      ws.push('BI_NL2_MSS_2', 0)
      ws.push('BI_NL2_MSS_3', 1)
    })
    const user = userEvent.setup()
    expect(screen.queryByText('MSS 1')).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Toggle MSS detail' }),
    )

    expect(screen.getByText('MSS 1')).toBeInTheDocument()
    expect(screen.getByText('MSS 2')).toBeInTheDocument()
    expect(screen.getByText('MSS 3')).toBeInTheDocument()
  })

  it('expands the Module Errors detail list and labels items by error name', async () => {
    const ws = await setup()
    act(() => {
      ws.push('BI_NL2_ERR_REGEN', '0000')
      ws.push('BI_NL2_ERR_CHILLER_11', '1000')
    })
    const user = userEvent.setup()
    await user.click(
      screen.getByRole('button', { name: 'Toggle module errors detail' }),
    )

    expect(screen.getByText('REGEN')).toBeInTheDocument()
    expect(screen.getByText('CHILLER_11')).toBeInTheDocument()
  })

  it('MSS/module-error rows are neutral (not ok/err coloured) when severity is none, showing the raw value', async () => {
    const ws = await setup()
    const user = userEvent.setup()
    act(() => {
      ws.push('BI_NL2_MSS_1', 1)
      ws.push('BI_NL2_MSS_2', 0)
      ws.push('BI_NL2_MSS_3', 1)
      ws.push('BI_NL2_ERR_REGEN', '0000')
      ws.push('BI_NL2_ERR_CHILLER_11', '1000')
    })

    await user.click(screen.getByRole('button', { name: 'Toggle MSS detail' }))
    const mss1 = screen.getByText('MSS 1').closest('li')
    const mss2 = screen.getByText('MSS 2').closest('li')
    expect(mss1?.querySelector('[data-state]')).toHaveAttribute(
      'data-state',
      'neutral',
    )
    expect(mss1).toHaveTextContent('1')
    expect(mss2?.querySelector('[data-state]')).toHaveAttribute(
      'data-state',
      'neutral',
    )
    expect(mss2).toHaveTextContent('0')

    await user.click(
      screen.getByRole('button', { name: 'Toggle module errors detail' }),
    )
    const regen = screen.getByText('REGEN').closest('li')
    const chiller = screen.getByText('CHILLER_11').closest('li')
    expect(regen?.querySelector('[data-state]')).toHaveAttribute(
      'data-state',
      'neutral',
    )
    expect(regen).toHaveTextContent('0000')
    expect(chiller?.querySelector('[data-state]')).toHaveAttribute(
      'data-state',
      'neutral',
    )
    expect(chiller).toHaveTextContent('1000')
  })

  it('overrides MSS / module-error item colour with EPICS severity, regardless of the raw value', async () => {
    const ws = await setup()
    const user = userEvent.setup()
    act(() => {
      // MAJOR alarm (severity 2) despite value=1, which would normally read "ok".
      ws.push('BI_NL2_MSS_1', { value: 1, severity: 2 })
      ws.push('BI_NL2_MSS_2', 1)
      ws.push('BI_NL2_MSS_3', 1)
      // Disconnected (ok:false) despite an "0000" ("no error") code.
      ws.push('BI_NL2_ERR_REGEN', {
        value: '0000',
        ok: false,
        error: 'CA disconnected',
      })
      ws.push('BI_NL2_ERR_CHILLER_11', '0000')
    })

    // Aggregate pills reflect the worst child severity, not just the raw
    // bit/code count: one MAJOR-alarm MSS indicator flips the whole overall
    // pill to NO/error tone even though 2 of 3 read value=1; one disconnected
    // module-error PV flips the ERR pill to the invalid tone and is counted
    // as a real problem (not silently folded into "unknown").
    const mssPill = screen
      .getByRole('button', { name: 'Toggle MSS detail' })
      .querySelector('[data-tone]')
    expect(mssPill).toHaveAttribute('data-tone', 'negative-important')
    expect(mssPill).toHaveTextContent('NO')

    const errPill = screen
      .getByRole('button', { name: 'Toggle module errors detail' })
      .querySelector('[data-tone]')
    expect(errPill).toHaveAttribute('data-tone', 'invalid')
    expect(errPill).toHaveTextContent('1/2')

    await user.click(screen.getByRole('button', { name: 'Toggle MSS detail' }))
    const mss1 = screen.getByText('MSS 1').closest('li')
    expect(mss1?.querySelector('[data-state]')).toHaveAttribute(
      'data-state',
      'err',
    )
    expect(mss1).toHaveTextContent('ERR')

    await user.click(
      screen.getByRole('button', { name: 'Toggle module errors detail' }),
    )
    const regen = screen.getByText('REGEN').closest('li')
    expect(regen?.querySelector('[data-state]')).toHaveAttribute(
      'data-state',
      'invalid',
    )
    // The raw "0000" code is suppressed in favour of the INVALID label —
    // showing "no error" for a disconnected PV would be misleading. The
    // unaffected CHILLER_11 row still shows its real "0000" code.
    expect(regen).toHaveTextContent('INVALID')
    expect(regen).not.toHaveTextContent('0000')
    expect(screen.getByText('CHILLER_11').closest('li')).toHaveTextContent(
      '0000',
    )
  })

  it('MSS overall pill shows the invalid tone as soon as one child is disconnected, even while the others are still unknown', async () => {
    const ws = await setup()
    act(() => {
      // Only one of three MSS PVs has reported in, and it's disconnected —
      // the aggregate should surface that as invalid, not sit on the
      // cold-start "<>" placeholder just because 2/3 are still unknown.
      ws.push('BI_NL2_MSS_1', { value: null, ok: false })
    })

    const mssPill = screen
      .getByRole('button', { name: 'Toggle MSS detail' })
      .querySelector('[data-tone]')
    expect(mssPill).toHaveAttribute('data-tone', 'invalid')
    expect(mssPill).toHaveTextContent('NO')
  })

  it('hides buttons for commands the laser does not expose', async () => {
    renderGeneral(['START_LASER', 'ALIGNMENT_MODE'])
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'General Actions' }))

    expect(
      screen.getByRole('button', { name: 'Start Laser' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Set to Alignment Mode' }),
    ).toBeInTheDocument()
    // Not listed → hidden.
    expect(
      screen.queryByRole('button', { name: 'Stop Laser' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Set to System Standby' }),
    ).not.toBeInTheDocument()
  })

  it('hides the General Actions cog entirely when no lifecycle commands are exposed', () => {
    renderGeneral([])
    expect(
      screen.queryByRole('button', { name: 'General Actions' }),
    ).not.toBeInTheDocument()
    // Shutter (a direct write, not a command) is unaffected.
    expect(
      screen.getByRole('button', { name: 'Shutter actions' }),
    ).toBeInTheDocument()
  })

  it('closes the cog panel automatically after a successful action', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
    ) as unknown as typeof fetch
    await setup()
    const user = userEvent.setup()

    await user.click(
      screen.getByRole('button', { name: 'General Actions' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Start Laser' }),
    )

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Start Laser' }),
      ).not.toBeInTheDocument(),
    )
  })
})
