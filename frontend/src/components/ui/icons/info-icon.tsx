'use client'

import React from 'react'
import clsx from 'clsx'

import { Tooltip, TooltipProvider } from '../tooltip/tooltip'
import styles from './icon.module.css'

interface InfoIconProps {
  /** The hint shown on hover. Also the icon's accessible name. */
  hint: string
  className?: string
}

/**
 * Explains the control it sits next to. The hint is the icon's accessible
 * name as well as its tooltip: a hover-only hint is invisible to anyone
 * navigating by keyboard or screen reader, and an unlabelled icon is just
 * decoration to them.
 *
 * Carries its own `TooltipProvider` — nesting one inside the app-wide
 * provider is harmless, and it makes the icon work anywhere it is dropped
 * rather than throwing in any tree that happens not to mount one (which is
 * every component test that renders a section).
 */
export const InfoIcon: React.FC<InfoIconProps> = ({ hint, className }) => (
  <TooltipProvider>
    <Tooltip content={hint} delayDuration={200} side="top">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="10"
        height="10"
        className={clsx(styles.infoIcon, className)}
        viewBox="0 0 24 24"
        fill="none"
        role="img"
        aria-label={hint}
        tabIndex={0}
      >
        <path
          d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v2h-2V7zm0 4h2v6h-2v-6z"
          fill="currentColor"
        />
      </svg>
    </Tooltip>
  </TooltipProvider>
)
