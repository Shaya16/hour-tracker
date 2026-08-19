import { useEffect, useRef, useState } from 'react'

/**
 * Eases a number toward its target instead of snapping to it.
 *
 * Used for money and hour totals. When you stop a shift and the day's earnings jump from
 * ₪250 to ₪600, a hard cut reads as a glitch — the eye cannot tell whether the number
 * changed or the whole view re-rendered. Counting up makes the change legible as a change.
 *
 * Deliberately *not* used for the running timer: a clock must show the real time, and
 * easing toward it would mean displaying a value that is briefly a lie.
 *
 * **Correctness beats the animation.** These are money figures, so the value must always
 * arrive at its target even if the animation cannot run — browsers suspend
 * requestAnimationFrame in a hidden document, and without a guarantee the display would
 * simply freeze mid-count and show a stale number. Two safeguards: no animation at all
 * while hidden, and a timer that force-lands the value if the frame loop never finishes.
 */
export function useAnimatedValue(target: number, duration = 520): number {
  const [value, setValue] = useState(target)
  const fromRef = useRef(target)
  const rafRef = useRef(0)
  const timeoutRef = useRef(0)

  useEffect(() => {
    if (fromRef.current === target) return

    const land = () => {
      fromRef.current = target
      setValue(target)
    }

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // A hidden document throttles or suspends rAF, so animating would strand the value.
    if (prefersReduced || (typeof document !== 'undefined' && document.hidden)) {
      land()
      return
    }

    const from = fromRef.current
    const delta = target - from
    let start = 0

    const tick = (now: number) => {
      if (start === 0) start = now
      const t = Math.min(1, (now - start) / duration)
      // easeOutExpo — fast commitment, gentle settle. Matches --ease-out-expo.
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
      setValue(from + delta * eased)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
      else land()
    }

    rafRef.current = requestAnimationFrame(tick)

    // Backstop: if the frame loop is throttled away, land on the target anyway.
    timeoutRef.current = window.setTimeout(land, duration + 300)

    // Leaving the tab mid-count would otherwise freeze a half-way figure on screen.
    const onHide = () => {
      if (document.hidden) land()
    }
    document.addEventListener('visibilitychange', onHide)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.clearTimeout(timeoutRef.current)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [target, duration])

  return value
}

export function AnimatedNumber({
  value,
  format,
  className,
  duration,
}: {
  value: number
  format: (v: number) => string
  className?: string
  duration?: number
}) {
  const animated = useAnimatedValue(value, duration)
  return <span className={className}>{format(animated)}</span>
}
