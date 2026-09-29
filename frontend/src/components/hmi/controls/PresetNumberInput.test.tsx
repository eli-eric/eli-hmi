import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PresetNumberInput } from './PresetNumberInput'

const ORIGINAL_FETCH = globalThis.fetch

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  vi.unstubAllEnvs()
})

function renderInput() {
  render(
    <PresetNumberInput
      label="Trigger Delay"
      presets={[50, 500, 700, 790]}
      pvName="CMD_NL2_SET_DELAY"
    />,
  )
}

describe('PresetNumberInput', () => {
  it('renders a chip per preset and a disabled Confirm before any staging', () => {
    renderInput()
    expect(screen.getByRole('button', { name: '50' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '500' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '700' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '790' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Confirm/ })).toBeDisabled()
  })

  it('applies a preset immediately on chip click (no Confirm needed)', async () => {
    const spy = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
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

  it('enables Confirm once a valid custom value is typed', async () => {
    const user = userEvent.setup()
    renderInput()
    expect(screen.getByRole('button', { name: /Confirm/ })).toBeDisabled()
    await user.type(screen.getByLabelText(/custom/i), '650')
    expect(screen.getByRole('button', { name: /Confirm/ })).not.toBeDisabled()
  })

  it('POSTs to /pv/<pvName> with the custom value when Confirm is clicked', async () => {
    const spy = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    globalThis.fetch = spy as unknown as typeof fetch
    const user = userEvent.setup()
    renderInput()

    await user.type(screen.getByLabelText(/custom/i), '500')
    await user.click(screen.getByRole('button', { name: /Confirm/ }))

    await waitFor(() => expect(spy).toHaveBeenCalled())
    expect(spy.mock.calls[0][0]).toBe(
      'http://localhost:8080/pv/CMD_NL2_SET_DELAY',
    )
    const init = spy.mock.calls[0][1] as RequestInit
    expect(JSON.parse(init.body as string)).toEqual({ value: 500 })
  })

  it('disables Confirm again when the custom field is cleared', async () => {
    const user = userEvent.setup()
    renderInput()
    const input = screen.getByLabelText(/custom/i)
    await user.type(input, '790')
    expect(screen.getByRole('button', { name: /Confirm/ })).not.toBeDisabled()
    await user.clear(input)
    expect(screen.getByRole('button', { name: /Confirm/ })).toBeDisabled()
  })

  it('disables Confirm when the staged value is out of range', async () => {
    const user = userEvent.setup()
    render(
      <PresetNumberInput
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

  it('re-enables the presets and reports the failure when a write is rejected', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: false, error: 'CA disconnected' }), {
          status: 502,
        }),
    ) as unknown as typeof fetch

    render(
      <PresetNumberInput
        label="Set Trigger Delay"
        presets={[790]}
        pvName="AI_D"
      />,
    )
    await userEvent.setup().click(screen.getByRole('button', { name: '790' }))

    await waitFor(() =>
      expect(screen.getByText(/CA disconnected/i)).toBeInTheDocument(),
    )
    // The control must be usable again — a failed write is not a dead end.
    expect(screen.getByRole('button', { name: '790' })).toBeEnabled()
  })

  it('clears a previous failure once the operator types a new value', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: false, error: 'CA disconnected' }), {
          status: 502,
        }),
    ) as unknown as typeof fetch

    const user = userEvent.setup()
    render(
      <PresetNumberInput
        label="Set Trigger Delay"
        presets={[790]}
        pvName="AI_D"
      />,
    )
    await user.click(screen.getByRole('button', { name: '790' }))
    await waitFor(() =>
      expect(screen.getByText(/CA disconnected/i)).toBeInTheDocument(),
    )

    await user.type(screen.getByRole('spinbutton'), '50')

    // A stale error must not outlive the attempt that produced it.
    expect(screen.queryByText(/CA disconnected/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirm/i })).toBeEnabled()
  })

  it('drops the "Custom" label when there are no presets, keeping the field named', () => {
    // With presets, the field is the custom alternative to them.
    const { rerender } = render(
      <PresetNumberInput
        label="Set Trigger Delay"
        presets={[50, 790]}
        pvName="CMD_NL2_SET_DELAY"
      />,
    )
    expect(screen.getByLabelText(/custom/i)).toBeInTheDocument()

    // Without them there is nothing to be custom relative to, so the word
    // goes — but the input still has an accessible name.
    rerender(
      <PresetNumberInput
        label="YDFA current"
        presets={[]}
        pvName="CMD_NL2_SEND_YDFA_CURRENT"
      />,
    )
    expect(screen.queryByLabelText(/custom/i)).not.toBeInTheDocument()
    expect(
      screen.getByRole('spinbutton', { name: 'YDFA current' }),
    ).toBeInTheDocument()
  })

  it('ignores decimals on an integer field instead of refusing them', async () => {
    render(
      <PresetNumberInput label="Set Attenuator" presets={[]} pvName="AI_ATT" />,
    )
    const user = userEvent.setup()
    const field = screen.getByRole('spinbutton')
    await user.type(field, '2.5')

    expect(screen.queryByText(/integer required/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled()

    // Leaving the field shows what will actually be written, so the number on
    // screen is never one the machine will not receive.
    await user.tab()
    expect(field).toHaveValue(2)
  })

  it('accepts decimals up to the given precision, and no further', async () => {
    render(
      <PresetNumberInput
        label="YDFA current"
        presets={[]}
        pvName="CMD_NL2_SEND_YDFA_CURRENT"
        precision={1}
        min={0}
        max={6}
      />,
    )
    const user = userEvent.setup()
    const field = screen.getByRole('spinbutton')

    await user.type(field, '2.5')
    expect(screen.queryByText(/decimal place/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled()

    // Finer than the device resolves: the extra digits are ignored, not
    // refused — they are harmless, and blocking Confirm over them is friction.
    await user.clear(field)
    await user.type(field, '2.55')
    expect(screen.queryByText(/decimal place/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled()

    // Truncated, not rounded: 2.55 is 2.5, never 2.6. And the field says so
    // once it loses focus, so nothing hidden is sent.
    await user.tab()
    expect(field).toHaveValue(2.5)
  })

  it('still refuses text that is not a number at all', async () => {
    render(<PresetNumberInput label="YDFA current" presets={[]} pvName="P" />)
    const user = userEvent.setup()
    await user.type(screen.getByRole('spinbutton'), 'e5e')

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
  })

  it('writes the truncated value, not the typed one', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    render(
      <PresetNumberInput
        label="YDFA current"
        presets={[]}
        pvName="P"
        precision={1}
      />,
    )
    const user = userEvent.setup()
    await user.type(screen.getByRole('spinbutton'), '4.789')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      value: 4.7,
    })
  })

  it('steps by the precision, so the spinner only produces valid values', () => {
    const { rerender } = render(
      <PresetNumberInput
        label="YDFA current"
        presets={[]}
        pvName="P"
        precision={1}
      />,
    )
    expect(screen.getByRole('spinbutton')).toHaveAttribute('step', '0.1')

    rerender(
      <PresetNumberInput label="Set Attenuator" presets={[]} pvName="P" />,
    )
    expect(screen.getByRole('spinbutton')).toHaveAttribute('step', '1')
  })

  it('writes a fractional value as typed', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    render(
      <PresetNumberInput
        label="YDFA current"
        presets={[]}
        pvName="CMD_NL2_SEND_YDFA_CURRENT"
        precision={1}
        min={0}
        max={6}
      />,
    )
    const user = userEvent.setup()
    await user.type(screen.getByRole('spinbutton'), '2.5')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      value: 2.5,
    })
  })

  it('keeps the range check working for a fractional bound', async () => {
    render(
      <PresetNumberInput
        label="YDFA current"
        presets={[]}
        pvName="P"
        precision={1}
        min={0}
        max={6}
      />,
    )
    const user = userEvent.setup()
    await user.type(screen.getByRole('spinbutton'), '6.1')

    expect(screen.getByText(/out of range \(0\.\.6\)/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
  })
})
