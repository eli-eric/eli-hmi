'use client'

import {
  FC,
  PropsWithChildren,
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
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

  const close = useCallback(() => setOpen(false), [])

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
          <div className={styles.panel}>{children}</div>
        </CogToggleContext.Provider>
      ) : null}
    </span>
  )
}
