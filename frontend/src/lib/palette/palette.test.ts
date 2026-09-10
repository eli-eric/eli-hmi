import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  applyPalette,
  DEFAULT_PALETTE,
  getPalette,
  getServerPalette,
  isPaletteId,
  PALETTES,
  PALETTE_ATTRIBUTE,
  PALETTE_BOOTSTRAP_SCRIPT,
  PALETTE_STORAGE_KEY,
  setStoredPalette,
  subscribePalette,
} from './palette'

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.removeAttribute(PALETTE_ATTRIBUTE)
})

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
  document.documentElement.removeAttribute(PALETTE_ATTRIBUTE)
})

describe('palette store', () => {
  it('defaults to no palette when nothing is stored', () => {
    expect(getPalette()).toBe(DEFAULT_PALETTE)
  })

  it('round-trips a choice through storage', () => {
    setStoredPalette('l4-goggles')
    expect(window.localStorage.getItem(PALETTE_STORAGE_KEY)).toBe('l4-goggles')
    expect(getPalette()).toBe('l4-goggles')
  })

  it('falls back to the default for a value it does not recognise', () => {
    // A palette removed in a later build, or a hand-edited value.
    window.localStorage.setItem(PALETTE_STORAGE_KEY, 'l9-goggles')
    expect(getPalette()).toBe(DEFAULT_PALETTE)
  })

  it('keeps working when the browser refuses storage', () => {
    // Private mode / blocked site data: the choice must still apply for this
    // page rather than throwing or being silently ignored.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })

    expect(() => setStoredPalette('l4-goggles')).not.toThrow()
    expect(getPalette()).toBe('l4-goggles')
  })

  it('notifies subscribers, including another tab writing the key', () => {
    const listener = vi.fn()
    const unsubscribe = subscribePalette(listener)

    setStoredPalette('l4-goggles')
    expect(listener).toHaveBeenCalledTimes(1)

    // Two panels open on one workstation must not disagree about whether the
    // operator is wearing goggles.
    window.dispatchEvent(
      new StorageEvent('storage', { key: PALETTE_STORAGE_KEY }),
    )
    expect(listener).toHaveBeenCalledTimes(2)

    // An unrelated key is not this store's business.
    window.dispatchEvent(new StorageEvent('storage', { key: 'something-else' }))
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    setStoredPalette('default')
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('renders the default on the server, where nothing can be stored', () => {
    expect(getServerPalette()).toBe(DEFAULT_PALETTE)
  })
})

describe('applyPalette', () => {
  it('sets the attribute, and removes it for the default palette', () => {
    applyPalette('l4-goggles')
    expect(document.documentElement.getAttribute(PALETTE_ATTRIBUTE)).toBe(
      'l4-goggles',
    )
    // Absence of the attribute IS the default palette: the tokens in :root
    // stay the single definition of "no palette applied".
    applyPalette(DEFAULT_PALETTE)
    expect(document.documentElement.hasAttribute(PALETTE_ATTRIBUTE)).toBe(false)
  })
})

describe('PALETTE_BOOTSTRAP_SCRIPT', () => {
  const run = () => new Function(PALETTE_BOOTSTRAP_SCRIPT)()

  it('applies a stored palette before React runs', () => {
    window.localStorage.setItem(PALETTE_STORAGE_KEY, 'l4-goggles')
    run()
    expect(document.documentElement.getAttribute(PALETTE_ATTRIBUTE)).toBe(
      'l4-goggles',
    )
  })

  it('leaves the document alone for the default, nothing stored, or junk', () => {
    for (const stored of [null, 'default', 'l9-goggles', '{}']) {
      document.documentElement.removeAttribute(PALETTE_ATTRIBUTE)
      if (stored === null) window.localStorage.clear()
      else window.localStorage.setItem(PALETTE_STORAGE_KEY, stored)
      run()
      expect(document.documentElement.hasAttribute(PALETTE_ATTRIBUTE)).toBe(
        false,
      )
    }
  })

  it('never throws, whatever the browser does with storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(run).not.toThrow()
  })

  it('is built from the constants, so the key and ids cannot drift', () => {
    expect(PALETTE_BOOTSTRAP_SCRIPT).toContain(PALETTE_STORAGE_KEY)
    expect(PALETTE_BOOTSTRAP_SCRIPT).toContain(PALETTE_ATTRIBUTE)
    for (const p of PALETTES) {
      expect(PALETTE_BOOTSTRAP_SCRIPT).toContain(p.id)
    }
  })
})

describe('isPaletteId', () => {
  it('accepts every declared palette and nothing else', () => {
    for (const p of PALETTES) expect(isPaletteId(p.id)).toBe(true)
    expect(isPaletteId('l9-goggles')).toBe(false)
    expect(isPaletteId(null)).toBe(false)
    expect(isPaletteId(1)).toBe(false)
  })
})
