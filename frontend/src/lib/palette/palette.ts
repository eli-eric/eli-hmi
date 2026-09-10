/**
 * Colour palettes.
 *
 * Operators in the laser hall wear safety goggles that filter the very
 * wavelengths the panel uses to signal trouble, so an alarm that is obvious to
 * the naked eye can be invisible to the person standing in front of the
 * machine. A palette does not change *what* is signalled — which tone applies
 * to which reading is decided in `severity-presentation.ts` and painted by the
 * tone layer, both untouched here — only what those tones look like.
 *
 * Mechanically a palette redefines the semantic colour tokens under
 * `:root[data-palette='…']` in `globals.css`. Nothing else in the app knows a
 * palette exists: every red thing follows, including error text and failed
 * writes, because those are equally unreadable through the goggles.
 *
 * The choice is per browser (a property of the person at the workstation, not
 * of the deployment) and is applied before first paint by
 * {@link PALETTE_BOOTSTRAP_SCRIPT} — a goggled operator must never watch the
 * panel repaint from red to magenta after every navigation.
 */

export const PALETTES = [
  { id: 'default', label: 'No goggles' },
  { id: 'l4-goggles', label: 'L4 goggles' },
] as const

export type PaletteId = (typeof PALETTES)[number]['id']

/** Applied when nothing is stored, or when what is stored makes no sense. */
export const DEFAULT_PALETTE: PaletteId = 'default'

export const PALETTE_STORAGE_KEY = 'eli-hmi.palette'

/** The attribute the tone layer's palette blocks key off. */
export const PALETTE_ATTRIBUTE = 'data-palette'

const PALETTE_IDS: readonly string[] = PALETTES.map((p) => p.id)

export function isPaletteId(value: unknown): value is PaletteId {
  return typeof value === 'string' && PALETTE_IDS.includes(value)
}

/**
 * The selection is external state — it lives in the browser, is shared with
 * every other tab on this workstation, and outlives any React tree — so it is
 * exposed as a store (`subscribe`/`getPalette`) for `useSyncExternalStore`
 * rather than mirrored into component state.
 */
type Listener = () => void
const listeners = new Set<Listener>()

/**
 * Used only when storage is unusable (private mode, blocked site data). The
 * choice then applies for this page's lifetime instead of being lost.
 */
let inMemory: PaletteId = DEFAULT_PALETTE

function emit(): void {
  listeners.forEach((listener) => listener())
}

/**
 * Current palette, falling back to the default for anything unusable — a
 * value left by an older build, a palette since removed, or a browser that
 * refuses storage. Never throws: a readable panel in the wrong palette beats
 * no panel.
 */
export function getPalette(): PaletteId {
  try {
    const stored = window.localStorage.getItem(PALETTE_STORAGE_KEY)
    if (stored === null) return inMemory
    return isPaletteId(stored) ? stored : DEFAULT_PALETTE
  } catch {
    return inMemory
  }
}

/** Server render: no browser, so nothing can have been chosen yet. */
export function getServerPalette(): PaletteId {
  return DEFAULT_PALETTE
}

/** Records the choice and tells every subscriber, in this tab and the others. */
export function setStoredPalette(palette: PaletteId): void {
  inMemory = palette
  try {
    window.localStorage.setItem(PALETTE_STORAGE_KEY, palette)
  } catch {
    // Ignored: `inMemory` still carries the choice for this page.
  }
  emit()
}

/**
 * `storage` fires only in the *other* tabs, so a second window open on the
 * same workstation follows along — two panels side by side must not disagree
 * about whether the operator is wearing goggles.
 */
export function subscribePalette(listener: Listener): () => void {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === PALETTE_STORAGE_KEY) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/**
 * Puts the palette on the document. The default palette is the *absence* of
 * the attribute rather than a value of its own, so the base tokens in `:root`
 * stay the single definition of "no palette applied".
 */
export function applyPalette(palette: PaletteId): void {
  const root = document.documentElement
  if (palette === DEFAULT_PALETTE) root.removeAttribute(PALETTE_ATTRIBUTE)
  else root.setAttribute(PALETTE_ATTRIBUTE, palette)
}

/**
 * The same logic as {@link readStoredPalette} + {@link applyPalette}, as a
 * string for a blocking inline script in the document head. React cannot do
 * this: the attribute has to be on `<html>` before the first paint, which is
 * long before hydration.
 *
 * Built from the constants above rather than written out, so the storage key
 * and the palette ids cannot drift apart from the module that owns them.
 */
export const PALETTE_BOOTSTRAP_SCRIPT = [
  'try{',
  `var p=localStorage.getItem(${JSON.stringify(PALETTE_STORAGE_KEY)});`,
  `if(${JSON.stringify(PALETTE_IDS)}.indexOf(p)>-1`,
  `&&p!==${JSON.stringify(DEFAULT_PALETTE)})`,
  `document.documentElement.setAttribute(${JSON.stringify(
    PALETTE_ATTRIBUTE,
  )},p);`,
  '}catch(e){}',
].join('')
