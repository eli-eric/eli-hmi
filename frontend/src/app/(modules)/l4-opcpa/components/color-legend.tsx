import { FC } from 'react'
import type { Tone } from '@/lib/websocket/severity-presentation'
import styles from './color-legend.module.css'

/**
 * Status legend strip rendered above the laser grid.
 *
 * The swatches are painted by the same global tone layer as the panel itself
 * (`data-tone-surface` + `data-tone` — see `globals.css`), so the legend can
 * never drift from what the panel actually shows: changing a tone changes both.
 *
 * It lists what the panel uses today. Three further tones — `positive-neutral`,
 * `negative-neutral` and `negative-important` — are defined in the tone layer
 * but deliberately unused, so they are not advertised here.
 *
 * Still outstanding from the wireframe's Color Labeling key: each tone was to
 * carry a distinct BORDER STYLE as well as a colour, so the categories stay
 * distinguishable for operators wearing laser-safety goggles that filter
 * certain wavelengths. Only `unknown` (dotted) does that today; the rest is
 * deferred to the colour-palette selection work.
 */
const ITEMS: Array<{ tone?: Tone; label: string; meaning: string }> = [
  { label: 'NEUTRAL', meaning: 'normal reading — no alarm' },
  {
    tone: 'positive-important',
    label: 'GOOD',
    meaning: 'connected / at full power / no faults',
  },
  { tone: 'warning', label: 'MINOR', meaning: 'EPICS MINOR alarm' },
  { tone: 'error', label: 'MAJOR', meaning: 'EPICS MAJOR alarm' },
  {
    tone: 'invalid',
    label: 'INVALID',
    meaning: 'reading cannot be trusted (INVALID severity or PV disconnected)',
  },
  {
    tone: 'unknown',
    label: 'NO DATA',
    meaning: 'nothing received yet, or the backend link is down',
  },
]

export const ColorLegend: FC = () => (
  <div className={styles.legend} aria-label="Status legend">
    {ITEMS.map((i) => (
      <div key={i.label} className={styles.item}>
        <span
          className={styles.swatch}
          data-tone-surface="chip"
          data-tone={i.tone}
          title={i.meaning}
        >
          {i.label}
        </span>
      </div>
    ))}
  </div>
)
