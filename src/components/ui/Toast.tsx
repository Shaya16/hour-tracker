import { useEffect, useRef, useState } from 'react'

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
  return (
    <div
      className="fixed inset-x-0 z-40 flex justify-center px-4 pointer-events-none"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 78px)' }}
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
    </div>
  )
}
