import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GeneralSection } from './GeneralSection'
import {
  makeFakeWebSocketContext,
  TestWebSocketProvider,
} from '@/test/ws-test-provider'

const ORIGINAL_FETCH = globalThis.fetch

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'localhost:8080')
})

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  vi.unstubAllEnvs()
})

async function setup() {
  const ws = makeFakeWebSocketContext()
  render(
    <TestWebSocketProvider value={ws.context}>
      <GeneralSection
        laser="NL2"
        mssCount={3}
        moduleErrors={['REGEN', 'CHILLER_11']}
      />
    </TestWebSocketProvider>,
  )
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
      ws.push('BI_NL2_ERR_REGEN', 0)
      ws.push('BI_NL2_ERR_CHILLER_11', 1)
    })

    expect(screen.getByText('Overview')).toBeInTheDocument()
    expect(screen.getByText('CONN')).toBeInTheDocument()
    expect(screen.getByText('FULLP')).toBeInTheDocument()
    expect(screen.getByText('MSS')).toBeInTheDocument()
    expect(screen.getByText('ERR')).toBeInTheDocument()
    expect(screen.getByText('YES')).toBeInTheDocument()
    expect(screen.getByText('NO')).toBeInTheDocument()
    expect(screen.getByText('3 / 3')).toBeInTheDocument()
    // 1 module is in error out of 2 total.
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
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
      screen.getByRole('button', { name: 'Alignment Mode' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'System Standby' }),
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
      ws.push('BI_NL2_ERR_REGEN', 0)
      ws.push('BI_NL2_ERR_CHILLER_11', 1)
    })
    const user = userEvent.setup()
    await user.click(
      screen.getByRole('button', { name: 'Toggle module errors detail' }),
    )

    expect(screen.getByText('REGEN')).toBeInTheDocument()
    expect(screen.getByText('CHILLER_11')).toBeInTheDocument()
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
