'use client'

import { FC } from 'react'
import styles from './panel-switcher.module.css'

interface PanelSwitcherProps {
  /** Display labels for each panel, in render order (e.g. laser names). */
  labels: readonly string[]
  activeIndex: number
  onChange: (index: number) => void
}

/**
 * Compact prev/next switcher shown above the laser grid. It only earns its keep
 * when several panels are rendered on a viewport too narrow/constrained to show
 * them side by side — CSS (see page.module.css) hides it on wide viewports and,
 * when shown, collapses the grid to one panel at a time. With a single panel it
 * is not rendered at all (the NL2-only case), so it stays inert there.
 */
export const PanelSwitcher: FC<PanelSwitcherProps> = ({
  labels,
  activeIndex,
  onChange,
}) => {
  const count = labels.length
  const goPrev = () => onChange((activeIndex - 1 + count) % count)
  const goNext = () => onChange((activeIndex + 1) % count)

  return (
    <div className={styles.switcher} role="group" aria-label="Laser panel switcher">
      <button
        type="button"
        className={styles.arrow}
        aria-label="Previous laser panel"
        onClick={goPrev}
      >
        <span aria-hidden="true">‹</span>
      </button>
      <span className={styles.current} aria-live="polite">
        <span className={styles.label}>{labels[activeIndex]}</span>
        <span className={styles.position}>
          {activeIndex + 1} of {count}
        </span>
      </span>
      <button
        type="button"
        className={styles.arrow}
        aria-label="Next laser panel"
        onClick={goNext}
      >
        <span aria-hidden="true">›</span>
      </button>
    </div>
  )
}
