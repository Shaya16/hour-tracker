import type { ReactNode } from 'react'

/**
 * The circular progress ring on the Timer screen.
 *
 * Starts at 12 o'clock and sweeps clockwise. `progress` may exceed 1 — the arc caps at a
 * full circle and the caller switches colour to signal overtime, rather than letting it
 * silently wrap and understate the excess.
 */
export function Ring({
  progress,
  size = 236,
  stroke = 16,
  color = '#5B5BEF',
  colorTo,
  glow = false,
  children,
}: {
  progress: number
  size?: number
  stroke?: number
  color?: string
  colorTo?: string
  /** Adds a soft halo behind the arc while the clock is running. */
  glow?: boolean
  children?: ReactNode
}) {
  const clamped = Math.max(0, Math.min(1, progress))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - clamped)
  const uid = `${color}${colorTo ?? ''}`.replace(/[^a-z0-9]/gi, '')

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
        <defs>
          <linearGradient id={`ring-g-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor={colorTo ?? color} />
          </linearGradient>
          <filter id={`ring-f-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={stroke * 0.45} result="blur" />
          </filter>
        </defs>

        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-sunken)"
          strokeWidth={stroke}
        />

        {/* Blurred copy sits beneath the arc to read as emitted light. */}
        {glow && clamped > 0 ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={`url(#ring-g-${uid})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            filter={`url(#ring-f-${uid})`}
            opacity={0.55}
            style={{ transition: 'stroke-dashoffset var(--dur-slow) var(--ease-out-expo)' }}
          />
        ) : null}

        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#ring-g-${uid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset var(--dur-slow) var(--ease-out-expo)' }}
        />
      </svg>

      <div className="relative z-10 flex flex-col items-center justify-center text-center px-8">
        {children}
      </div>
    </div>
  )
}
