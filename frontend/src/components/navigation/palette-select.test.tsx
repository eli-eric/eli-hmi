import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { PaletteProvider } from '@/lib/palette/context'
import { PALETTE_ATTRIBUTE, PALETTE_STORAGE_KEY } from '@/lib/palette/palette'

import { PaletteSelect } from './palette-select'

const renderSelect = () =>
  render(
    <PaletteProvider>
      <PaletteSelect />
    </PaletteProvider>,
  )

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.removeAttribute(PALETTE_ATTRIBUTE)
})

afterEach(() => {
  window.localStorage.clear()
  document.documentElement.removeAttribute(PALETTE_ATTRIBUTE)
})

describe('PaletteSelect', () => {
  it('offers every palette and starts on the default', () => {
    renderSelect()
    const select = screen.getByRole('combobox', { name: /color palette/i })
    expect(
      [...select.querySelectorAll('option')].map((o) => o.textContent),
    ).toEqual(['No goggles', 'L4 goggles'])
    expect(select).toHaveValue('default')
  })

  it('shows the palette already stored on this workstation', () => {
    window.localStorage.setItem(PALETTE_STORAGE_KEY, 'l4-goggles')
    renderSelect()
    expect(
      screen.getByRole('combobox', { name: /color palette/i }),
    ).toHaveValue('l4-goggles')
  })

  it('applies and persists a choice', async () => {
    renderSelect()
    const user = userEvent.setup()

    await user.selectOptions(
      screen.getByRole('combobox', { name: /color palette/i }),
      'l4-goggles',
    )

    // The document attribute is what the tone layer keys off…
    expect(document.documentElement.getAttribute(PALETTE_ATTRIBUTE)).toBe(
      'l4-goggles',
    )
    // …and the choice outlives this page, so a goggled operator does not
    // re-select it after every reload.
    expect(window.localStorage.getItem(PALETTE_STORAGE_KEY)).toBe('l4-goggles')
  })

  it('clears the attribute again when switching back', async () => {
    window.localStorage.setItem(PALETTE_STORAGE_KEY, 'l4-goggles')
    renderSelect()
    const user = userEvent.setup()

    await user.selectOptions(
      screen.getByRole('combobox', { name: /color palette/i }),
      'default',
    )

    expect(document.documentElement.hasAttribute(PALETTE_ATTRIBUTE)).toBe(false)
    expect(window.localStorage.getItem(PALETTE_STORAGE_KEY)).toBe('default')
  })
})
