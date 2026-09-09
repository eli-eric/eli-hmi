'use client'

import { RefObject, useEffect } from 'react'

/**
 * Marks a region whose clicks leave expanded panel drop-downs alone.
 *
 * Put it on application chrome that is not part of the panel — the header,
 * say. A control there is often reached for *because* something is expanded
 * (the colour-palette selector exists to change how those very indicators
 * look), and collapsing the list the moment it is touched would defeat it.
 */
export const COLLAPSE_EXEMPT_ATTRIBUTE = 'data-collapse-exempt'

/**
 * While `expanded` is true, collapse when the user clicks anywhere in the app
 * that is not inside the trigger element, or inside a region marked with
 * {@link COLLAPSE_EXEMPT_ATTRIBUTE}. The trigger keeps its own toggle
 * behaviour (clicking it again closes via its own handler).
 *
 * Implements the spec requirement: once an element is expanded it can be
 * collapsed by clicking anywhere. The listener is attached in an effect that
 * runs after the opening click has finished propagating, so the click that
 * opened the element does not immediately close it again.
 */
export function useCollapseOnAnyClick(
  expanded: boolean,
  collapse: () => void,
  triggerRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!expanded) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (target && triggerRef.current && triggerRef.current.contains(target)) {
        return
      }
      if (
        target instanceof Element &&
        target.closest(`[${COLLAPSE_EXEMPT_ATTRIBUTE}]`)
      ) {
        return
      }
      collapse()
    }
    window.addEventListener('click', onClick)
    return () => window.removeEventListener('click', onClick)
  }, [expanded, collapse, triggerRef])
}
