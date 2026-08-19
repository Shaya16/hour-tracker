import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { haptic } from '../../lib/hooks'

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

/**
 * The panel every section sits in.
 *
 * Elevation is a hairline border *plus* a shadow, not a shadow alone. On dark backgrounds
 * a shadow is nearly invisible, so without the border the cards would dissolve into the
 * canvas and the whole layout would lose its structure.
 */
export function Card({
  children,
  className,
  onClick,
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
}) {
  const base = 'bg-surface rounded-[var(--radius-card)] edge'
  if (onClick) {
    return (
      <button
        type="button"
        onClick={() => {
          haptic()
          onClick()
        }}
        className={cx(base, 'w-full text-left press-sm', className)}
      >
        {children}
      </button>
    )
  }
  return <div className={cx(base, className)}>{children}</div>
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2.5 mt-6 px-0.5">
      <h2 className="t-h3 text-ink">{children}</h2>
      {action}
    </div>
  )
}

type ButtonVariant = 'primary' | 'soft' | 'ghost' | 'danger' | 'surface'

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary:
    'bg-brand text-[var(--color-brand-ink)] shadow-[var(--shadow-brand)] hover:bg-[var(--color-brand-edge)]',
  soft: 'bg-brand-soft text-brand hover:brightness-[0.97]',
  ghost: 'bg-transparent text-muted hover:bg-sunken',
  danger: 'bg-red/12 text-red hover:bg-red/18',
  surface: 'bg-surface text-ink edge hover:bg-sunken',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  onClick,
  ...rest
}: {
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const sizes = {
    sm: 'h-9 px-3.5 text-[13.5px] rounded-full gap-1.5',
    md: 'h-11 px-5 text-[14.5px] rounded-full gap-2',
    lg: 'h-[52px] px-7 text-[15.5px] rounded-full gap-2',
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        haptic()
        onClick?.(e)
      }}
      {...rest}
      className={cx(
        'inline-flex items-center justify-center font-semibold tracking-[-0.012em]',
        'press disabled:opacity-35 disabled:pointer-events-none select-none',
        sizes[size],
        BUTTON_STYLES[variant],
        className,
      )}
    >
      {children}
    </button>
  )
}

export function IconButton({
  children,
  className,
  label,
  variant = 'soft',
  onClick,
  ...rest
}: {
  children: ReactNode
  label: string
  variant?: 'soft' | 'surface'
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        haptic()
        onClick?.(e)
      }}
      {...rest}
      className={cx(
        'grid place-items-center size-9 rounded-full text-brand press',
        variant === 'soft' ? 'bg-brand-soft' : 'bg-surface edge',
        'disabled:opacity-35',
        className,
      )}
    >
      {children}
    </button>
  )
}

/**
 * Pill segmented control.
 *
 * The active pill is a separate absolutely-positioned element rather than a background on
 * the button, so it slides between options instead of blinking from one to the next.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  className?: string
}) {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  )
  return (
    <div
      className={cx('relative flex items-center p-1 bg-sunken rounded-full', className)}
      role="tablist"
    >
      <div
        className="absolute top-1 bottom-1 rounded-full bg-surface shadow-[var(--shadow-sm)]"
        style={{
          width: `calc((100% - 8px) / ${options.length})`,
          left: `calc(4px + (100% - 8px) * ${index} / ${options.length})`,
          transition: 'left var(--dur-base) var(--ease-spring)',
        }}
        aria-hidden
      />
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => {
              haptic()
              onChange(o.value)
            }}
            className={cx(
              'relative z-10 flex-1 h-9 px-2 rounded-full text-[13.5px] font-semibold whitespace-nowrap',
              'transition-colors duration-[var(--dur-fast)]',
              active ? 'text-ink' : 'text-muted',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Tag({
  children,
  color,
  soft,
}: {
  children: ReactNode
  color: string
  soft: string
}) {
  return (
    <span
      className="inline-flex items-center h-[22px] px-2 rounded-[var(--radius-chip)] t-micro"
      style={{ background: soft, color }}
    >
      {children}
    </span>
  )
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cx('block', className)}>
      <span className="block t-micro text-muted mb-1.5 uppercase">{label}</span>
      {children}
      {hint ? <span className="block t-small text-muted mt-1">{hint}</span> : null}
    </label>
  )
}

const INPUT_CLASS =
  'w-full h-12 px-3.5 rounded-[var(--radius-inner)] bg-sunken border border-transparent ' +
  'focus:border-brand focus:bg-surface outline-none text-ink placeholder:text-faint ' +
  'transition-[background-color,border-color] duration-[var(--dur-fast)] ' +
  '[color-scheme:light] dark:[color-scheme:dark]'

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx(INPUT_CLASS, className)} />
}

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <div className="relative">
      <select {...rest} className={cx(INPUT_CLASS, 'appearance-none pr-10', className)}>
        {children}
      </select>
      <svg
        className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-faint"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
      >
        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => {
        haptic()
        onChange(!checked)
      }}
      className={cx(
        'relative w-[46px] h-[28px] rounded-full shrink-0 press-sm',
        'transition-colors duration-[var(--dur-fast)]',
        checked ? 'bg-brand' : 'bg-hairline',
      )}
    >
      <span
        className="absolute top-[3px] size-[22px] rounded-full bg-white shadow-[var(--shadow-xs)]"
        style={{
          left: checked ? '21px' : '3px',
          transition: 'left var(--dur-base) var(--ease-spring)',
        }}
      />
    </button>
  )
}

export function Row({
  label,
  sub,
  children,
  onClick,
}: {
  label: ReactNode
  sub?: ReactNode
  children?: ReactNode
  onClick?: () => void
}) {
  const inner = (
    <>
      <div className="min-w-0">
        <div className="t-label text-ink truncate">{label}</div>
        {sub ? <div className="t-small text-muted truncate mt-0.5">{sub}</div> : null}
      </div>
      <div className="shrink-0 flex items-center gap-2">{children}</div>
    </>
  )
  if (onClick) {
    return (
      <button
        type="button"
        onClick={() => {
          haptic()
          onClick()
        }}
        className="w-full flex items-center justify-between gap-3 py-3.5 text-left press-sm rounded-[var(--radius-inner)]"
      >
        {inner}
      </button>
    )
  }
  return <div className="flex items-center justify-between gap-3 py-3.5">{inner}</div>
}

export function Divider() {
  return <div className="h-px bg-hairline" />
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode
  title: string
  body?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center text-center py-10 px-6">
      {icon ? (
        <div className="grid place-items-center size-14 rounded-[20px] bg-sunken text-faint mb-3.5">
          {icon}
        </div>
      ) : null}
      <div className="t-h3 text-ink">{title}</div>
      {body ? <div className="t-small text-muted mt-1.5 max-w-[260px] leading-relaxed">{body}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

/** Placeholder block used while a value is still settling. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton rounded-[var(--radius-chip)]', className)} />
}
