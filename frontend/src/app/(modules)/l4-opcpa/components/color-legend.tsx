import { FC } from 'react'
import styles from './color-legend.module.css'

/**
 * Status legend strip rendered above the laser grid. Mirrors the wireframe's
 * Color Labeling key: four tones combining colour (for normal-vision operators)
 * with a distinct border style (so the categories remain distinguishable when
 * operators wear laser-safety goggles that filter certain wavelengths).
 */
export const ColorLegend: FC = () => {
  const items: Array<{ tone: string; label: string }> = [
    { tone: 'positive-neutral', label: 'POSITIVE NEUTRAL' },
    { tone: 'negative-neutral', label: 'NEGATIVE NEUTRAL' },
    { tone: 'positive-important', label: 'POSITIVE IMPORTANT' },
    { tone: 'negative-important', label: 'NEGATIVE IMPORTANT' },
  ]
  return (
    <div className={styles.legend} aria-label="Status legend">
      {items.map((i) => (
        <div key={i.tone} className={styles.item}>
          <span className={styles.swatch} data-tone={i.tone}>
            {i.label}
          </span>
        </div>
      ))}
    </div>
  )
}
