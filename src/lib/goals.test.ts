import { describe, expect, it } from 'vitest'
import { weekPace } from './goals'
import { weekRange } from './dates'

const H = 3600
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime()

// Sunday 8 Feb 2026 through Saturday 14 Feb.
const week = weekRange(at(2026, 2, 8), 0)

describe('weekPace', () => {
  it('returns null when no goal is set, so nothing is rendered', () => {
    expect(weekPace(10 * H, 0, week, at(2026, 2, 10))).toBeNull()
    expect(weekPace(10 * H, -5, week, at(2026, 2, 10))).toBeNull()
  })

  it('reports "met" once the goal is reached, regardless of the day', () => {
    const p = weekPace(40 * H, 40, week, at(2026, 2, 9))
    expect(p?.status).toBe('met')
    expect(p?.remainingSecs).toBe(0)
    expect(p?.progress).toBe(1)
  })

  it('clamps progress so an overshoot cannot overflow the bar', () => {
    expect(weekPace(60 * H, 40, week, at(2026, 2, 13))?.progress).toBe(1)
  })

  it('measures pace from elapsed time, not whole days', () => {
    // Midday Wednesday is 3.5 of 7 days in — exactly half the week.
    const p = weekPace(20 * H, 40, week, at(2026, 2, 11, 12))
    expect(p?.pace).toBeCloseTo(0.5, 2)
    // Half the goal at the halfway mark is neither ahead nor behind.
    expect(p?.status).toBe('onTrack')
    expect(Math.abs(p?.deltaSecs ?? 0)).toBeLessThan(30 * 60)
  })

  it('calls a small shortfall on track rather than behind', () => {
    // 20 minutes under the halfway expectation is noise, not a warning.
    const p = weekPace(20 * H - 20 * 60, 40, week, at(2026, 2, 11, 12))
    expect(p?.status).toBe('onTrack')
  })

  it('separates ahead from behind once the gap is real', () => {
    expect(weekPace(30 * H, 40, week, at(2026, 2, 11, 12))?.status).toBe('ahead')
    expect(weekPace(5 * H, 40, week, at(2026, 2, 11, 12))?.status).toBe('behind')
    expect(weekPace(30 * H, 40, week, at(2026, 2, 11, 12))?.deltaSecs).toBeGreaterThan(0)
    expect(weekPace(5 * H, 40, week, at(2026, 2, 11, 12))?.deltaSecs).toBeLessThan(0)
  })

  it('does not run the pace marker past the end of the bar', () => {
    // A stale clock, or a range left behind by a timezone shift.
    const p = weekPace(0, 40, week, at(2026, 3, 1))
    expect(p?.pace).toBe(1)
    expect(weekPace(0, 40, week, at(2026, 1, 1))?.pace).toBe(0)
  })

  it('reports what is still left to work', () => {
    expect(weekPace(12 * H, 40, week, at(2026, 2, 10))?.remainingSecs).toBe(28 * H)
  })
})
