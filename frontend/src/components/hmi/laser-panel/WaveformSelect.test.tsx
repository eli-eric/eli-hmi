import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WaveformSelect, __resetWaveformCatalogForTests } from './WaveformSelect'

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
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'localhost:8080')
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
    render(<WaveformSelect laser="NL2" />)
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'std-100ps' })).toBeInTheDocument(),
    )
    expect(screen.getByRole('option', { name: 'narrow-50ps' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'broad-200ps' })).toBeInTheDocument()
  })

  it('disables waveform setting until the user picks a waveform', async () => {
    mockFetch()
    const user = userEvent.setup()
    render(<WaveformSelect laser="NL2" />)
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'std-100ps' })).toBeInTheDocument(),
    )

    expect(screen.getByRole('button', { name: /CONFIRM/i })).toBeDisabled()

    await user.selectOptions(screen.getByRole('combobox'), 'narrow-50ps')
    expect(screen.getByRole('button', { name: /CONFIRM/i })).not.toBeDisabled()
  })

  it('POSTs CMD_<laser>_LOAD_WAVEFORM with the selected name on Set Waveform click', async () => {
    const spy = mockFetch()
    const user = userEvent.setup()
    render(<WaveformSelect laser="NL2" />)
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'std-100ps' })).toBeInTheDocument(),
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
})
