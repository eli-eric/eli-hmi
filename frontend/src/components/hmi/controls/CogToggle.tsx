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
import { createPortal } from 'react-dom'
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
 * Cog-icon button that toggles a panel of write actions. The panel
 * closes on Escape, on outside-click, and when a descendant write control
 * reports success via useCogToggleClose.
 *
 * The panel is portaled to <body> and fixed-positioned under the button.
 * Rendering it in place (position: absolute) let the scrollable page
 * container (`.page-container { overflow: auto }`) clip it at the viewport
 * edges — dropdowns opened near the status bar or below the fold were cut
 * off. Portaling is the same mechanism the tooltip uses to stay visible.
 */
export const CogToggle: FC<PropsWithChildren<CogToggleProps>> = ({
  ariaLabel,
  inlineLabel,
  children,
}) => {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const wrapperRef = useRef<HTMLSpanElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  // The panel is portaled outside the wrapper, so clicks inside it must not
  // count as "outside" — check both refs.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (wrapperRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      close()
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open, close])

  // Fixed-position the panel below the button, right-aligned to it. Flip it
  // above the button when there is not enough room below, and follow the
  // button on scroll (capture phase catches scrolling ancestors) and resize.
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const button = buttonRef.current
      if (!button) return
      const rect = button.getBoundingClientRect()
      const gap = 4
      const panelHeight = panelRef.current?.offsetHeight ?? 0
      let top = rect.bottom + gap
      if (panelHeight && top + panelHeight > window.innerHeight - 8) {
        top = Math.max(8, rect.top - panelHeight - gap)
      }
      const right = Math.max(8, window.innerWidth - rect.right)
      setPos({ top, right })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open])

  return (
    <span className={styles.wrapper} ref={wrapperRef}>
      <button
        ref={buttonRef}
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
      {open && typeof document !== 'undefined'
        ? createPortal(
            <CogToggleContext.Provider value={close}>
              <div
                ref={panelRef}
                className={styles.panel}
                style={{
                  position: 'fixed',
                  top: pos?.top ?? 0,
                  right: pos?.right ?? 0,
                  zIndex: 1000,
                  visibility: pos ? 'visible' : 'hidden',
                }}
              >
                {children}
              </div>
            </CogToggleContext.Provider>,
            document.body,
          )
        : null}
    </span>
  )
}
