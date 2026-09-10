'use client'

import { usePalette } from '@/lib/palette/context'
import { isPaletteId, PALETTES } from '@/lib/palette/palette'

import styles from './palette-select.module.css'

/**
 * Picks the colour palette, for operators wearing laser-safety goggles that
 * filter the colours the panel signals with. See `lib/palette/palette.ts`.
 *
 * Rendered in the header, which only exists on the authenticated module
 * pages — the palette itself applies everywhere, but this is the one place it
 * can be changed.
 */
export function PaletteSelect() {
  const { palette, setPalette } = usePalette()

  return (
    <label className={styles.wrapper}>
      <span className={styles.label}>Color palette</span>
      <select
        className={styles.select}
        value={palette}
        onChange={(e) => {
          // The union is narrow and the options come from it, so anything
          // else means the DOM was tampered with — ignore rather than store.
          if (isPaletteId(e.target.value)) setPalette(e.target.value)
        }}
      >
        {PALETTES.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
    </label>
  )
}
