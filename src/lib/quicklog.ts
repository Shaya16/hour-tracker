/**
 * Quick-log patterns.
 *
 * The timer gets forgotten, and re-typing the same 09:00–17:00 shift by hand every time is
 * the main reason a tracker stops getting used. So the app watches what you actually log
 * and offers your usual shifts as one-tap buttons.
 *
 * Nothing here is configured by the user — patterns are derived from history, so they stay
 * correct when a schedule changes instead of going stale like a saved template would.
 */

import { dayKey } from './dates'
import type { Job, Shift } from './types'

/** Only look this far back, so a job you left months ago stops being suggested. */
const LOOKBACK_DAYS = 90

/** Times are grouped to the nearest quarter hour — 08:58 and 09:02 are the same shift. */
const ROUND_MINS = 15

export interface ShiftPattern {
  id: string
  jobId: string
  /** Minutes from midnight. */
  startMins: number
  /** Minutes from midnight; greater than 1440 when the shift runs past midnight. */
  endMins: number
  breakSecs: number
  /** How many times this pattern appears in the lookback window. */
  count: number
  lastUsedAt: number
}

function roundTo(mins: number, step: number): number {
  return Math.round(mins / step) * step
}

function minutesFromMidnight(ts: number): number {
  const d = new Date(ts)
  return d.getHours() * 60 + d.getMinutes()
}

/**
 * Derive the most-used shift patterns.
 *
 * Every job with any history is guaranteed a slot before the remaining slots go to the
 * next most frequent patterns overall. Without that, a job worked twice a week would be
 * crowded out entirely by one worked five times a week — and the whole point is to make
 * *both* jobs one tap away.
 */
export function derivePatterns(
  shifts: Shift[],
  jobs: Job[],
  now: number,
  limit = 4,
): ShiftPattern[] {
  const cutoff = now - LOOKBACK_DAYS * 86_400_000
  const liveJobIds = new Set(jobs.filter((j) => !j.deleted && !j.archived).map((j) => j.id))

  const buckets = new Map<string, ShiftPattern>()

  for (const s of shifts) {
    if (s.deleted || s.endedAt === null) continue
    if (s.startedAt < cutoff) continue
    if (!liveJobIds.has(s.jobId)) continue

    const startMins = roundTo(minutesFromMidnight(s.startedAt), ROUND_MINS)
    let endMins = roundTo(minutesFromMidnight(s.endedAt), ROUND_MINS)
    // A shift ending on a later calendar day wrapped past midnight.
    if (dayKey(s.endedAt) !== dayKey(s.startedAt) || endMins <= startMins) {
      endMins += 24 * 60
    }
    if (endMins <= startMins) continue

    const key = `${s.jobId}|${startMins}|${endMins}`
    const existing = buckets.get(key)
    if (existing) {
      existing.count += 1
      existing.lastUsedAt = Math.max(existing.lastUsedAt, s.startedAt)
      // Break length varies; the most recent one is the best guess.
      if (s.startedAt >= existing.lastUsedAt) existing.breakSecs = s.breakSecs
    } else {
      buckets.set(key, {
        id: key,
        jobId: s.jobId,
        startMins,
        endMins,
        breakSecs: s.breakSecs,
        count: 1,
        lastUsedAt: s.startedAt,
      })
    }
  }

  const byScore = (a: ShiftPattern, b: ShiftPattern) =>
    b.count - a.count || b.lastUsedAt - a.lastUsedAt

  const all = [...buckets.values()].sort(byScore)

  // One slot per job first, in job order, so every job is represented.
  const picked: ShiftPattern[] = []
  const seenJobs = new Set<string>()
  for (const job of jobs) {
    if (picked.length >= limit) break
    const best = all.find((p) => p.jobId === job.id)
    if (best) {
      picked.push(best)
      seenJobs.add(job.id)
    }
  }

  // Then fill any remaining slots with the next best patterns overall.
  for (const p of all) {
    if (picked.length >= limit) break
    if (picked.some((x) => x.id === p.id)) continue
    picked.push(p)
  }

  return picked.slice(0, limit)
}

/** Worked seconds a pattern represents, break already deducted. */
export function patternWorkedSecs(p: ShiftPattern): number {
  return Math.max(0, (p.endMins - p.startMins) * 60 - p.breakSecs)
}

/** Turn a pattern into concrete start/end timestamps on a given day. */
export function patternToTimes(
  p: ShiftPattern,
  day: number,
): { startedAt: number; endedAt: number } {
  const base = new Date(day)
  base.setHours(0, 0, 0, 0)
  const startedAt = base.getTime() + p.startMins * 60_000
  const endedAt = base.getTime() + p.endMins * 60_000
  return { startedAt, endedAt }
}

/** 'HH:mm' for a minutes-from-midnight value, wrapping past 24h. */
export function minsToLabel(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
