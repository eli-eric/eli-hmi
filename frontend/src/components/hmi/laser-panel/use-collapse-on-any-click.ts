'use client'

import { RefObject, useEffect } from 'react'

/**
 * While `expanded` is true, collapse when the user clicks anywhere in the app
 * that is not inside the trigger element. The trigger keeps its own toggle
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
      collapse()
    }
    window.addEventListener('click', onClick)
    return () => window.removeEventListener('click', onClick)
  }, [expanded, collapse, triggerRef])
}
