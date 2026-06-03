import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PresetIntegerInput } from './PresetIntegerInput'

const ORIGINAL_FETCH = globalThis.fetch

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'localhost:8080')
})

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  vi.unstubAllEnvs()
})

function renderInput() {
  render(
    <PresetIntegerInput
      label="Trigger Delay"
      presets={[50, 500, 700, 790]}
      pvName="CMD_NL2_SET_DELAY"
    />,
  )
}

describe('PresetIntegerInput', () => {
  it('renders a chip per preset and a disabled Confirm before any staging', () => {
    renderInput()
    expect(screen.getByRole('button', { name: '50' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '500' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '700' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '790' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Confirm/ })).toBeDisabled()
  })

  it('applies a preset immediately on chip click (no Confirm step)', async () => {
    const spy = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    globalThis.fetch = spy as unknown as typeof fetch
    const user = userEvent.setup()
    renderInput()

    await user.click(screen.getByRole('button', { name: '790' }))

    await waitFor(() => expect(spy).toHaveBeenCalled())
    expect(spy.mock.calls[0][0]).toBe(
      'http://localhost:8080/pv/CMD_NL2_SET_DELAY',
    )
    const init = spy.mock.calls[0][1] as RequestInit
    expect(JSON.parse(init.body as string)).toEqual({ value: 790 })
  })

  it('stages a custom value from the integer input field and enables Confirm', async () => {
    const user = userEvent.setup()
    renderInput()
    expect(screen.getByRole('button', { name: /Confirm/ })).toBeDisabled()
    await user.type(screen.getByLabelText(/custom/i), '650')
    expect(screen.getByRole('button', { name: /Confirm/ })).not.toBeDisabled()
  })

  it('POSTs the custom value to /pv/<pvName> when Confirm is clicked', async () => {
    const spy = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    globalThis.fetch = spy as unknown as typeof fetch
    const user = userEvent.setup()
    renderInput()

    await user.type(screen.getByLabelText(/custom/i), '650')
    await user.click(screen.getByRole('button', { name: /Confirm/ }))

    await waitFor(() => expect(spy).toHaveBeenCalled())
    expect(spy.mock.calls[0][0]).toBe(
      'http://localhost:8080/pv/CMD_NL2_SET_DELAY',
    )
    const init = spy.mock.calls[0][1] as RequestInit
    expect(JSON.parse(init.body as string)).toEqual({ value: 650 })
  })

  it('disables Confirm when the staged value is out of range', async () => {
    const user = userEvent.setup()
    render(
      <PresetIntegerInput
        label="Trigger Delay"
        presets={[50, 500, 700, 790]}
        pvName="CMD_NL2_SET_DELAY"
        min={0}
        max={1000}
      />,
    )
    await user.type(screen.getByLabelText(/custom/i), '-5')
    expect(screen.getByRole('button', { name: /Confirm/ })).toBeDisabled()
    expect(screen.getByText(/out of range/i)).toBeInTheDocument()
  })

  it('clears a stale custom value and validation error when a preset is clicked', async () => {
    // A never-resolving write keeps the write 'pending', so the success-effect
    // cleanup cannot fire — isolating the on-click cleanup as the only thing
    // that can clear the stale custom input.
    globalThis.fetch = vi.fn(
      () => new Promise<Response>(() => {}),
    ) as unknown as typeof fetch
    const user = userEvent.setup()
    render(
      <PresetIntegerInput
        label="Trigger Delay"
        presets={[50, 500, 700, 790]}
        pvName="CMD_NL2_SET_DELAY"
        min={0}
        max={1000}
      />,
    )

    // Stage an out-of-range custom value → validation error + retained value.
    await user.type(screen.getByLabelText(/custom/i), '-5')
    expect(screen.getByText(/out of range/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/custom/i)).toHaveValue(-5)

    // Clicking a preset applies immediately and wipes the stale custom state.
    await user.click(screen.getByRole('button', { name: '500' }))

    expect(screen.queryByText(/out of range/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/custom/i)).toHaveValue(null)
  })
})
