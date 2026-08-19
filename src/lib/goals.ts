/**
 * Weekly goal pacing — "am I on track?", as a pure function.
 *
 * A bare progress bar answers "how much of the goal is done", which on a Tuesday is
 * always a discouraging sliver. The useful question is whether that sliver is *early
 * enough*, so the goal is compared against how much of the week has actually gone by.
 *
 * Pace is measured from elapsed wall-clock time rather than whole days. Stepping a
 * seventh of the goal at every midnight would mean the target lurched by hours while
 * you slept, and you would open the app "behind" on work you had not had a chance to do.
 *
 * The model assumes hours spread evenly across all seven days. Someone working a
 * five-day week therefore runs ahead mid-week and converges by the weekend — biased
 * optimistic, which is the right way round for a nudge you see every morning.
 */

import type { Range } from './dates'

export type PaceStatus = 'met' | 'ahead' | 'onTrack' | 'behind'

export interface WeekPace {
  goalSecs: number
  workedSecs: number
  /** 0..1 of the goal completed, clamped so it can drive a bar width directly. */
  progress: number
  /** 0..1 — where a steady pace would put you right now. */
  pace: number
  /** Worked minus expected, in seconds. Positive means ahead. */
  deltaSecs: number
  /** Still needed to reach the goal; 0 once it is met. */
  remainingSecs: number
  status: PaceStatus
}

/** Inside this much of the expected pace, you are simply on track — not ahead, not behind. */
const ON_TRACK_SECS = 30 * 60

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0
}

/**
 * Where `workedSecs` sits against a weekly goal, part-way through `week`.
 * Returns null when no goal is set, which is the signal to render nothing at all.
 */
export function weekPace(
  workedSecs: number,
  goalHours: number,
  week: Range,
  now: number,
): WeekPace | null {
  const goalSecs = Math.round(goalHours * 3600)
  if (goalSecs <= 0) return null

  const span = week.end - week.start
  const pace = span > 0 ? clamp01((now - week.start) / span) : 1
  const deltaSecs = Math.round(workedSecs - goalSecs * pace)
  const remainingSecs = Math.max(0, goalSecs - workedSecs)

  const status: PaceStatus =
    remainingSecs === 0
      ? 'met'
      : Math.abs(deltaSecs) <= ON_TRACK_SECS
        ? 'onTrack'
        : deltaSecs > 0
          ? 'ahead'
          : 'behind'

  return {
    goalSecs,
    workedSecs,
    progress: clamp01(workedSecs / goalSecs),
    pace,
    deltaSecs,
    remainingSecs,
    status,
  }
}
