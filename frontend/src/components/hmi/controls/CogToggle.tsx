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
  /** Optional inline label rendered next to the cog (e.g. "General Actions").
   *  When present the panel expands in normal flow; when absent the panel is a
   *  floating dropdown portaled to <body>. */
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
 * Cog-icon button that toggles a panel of write actions. The panel closes on
 * Escape, on outside-click, and when a descendant write control reports success
 * via useCogToggleClose.
 *
 * Two render modes:
 *  - inline (inlineLabel set): panel expands in normal flow inside the card.
 *  - floating (no inlineLabel): panel is PORTALED to <body> and fixed-positioned
 *    under the cog. Portaling is required so the dropdown is not clipped by the
 *    scrollable page container (`.page-container { overflow: auto }`) or hidden
 *    behind the sticky header — the same reason the tooltip portals.
 */
export const CogToggle: FC<PropsWithChildren<CogToggleProps>> = ({
  ariaLabel,
  inlineLabel,
  children,
}) => {
  const isInline = Boolean(inlineLabel)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const wrapperRef = useRef<HTMLSpanElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const close = useCallback(() => setOpen(false), [])

  // Escape closes.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  // Outside-click closes. The floating panel is portaled OUTSIDE the wrapper, so
  // clicks inside it must not count as "outside" — check both refs.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (wrapperRef.current?.contains(t)) return
      if (panelRef.current?.contains(t)) return
      close()
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open, close])

  // Position the floating dropdown: fixed, below the button, right-aligned to it,
  // flipped above if it would overflow the viewport bottom. Reposition on scroll
  // (capture phase catches scrolling ancestors) and resize.
  useLayoutEffect(() => {
    if (!open || isInline) return
    const place = () => {
      const btn = buttonRef.current
      if (!btn) return
      const r = btn.getBoundingClientRect()
      const gap = 4
      const vw = window.innerWidth
      const vh = window.innerHeight
      const ph = panelRef.current?.offsetHeight ?? 0
      let top = r.bottom + gap
      if (ph && top + ph > vh - 8) top = Math.max(8, r.top - ph - gap)
      const right = Math.max(8, vw - r.right)
      setPos({ top, right })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, isInline])

  const panelInner = (
    <CogToggleContext.Provider value={close}>
      <div
        ref={panelRef}
        className={styles.panel}
        data-inline={isInline ? 'true' : 'false'}
        data-floating={isInline ? undefined : 'true'}
        style={
          isInline
            ? undefined
            : {
                position: 'fixed',
                top: pos?.top ?? 0,
                right: pos?.right ?? 0,
                zIndex: 1000,
                visibility: pos ? 'visible' : 'hidden',
              }
        }
      >
        {children}
      </div>
    </CogToggleContext.Provider>
  )

  return (
    <span
      className={styles.wrapper}
      ref={wrapperRef}
      data-inline={isInline ? 'true' : 'false'}
    >
      <button
        ref={buttonRef}
        type="button"
        className={styles.button}
        aria-label={ariaLabel}
        aria-expanded={open}
        data-has-inline-label={isInline ? 'true' : 'false'}
        onClick={() => setOpen((v) => !v)}
      >
        <SettingsIcon />
        {isInline ? (
          <span className={styles.inlineLabel}>{inlineLabel}</span>
        ) : null}
      </button>
      {open
        ? isInline
          ? panelInner
          : typeof document !== 'undefined'
            ? createPortal(panelInner, document.body)
            : null
        : null}
    </span>
  )
}
