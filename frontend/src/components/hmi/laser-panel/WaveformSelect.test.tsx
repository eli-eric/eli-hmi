import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  WaveformSelect,
  __resetWaveformCatalogForTests,
} from './WaveformSelect'

const ORIGINAL_FETCH = globalThis.fetch
const CATALOG = ['std-100ps', 'narrow-50ps', 'broad-200ps']

function mockFetch() {
  const spy = vi.fn<typeof fetch>(async (input) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.endsWith('/waveforms')) {
      return new Response(JSON.stringify(CATALOG), { status: 200 })
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  })
  globalThis.fetch = spy as unknown as typeof fetch
  return spy
}

beforeEach(() => {
  __resetWaveformCatalogForTests()
})

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  vi.unstubAllEnvs()
  __resetWaveformCatalogForTests()
})

describe('WaveformSelect', () => {
  it('fetches /waveforms and renders one option per waveform', async () => {
    mockFetch()
    render(<WaveformSelect pvName="CMD_NL2_LOAD_WAVEFORM" />)
    await waitFor(() =>
      expect(
        screen.getByRole('option', { name: 'std-100ps' }),
      ).toBeInTheDocument(),
    )
    expect(
      screen.getByRole('option', { name: 'narrow-50ps' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('option', { name: 'broad-200ps' }),
    ).toBeInTheDocument()
  })

  it('disables waveform setting until the user picks a waveform', async () => {
    mockFetch()
    const user = userEvent.setup()
    render(<WaveformSelect pvName="CMD_NL2_LOAD_WAVEFORM" />)
    await waitFor(() =>
      expect(
        screen.getByRole('option', { name: 'std-100ps' }),
      ).toBeInTheDocument(),
    )

    expect(screen.getByRole('button', { name: /CONFIRM/i })).toBeDisabled()

    await user.selectOptions(screen.getByRole('combobox'), 'narrow-50ps')
    expect(screen.getByRole('button', { name: /CONFIRM/i })).not.toBeDisabled()
  })

  it('refuses to send when the device offers nothing', async () => {
    // The other way there is nothing to send: a device that answers with an
    // empty catalog, or stops answering. The selection alone does not cover
    // it — a list that empties under a choice already made would leave the
    // button live, offering a name the device no longer has.
    globalThis.fetch = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify([]), { status: 200 }),
    ) as unknown as typeof fetch
    render(<WaveformSelect pvName="CMD_NL2_LOAD_WAVEFORM" />)
    await waitFor(() =>
      expect(screen.getByRole('combobox')).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: /CONFIRM/i })).toBeDisabled()
  })

  it('POSTs the configured pvName with the selected name on Set Waveform click', async () => {
    const spy = mockFetch()
    const user = userEvent.setup()
    render(<WaveformSelect pvName="CMD_NL2_LOAD_WAVEFORM" />)
    await waitFor(() =>
      expect(
        screen.getByRole('option', { name: 'std-100ps' }),
      ).toBeInTheDocument(),
    )

    await user.selectOptions(screen.getByRole('combobox'), 'broad-200ps')
    await user.click(screen.getByRole('button', { name: /CONFIRM/i }))

    await waitFor(() => {
      const seqCall = spy.mock.calls.find(([url]) =>
        String(url).includes('/pv/CMD_NL2_LOAD_WAVEFORM'),
      )
      expect(seqCall).toBeDefined()
      const init = seqCall![1] as RequestInit
      expect(JSON.parse(init.body as string)).toEqual({
        value: 'broad-200ps',
      })
    })
  })

  it("fetches the catalog from the laser's configured endpoint", async () => {
    const spy = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify(['nl5-a', 'nl5-b']), { status: 200 }),
    )
    globalThis.fetch = spy as unknown as typeof fetch

    render(
      <WaveformSelect
        pvName="CMD_NL5_LOAD_WAVEFORM"
        catalogUrl="https://modbox-nl5.lcs.local/api/waveforms"
      />,
    )

    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'nl5-a' })).toBeInTheDocument(),
    )
    expect(String(spy.mock.calls[0][0])).toBe(
      'https://modbox-nl5.lcs.local/api/waveforms',
    )
  })

  it('does not send our session token to a third-party server', async () => {
    const spy = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify([]), { status: 200 }),
    )
    globalThis.fetch = spy as unknown as typeof fetch

    render(
      <WaveformSelect
        pvName="CMD_NL5_LOAD_WAVEFORM"
        catalogUrl="https://modbox-nl5.lcs.local/api/waveforms"
      />,
    )

    await waitFor(() => expect(spy).toHaveBeenCalled())
    const headers = new Headers(spy.mock.calls[0][1]?.headers)
    // The endpoint belongs to the modbox, not to us: handing it a bearer
    // token for our gateway would leak a credential to another host.
    expect(headers.has('Authorization')).toBe(false)
  })

  it("keeps each laser's catalog separate", async () => {
    const spy = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      return new Response(
        JSON.stringify(url.includes('nl2') ? ['nl2-only'] : ['nl5-only']),
        { status: 200 },
      )
    })
    globalThis.fetch = spy as unknown as typeof fetch

    const { unmount } = render(
      <WaveformSelect
        pvName="CMD_NL2_LOAD_WAVEFORM"
        catalogUrl="https://modbox-nl2.lcs.local/api/waveforms"
      />,
    )
    await waitFor(() =>
      expect(
        screen.getByRole('option', { name: 'nl2-only' }),
      ).toBeInTheDocument(),
    )
    unmount()

    // A cache shared across lasers would serve NL2's waveforms here — and a
    // waveform from the wrong laser is a value nobody should be able to load.
    render(
      <WaveformSelect
        pvName="CMD_NL5_LOAD_WAVEFORM"
        catalogUrl="https://modbox-nl5.lcs.local/api/waveforms"
      />,
    )
    await waitFor(() =>
      expect(
        screen.getByRole('option', { name: 'nl5-only' }),
      ).toBeInTheDocument(),
    )
    expect(screen.queryByRole('option', { name: 'nl2-only' })).toBeNull()
  })

  it('keeps the prompt out of the list of waveforms', async () => {
    // It names what the control is for; it is not a waveform anyone can load.
    mockFetch()
    render(<WaveformSelect pvName="CMD_NL2_LOAD_WAVEFORM" />)
    await waitFor(() =>
      expect(
        screen.getByRole('option', { name: 'std-100ps' }),
      ).toBeInTheDocument(),
    )

    // Queried from the DOM, not by role: `hidden` is precisely what takes it
    // out of the list the browser offers, and out of the a11y tree with it.
    const select = screen.getByRole('combobox')
    const prompt = select.querySelector('option[value=""]')
    expect(prompt).toHaveTextContent('Select Waveform')
    expect(prompt).toBeDisabled()
    expect(prompt).toHaveAttribute('hidden')
  })

  it('will not confirm until a waveform is chosen', async () => {
    mockFetch()
    render(<WaveformSelect pvName="CMD_NL2_LOAD_WAVEFORM" />)
    await waitFor(() =>
      expect(
        screen.getByRole('option', { name: 'std-100ps' }),
      ).toBeInTheDocument(),
    )

    expect(screen.getByRole('button', { name: 'CONFIRM' })).toBeDisabled()

    await userEvent
      .setup()
      .selectOptions(screen.getByRole('combobox'), 'std-100ps')
    expect(screen.getByRole('button', { name: 'CONFIRM' })).toBeEnabled()
  })
})
