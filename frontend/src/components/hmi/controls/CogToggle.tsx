'use client'

import {
  FC,
  PropsWithChildren,
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { SettingsIcon } from '@/components/ui/icons'
import styles from './CogToggle.module.css'

interface CogToggleProps {
  /** aria-label for the cog button. */
  ariaLabel: string
  /** Optional inline label rendered next to the cog (e.g. "General Actions"). */
  inlineLabel?: ReactNode
}

/**
 * Context exposed by CogToggle to descendant write controls so they can
 * dismiss the panel after a successful action. Default is no-op so write
 * controls used outside a CogToggle keep working unchanged.
 */
const CogToggleContext = createContext<() => void>(() => {})

/** Descendants call this after a successful dispatch to close the parent
 * panel. No-op if not inside a CogToggle. */
export const useCogToggleClose = (): (() => void) =>
  useContext(CogToggleContext)

/**
 * Cog-icon button that toggles an inline panel of write actions. The panel
 * closes on Escape, on outside-click, and when a descendant write control
 * reports success via useCogToggleClose.
 */
export const CogToggle: FC<PropsWithChildren<CogToggleProps>> = ({
  ariaLabel,
  inlineLabel,
  children,
}) => {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLSpanElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  // Horizontal nudge (px) applied to keep the panel on-screen. The panel is
  // left-anchored (opens rightward from the cog into the page's empty space),
  // so it can only overflow the *right* viewport edge — never the left, where
  // the sidebar/content boundary lives. We measure after open and, if it spills
  // past the right edge, shift it back into the viewport.
  const [shiftX, setShiftX] = useState(0)

  const close = useCallback(() => setOpen(false), [])

  useLayoutEffect(() => {
    if (!open) {
      setShiftX(0)
      return
    }
    const panel = panelRef.current
    if (!panel) return
    const margin = 8
    // Measure the panel's natural (unshifted) edges by clearing any applied
    // transform first; reading getBoundingClientRect forces the reflow. This
    // keeps the effect convergent regardless of whether the transform is
    // reflected back in the measured rect.
    const applied = panel.style.transform
    panel.style.transform = ''
    const rect = panel.getBoundingClientRect()
    panel.style.transform = applied
    let next = 0
    if (rect.right > window.innerWidth - margin) {
      next = window.innerWidth - margin - rect.right
      // Never pull the left edge off the left viewport edge while fixing right.
      if (rect.left + next < margin) next = margin - rect.left
    }
    setShiftX((cur) => (cur === next ? cur : next))
  }, [open, shiftX])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        close()
      }
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open, close])

  return (
    <span className={styles.wrapper} ref={wrapperRef}>
      <button
        type="button"
        className={styles.button}
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <SettingsIcon />
        {inlineLabel ? (
          <span className={styles.inlineLabel}>{inlineLabel}</span>
        ) : null}
      </button>
      {open ? (
        <CogToggleContext.Provider value={close}>
          <div
            ref={panelRef}
            className={styles.panel}
            style={shiftX ? { transform: `translateX(${shiftX}px)` } : undefined}
          >
            {children}
          </div>
        </CogToggleContext.Provider>
      ) : null}
    </span>
  )
}
