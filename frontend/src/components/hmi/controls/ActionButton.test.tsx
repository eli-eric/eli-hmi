import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActionButton } from './ActionButton'

const ORIGINAL_FETCH = globalThis.fetch

function defer<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  vi.unstubAllEnvs()
})

describe('ActionButton', () => {
  it('POSTs to /pv/:name with the trigger value when clicked', async () => {
    const spy = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    globalThis.fetch = spy as unknown as typeof fetch
    const user = userEvent.setup()
    render(
      <ActionButton
        label="Start Laser"
        pvName="CMD_NL2_START_LASER"
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Start Laser' }))
    await waitFor(() => expect(spy).toHaveBeenCalled())
    expect(spy.mock.calls[0][0]).toBe(
      'http://localhost:8080/pv/CMD_NL2_START_LASER',
    )
    const init = spy.mock.calls[0][1] as RequestInit
    expect(JSON.parse(init.body as string)).toEqual({ value: 1 })
  })

  it('shows a pending state while the request is in flight and disables itself', async () => {
    const d = defer<Response>()
    globalThis.fetch = vi.fn(() => d.promise) as unknown as typeof fetch
    const user = userEvent.setup()
    render(<ActionButton label="Start Laser" pvName="CMD_NL2_START_LASER" />)

    const btn = screen.getByRole('button', { name: 'Start Laser' })
    await user.click(btn)

    await waitFor(() =>
      expect(btn).toHaveAttribute('data-state', 'pending'),
    )
    expect(btn).toBeDisabled()

    d.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    await waitFor(() =>
      expect(btn).toHaveAttribute('data-state', 'success'),
    )
  })

  it('shows an error state when the PV write returns {ok:false}', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: false, error: 'boom' }), {
          status: 200,
        }),
    ) as unknown as typeof fetch
    const user = userEvent.setup()
    render(<ActionButton label="Start Laser" pvName="CMD_NL2_START_LASER" />)
    const btn = screen.getByRole('button', { name: /Start Laser/ })
    await user.click(btn)
    await waitFor(() =>
      expect(btn).toHaveAttribute('data-state', 'error'),
    )
    // Error appears in a separate alert row, not in the button label.
    expect(screen.getByRole('alert')).toHaveTextContent(/boom|Failed/)
    expect(btn).toHaveTextContent('Start Laser')
  })

  it('shows a success state after a successful PV write', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
    ) as unknown as typeof fetch
    const user = userEvent.setup()
    render(<ActionButton label="Stop Laser" pvName="CMD_NL2_STOP_LASER" />)
    const btn = screen.getByRole('button', { name: 'Stop Laser' })
    await user.click(btn)
    await waitFor(() =>
      expect(btn).toHaveAttribute('data-state', 'success'),
    )
  })

  it('writes a custom value when value prop is provided (e.g. shutter close)', async () => {
    const spy = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    globalThis.fetch = spy as unknown as typeof fetch
    const user = userEvent.setup()
    render(
      <ActionButton
        label="Close Shutter"
        pvName="BI_NL2_SHUTTER"
        value={0}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Close Shutter' }))
    await waitFor(() => expect(spy).toHaveBeenCalled())
    const init = spy.mock.calls[0][1] as RequestInit
    expect(JSON.parse(init.body as string)).toEqual({ value: 0 })
  })
})
