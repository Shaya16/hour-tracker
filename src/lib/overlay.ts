/**
 * Ghost-click suppression for dismissing an overlay by tapping its backdrop.
 *
 * On a touch device, a tap fires `pointerdown` -> `pointerup` -> and then a *synthesised*
 * `click` for mouse compatibility. If the backdrop closes the sheet on `click`, that
 * click has nowhere useful to go; worse, if the sheet closes earlier in the sequence the
 * synthesised click lands on whatever the sheet had been covering — typically the very
 * control that opens it, so dismissing appears to reopen it instantly.
 *
 * `preventDefault()` on `pointerdown` is the documented way to suppress those
 * compatibility mouse events at the source. No timers, no guessing at a window.
 */

import type { PointerEvent as ReactPointerEvent } from 'react'

/**
 * Handler for a backdrop that dismisses on tap.
 * Fires on pointerdown and cancels the mouse events that would otherwise follow.
 */
export function backdropDismiss(onClose: () => void) {
  return (e: ReactPointerEvent<HTMLElement>) => {
    // Only the backdrop itself — never a tap that began inside the panel.
    if (e.target !== e.currentTarget) return
    e.preventDefault()
    onClose()
  }
}
