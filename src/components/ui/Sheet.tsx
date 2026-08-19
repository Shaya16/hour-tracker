import { useEffect, type ReactNode } from 'react'
import { CloseIcon } from './icons'

/**
 * Bottom sheet used for every edit form.
 *
 * Locks body scroll while open and closes on Escape. The panel caps at 92vh and scrolls
 * internally, so a long form on a small phone never pushes its own save button off screen.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-[var(--color-scrim)] animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-[480px] bg-canvas rounded-t-[28px] max-h-[92vh] flex flex-col animate-sheet-in"
      >
        <div className="shrink-0 px-5 pt-3 pb-2">
          <div className="mx-auto w-10 h-1 rounded-full bg-hairline mb-3" />
          <div className="flex items-center justify-between">
            <h2 className="t-h2">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid place-items-center size-9 rounded-full text-muted active:bg-sunken"
            >
              <CloseIcon size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4">{children}</div>

        {footer ? (
          <div
            className="shrink-0 px-5 pt-3 border-t border-hairline bg-canvas"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            {footer}
          </div>
        ) : (
          <div style={{ height: 'env(safe-area-inset-bottom)' }} />
        )}
      </div>
    </div>
  )
}

/** Yes/no confirmation, styled like the sheet so destructive taps never feel accidental. */
export function ConfirmSheet({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = 'Delete',
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  body?: string
  confirmLabel?: string
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-[var(--color-scrim)] animate-fade-in" onClick={onClose} aria-hidden />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-[340px] bg-surface rounded-[24px] p-5 shadow-[var(--shadow-lg)] animate-pop-in"
      >
        <h3 className="t-h3">{title}</h3>
        {body ? <p className="text-[14px] text-muted mt-1.5 leading-relaxed">{body}</p> : null}
        <div className="flex gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 rounded-full bg-sunken text-ink font-semibold text-[15px] active:scale-[0.97] transition-transform"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm()
              onClose()
            }}
            className="flex-1 h-11 rounded-full bg-red text-white font-semibold text-[15px] active:scale-[0.97] transition-transform"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
