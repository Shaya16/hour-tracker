import { useEffect, useState } from 'react'
import { jobPalette } from './types'

/**
 * A clock that re-renders on an interval.
 *
 * `enabled` lets a screen stop ticking when nothing is running, so an idle app is not
 * re-rendering once a second in the background and draining the phone's battery.
 *
 * Also resyncs on visibilitychange: mobile browsers throttle or suspend timers in
 * background tabs, so without this the readout would be stale — and visibly wrong —
 * for a moment after the user returns to the app.
 */
export function useNow(intervalMs = 1000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!enabled) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(Date.now())
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [intervalMs, enabled])

  return now
}

/** True while the browser reports a network connection. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

/** Tracks the OS colour-scheme preference, live. */
export function usePrefersDark(): boolean {
  const [dark, setDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return dark
}

/**
 * The job colour palette for the active theme.
 *
 * Charts set colours as SVG presentation attributes, which cannot resolve a CSS custom
 * property — so theme-aware colour has to reach them as a real value, from here.
 */
export function useJobColors() {
  return jobPalette(usePrefersDark())
}

/**
 * A short haptic tick, where the platform supports it.
 *
 * Silently absent on iOS Safari, which does not implement the Vibration API. That is
 * fine: it is a garnish, and nothing may depend on it having happened.
 */
export function haptic(pattern: number | number[] = 8): void {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return
  try {
    navigator.vibrate(pattern)
  } catch {
    // Blocked by a permissions policy in some embedded contexts.
  }
}
