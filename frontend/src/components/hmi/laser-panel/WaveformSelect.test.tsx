import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TooltipProvider } from '@/components/ui/tooltip/tooltip'
import {
  WaveformSelect,
  renderWaveformPreview,
  __resetWaveformCatalogForTests,
} from './WaveformSelect'

const ORIGINAL_FETCH = globalThis.fetch
const CATALOG = ['std-100ps', 'narrow-50ps', 'broad-200ps']

// WaveformSelect uses the Radix Tooltip for its preview affordance, which
// requires a TooltipProvider ancestor (the app mounts one globally).
function renderWaveform(laser = 'NL2') {
  return render(
    <TooltipProvider>
      <WaveformSelect laser={laser} />
    </TooltipProvider>,
  )
}

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
    renderWaveform()
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'std-100ps' })).toBeInTheDocument(),
    )
    expect(screen.getByRole('option', { name: 'narrow-50ps' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'broad-200ps' })).toBeInTheDocument()
  })

  it('disables Load until the user picks a waveform', async () => {
    mockFetch()
    const user = userEvent.setup()
    renderWaveform()
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'std-100ps' })).toBeInTheDocument(),
    )

    expect(screen.getByRole('button', { name: /Load/ })).toBeDisabled()

    await user.selectOptions(screen.getByRole('combobox'), 'narrow-50ps')
    expect(screen.getByRole('button', { name: /Load/ })).not.toBeDisabled()
  })

  it('POSTs CMD_<laser>_LOAD_WAVEFORM with the selected name on Load click', async () => {
    const spy = mockFetch()
    const user = userEvent.setup()
    renderWaveform()
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'std-100ps' })).toBeInTheDocument(),
    )

    await user.selectOptions(screen.getByRole('combobox'), 'broad-200ps')
    await user.click(screen.getByRole('button', { name: /Load/ }))

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

  it('exposes an accessible, keyboard-focusable preview trigger', async () => {
    mockFetch()
    renderWaveform()
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'std-100ps' })).toBeInTheDocument(),
    )

    const trigger = screen.getByRole('button', { name: /preview/i })
    expect(trigger).toBeInTheDocument()
    trigger.focus()
    expect(trigger).toHaveFocus()
  })

  it('shows a "Preview unavailable" hint on the preview trigger', async () => {
    mockFetch()
    const user = userEvent.setup()
    renderWaveform()
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'std-100ps' })).toBeInTheDocument(),
    )

    await user.hover(screen.getByRole('button', { name: /preview/i }))
    // Radix renders an accessible mirror plus the visible content, so there can
    // be more than one match.
    const hints = await screen.findAllByText(/preview unavailable/i)
    expect(hints.length).toBeGreaterThan(0)
  })
})

describe('renderWaveformPreview', () => {
  it('renders a "Preview unavailable" node naming the waveform (no shape data yet)', () => {
    render(<div>{renderWaveformPreview('std-100ps')}</div>)
    const region = screen.getByText(/preview unavailable/i)
    expect(region).toBeInTheDocument()
    expect(within(region.closest('div') as HTMLElement).getByText(/std-100ps/)).toBeInTheDocument()
  })

  it('handles an empty selection without naming a waveform', () => {
    render(<div data-testid="wrap">{renderWaveformPreview('')}</div>)
    expect(screen.getByText(/preview unavailable/i)).toBeInTheDocument()
  })
})
