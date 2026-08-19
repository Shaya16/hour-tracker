import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface ToastState {
  message: string
  actionLabel?: string
  onAction?: () => void
}

/**
 * A single transient toast with an optional action.
 *
 * Anything created in one tap needs a one-tap way back — quick-log makes it very easy to
 * add a shift to the wrong day, and hunting for it to delete it is a far worse experience
 * than the tap saved.
 */
export function useToast(timeoutMs = 6000) {
  const [toast, setToast] = useState<ToastState | null>(null)
  const timer = useRef(0)

  const show = (state: ToastState) => {
    window.clearTimeout(timer.current)
    setToast(state)
    timer.current = window.setTimeout(() => setToast(null), timeoutMs)
  }

  const dismiss = () => {
    window.clearTimeout(timer.current)
    setToast(null)
  }

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return { toast, show, dismiss }
}

export function Toast({ toast, onDismiss }: { toast: ToastState | null; onDismiss: () => void }) {
  if (!toast) return null
  // Portalled for the same reason as Sheet: a transformed ancestor would otherwise
  // capture this fixed element and place it somewhere other than the screen edge.
  return createPortal(
    <div
      className="fixed inset-x-0 z-40 flex justify-center px-4 pointer-events-none"
      style={{ bottom: 'calc(max(0.5rem, env(safe-area-inset-bottom)) + var(--nav-h) + 0.75rem)' }}
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex items-center gap-3 max-w-[420px] w-full bg-ink text-canvas rounded-full pl-4 pr-1.5 py-1.5 shadow-[var(--shadow-lg)] animate-pop-in">
        <span className="t-small font-medium flex-1 truncate">{toast.message}</span>
        {toast.actionLabel && toast.onAction ? (
          <button
            type="button"
            onClick={() => {
              toast.onAction?.()
              onDismiss()
            }}
            className="shrink-0 h-8 px-3.5 rounded-full bg-canvas/15 text-canvas t-small font-bold press"
          >
            {toast.actionLabel}
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
