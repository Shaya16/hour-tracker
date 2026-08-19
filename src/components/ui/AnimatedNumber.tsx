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
 */
export function useAnimatedValue(target: number, duration = 520): number {
  const [value, setValue] = useState(target)
  const fromRef = useRef(target)
  const startRef = useRef(0)
  const rafRef = useRef(0)

  useEffect(() => {
    // First paint, or a jump so large it is a context switch rather than an update
    // (changing period on Reports) — land on it immediately.
    if (fromRef.current === target) return

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (prefersReduced) {
      fromRef.current = target
      setValue(target)
      return
    }

    const from = fromRef.current
    const delta = target - from
    startRef.current = 0

    const tick = (now: number) => {
      if (startRef.current === 0) startRef.current = now
      const elapsed = now - startRef.current
      const t = Math.min(1, elapsed / duration)
      // easeOutExpo — fast commitment, gentle settle. Matches --ease-out-expo.
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
      setValue(from + delta * eased)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = target
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])

  // Keep the ref honest if the component re-renders mid-flight.
  useEffect(() => {
    if (rafRef.current === 0) fromRef.current = target
  }, [target])

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
