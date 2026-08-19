import { describe, expect, it } from 'vitest'
import {
  dayKey,
  daysInRange,
  formatRangeLabel,
  fromDateTimeInput,
  payPeriodRange,
  periodRange,
  shiftPeriod,
  weekDays,
  weekRange,
} from './dates'
import { DEFAULT_SETTINGS, type Settings } from './types'

const settings: Settings = { ...DEFAULT_SETTINGS, weekStartsOn: 0, payPeriodAnchor: '2026-01-04' }

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime()

describe('dayKey', () => {
  it('uses the local calendar date, not UTC', () => {
    // 00:30 local. toISOString() would report the previous day for any zone east of UTC,
    // which would file a late-night shift under the wrong day.
    expect(dayKey(at(2026, 3, 10, 0) + 30 * 60_000)).toBe('2026-03-10')
  })

  it('zero-pads month and day', () => {
    expect(dayKey(at(2026, 1, 5))).toBe('2026-01-05')
  })

  it('handles the last instant of a day', () => {
    expect(dayKey(new Date(2026, 2, 10, 23, 59, 59, 999).getTime())).toBe('2026-03-10')
  })
})

describe('weekRange with Sunday start', () => {
  it('starts a week on Sunday', () => {
    // 2026-03-10 is a Tuesday; its week runs Sun 8th → Sat 14th.
    const r = weekRange(at(2026, 3, 10), 0)
    expect(dayKey(r.start)).toBe('2026-03-08')
    expect(dayKey(r.end)).toBe('2026-03-14')
  })

  it('treats Sunday itself as the first day, not the last', () => {
    const r = weekRange(at(2026, 3, 8), 0)
    expect(dayKey(r.start)).toBe('2026-03-08')
  })

  it('shifts to Monday start when configured', () => {
    const r = weekRange(at(2026, 3, 10), 1)
    expect(dayKey(r.start)).toBe('2026-03-09')
    expect(dayKey(r.end)).toBe('2026-03-15')
  })

  it('covers exactly 7 days', () => {
    expect(daysInRange(weekRange(at(2026, 3, 10), 0))).toHaveLength(7)
  })
})

describe('weekDays', () => {
  it('returns 7 consecutive days beginning on Sunday', () => {
    const days = weekDays(at(2026, 3, 10), 0)
    expect(days).toHaveLength(7)
    expect(days[0]!.getDay()).toBe(0)
    expect(dayKey(days[0]!.getTime())).toBe('2026-03-08')
    expect(dayKey(days[6]!.getTime())).toBe('2026-03-14')
  })
})

describe('payPeriodRange', () => {
  it('aligns biweekly periods to the anchor', () => {
    // Anchor 2026-01-04 => periods start 01-04, 01-18, 02-01, ...
    const r = payPeriodRange(at(2026, 1, 20), 'biweekly', '2026-01-04', 0)
    expect(dayKey(r.start)).toBe('2026-01-18')
    expect(dayKey(r.end)).toBe('2026-01-31')
  })

  it('puts the anchor date itself at the start of its own period', () => {
    const r = payPeriodRange(at(2026, 1, 4), 'biweekly', '2026-01-04', 0)
    expect(dayKey(r.start)).toBe('2026-01-04')
  })

  it('still lands on a boundary for dates before the anchor', () => {
    const r = payPeriodRange(at(2025, 12, 25), 'biweekly', '2026-01-04', 0)
    expect(dayKey(r.start)).toBe('2025-12-21')
    expect(dayKey(r.end)).toBe('2026-01-03')
  })

  it('spans exactly 14 days', () => {
    const r = payPeriodRange(at(2026, 5, 7), 'biweekly', '2026-01-04', 0)
    expect(daysInRange(r)).toHaveLength(14)
  })

  it('covers a whole calendar month when monthly', () => {
    const r = payPeriodRange(at(2026, 2, 15), 'monthly', '2026-01-04', 0)
    expect(dayKey(r.start)).toBe('2026-02-01')
    expect(dayKey(r.end)).toBe('2026-02-28')
  })

  it('handles a leap February', () => {
    const r = payPeriodRange(at(2028, 2, 15), 'monthly', '2026-01-04', 0)
    expect(dayKey(r.end)).toBe('2028-02-29')
  })
})

describe('shiftPeriod', () => {
  it('steps back one week and lands inside the previous week', () => {
    const prev = shiftPeriod(at(2026, 3, 10), 'week', settings, -1)
    const r = periodRange(prev, 'week', settings)
    expect(dayKey(r.start)).toBe('2026-03-01')
    expect(dayKey(r.end)).toBe('2026-03-07')
  })

  it('steps forward one week', () => {
    const next = shiftPeriod(at(2026, 3, 10), 'week', settings, 1)
    const r = periodRange(next, 'week', settings)
    expect(dayKey(r.start)).toBe('2026-03-15')
  })

  it('steps months without drifting on short months', () => {
    // From 31 Jan, stepping forward must reach February, not skip to March.
    const next = shiftPeriod(at(2026, 1, 31), 'month', settings, 1)
    const r = periodRange(next, 'month', settings)
    expect(dayKey(r.start)).toBe('2026-02-01')
    expect(dayKey(r.end)).toBe('2026-02-28')
  })

  it('round-trips forward then back to the same period', () => {
    const start = at(2026, 3, 10)
    const there = shiftPeriod(start, 'week', settings, 1)
    const back = shiftPeriod(there, 'week', settings, -1)
    expect(periodRange(back, 'week', settings).start).toBe(periodRange(start, 'week', settings).start)
  })

  it('steps biweekly pay periods by a full 14 days', () => {
    const s: Settings = { ...settings, payPeriod: 'biweekly' }
    const r0 = periodRange(at(2026, 1, 20), 'payPeriod', s)
    const next = shiftPeriod(at(2026, 1, 20), 'payPeriod', s, 1)
    const r1 = periodRange(next, 'payPeriod', s)
    expect(dayKey(r1.start)).toBe('2026-02-01')
    expect(Math.round((r1.start - r0.start) / 86_400_000)).toBe(14)
  })
})

describe('formatRangeLabel', () => {
  it('collapses a within-month range', () => {
    expect(formatRangeLabel(weekRange(at(2026, 3, 10), 0), 'week')).toBe('Mar 8 – 14, 2026')
  })

  it('spells out both months when a week straddles them', () => {
    expect(formatRangeLabel(weekRange(at(2026, 4, 1), 0), 'week')).toBe('Mar 29 – Apr 4, 2026')
  })

  it('names the month for a monthly period', () => {
    expect(formatRangeLabel(periodRange(at(2026, 3, 10), 'month', settings), 'month')).toBe(
      'March 2026',
    )
  })
})

describe('fromDateTimeInput', () => {
  it('recombines date and time inputs in local time', () => {
    const ts = fromDateTimeInput('2026-03-10', '14:30')
    const d = new Date(ts)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(2)
    expect(d.getDate()).toBe(10)
    expect(d.getHours()).toBe(14)
    expect(d.getMinutes()).toBe(30)
  })

  it('round-trips through dayKey', () => {
    expect(dayKey(fromDateTimeInput('2026-12-31', '23:59'))).toBe('2026-12-31')
  })
})
