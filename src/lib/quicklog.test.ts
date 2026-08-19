import { describe, expect, it } from 'vitest'
import { derivePatterns, minsToLabel, patternToTimes, patternWorkedSecs } from './quicklog'
import type { Job, Shift } from './types'

const H = 3600_000

function job(id: string, over: Partial<Job> = {}): Job {
  return {
    id,
    name: id,
    color: 'brand',
    rateAgorot: 5000,
    defaultBreakMins: 0,
    overtimeEnabled: true,
    otTier1AfterMins: 480,
    otTier1Mult: 1.25,
    otTier2AfterMins: 600,
    otTier2Mult: 1.5,
    archived: false,
    createdAt: 0,
    updatedAt: 0,
    deleted: false,
    ...over,
  }
}

const NOW = new Date(2026, 5, 15, 12, 0, 0, 0).getTime()

/** A shift `daysAgo` before NOW, running startHour→endHour local. */
function shift(
  id: string,
  jobId: string,
  daysAgo: number,
  startHour: number,
  endHour: number,
  over: Partial<Shift> = {},
): Shift {
  const d = new Date(NOW)
  d.setDate(d.getDate() - daysAgo)
  d.setHours(startHour, 0, 0, 0)
  const startedAt = d.getTime()
  const hours = endHour > startHour ? endHour - startHour : 24 - startHour + endHour
  return {
    id,
    jobId,
    startedAt,
    endedAt: startedAt + hours * H,
    breakSecs: 0,
    pausedAt: null,
    note: '',
    extraAgorot: 0,
    updatedAt: 0,
    deleted: false,
    ...over,
  }
}

describe('derivePatterns', () => {
  it('returns nothing without history', () => {
    expect(derivePatterns([], [job('a')], NOW)).toEqual([])
  })

  it('finds a repeated shift', () => {
    const shifts = [
      shift('1', 'a', 1, 9, 17),
      shift('2', 'a', 2, 9, 17),
      shift('3', 'a', 3, 9, 17),
    ]
    const [p] = derivePatterns(shifts, [job('a')], NOW)
    expect(p!.count).toBe(3)
    expect(p!.startMins).toBe(9 * 60)
    expect(p!.endMins).toBe(17 * 60)
  })

  it('groups near-identical times into one pattern', () => {
    // 08:58 and 09:03 are the same shift in practice.
    const a = shift('1', 'a', 1, 9, 17)
    const b = shift('2', 'a', 2, 9, 17)
    b.startedAt -= 2 * 60_000
    const c = shift('3', 'a', 3, 9, 17)
    c.startedAt += 3 * 60_000
    const patterns = derivePatterns([a, b, c], [job('a')], NOW)
    expect(patterns).toHaveLength(1)
    expect(patterns[0]!.count).toBe(3)
  })

  it('ranks the more frequent pattern first', () => {
    const shifts = [
      shift('1', 'a', 1, 9, 17),
      shift('2', 'a', 2, 9, 17),
      shift('3', 'a', 3, 9, 17),
      shift('4', 'a', 4, 6, 10),
    ]
    const patterns = derivePatterns(shifts, [job('a')], NOW)
    expect(patterns[0]!.count).toBe(3)
    expect(patterns[1]!.count).toBe(1)
  })

  it('guarantees every job a slot even when one dominates', () => {
    // Job A worked far more often must not crowd job B out entirely.
    const shifts = [
      ...Array.from({ length: 8 }, (_, i) => shift(`a${i}`, 'a', i + 1, 9, 17)),
      shift('b1', 'b', 3, 14, 19),
    ]
    const patterns = derivePatterns(shifts, [job('a'), job('b')], NOW, 2)
    expect(patterns.map((p) => p.jobId).sort()).toEqual(['a', 'b'])
  })

  it('respects the limit', () => {
    const shifts = [
      shift('1', 'a', 1, 9, 17),
      shift('2', 'a', 2, 6, 10),
      shift('3', 'a', 3, 12, 20),
      shift('4', 'a', 4, 7, 11),
      shift('5', 'a', 5, 8, 12),
    ]
    expect(derivePatterns(shifts, [job('a')], NOW, 3)).toHaveLength(3)
  })

  it('ignores shifts older than the lookback window', () => {
    const shifts = [shift('old', 'a', 200, 9, 17), shift('new', 'a', 2, 6, 14)]
    const patterns = derivePatterns(shifts, [job('a')], NOW)
    expect(patterns).toHaveLength(1)
    expect(patterns[0]!.startMins).toBe(6 * 60)
  })

  it('ignores deleted shifts', () => {
    const patterns = derivePatterns([shift('1', 'a', 1, 9, 17, { deleted: true })], [job('a')], NOW)
    expect(patterns).toEqual([])
  })

  it('ignores a still-running shift, which has no end time to learn from', () => {
    const patterns = derivePatterns([shift('1', 'a', 1, 9, 17, { endedAt: null })], [job('a')], NOW)
    expect(patterns).toEqual([])
  })

  it('ignores shifts belonging to a deleted or archived job', () => {
    const shifts = [shift('1', 'a', 1, 9, 17), shift('2', 'b', 1, 9, 17)]
    const patterns = derivePatterns(shifts, [job('a', { archived: true }), job('b', { deleted: true })], NOW)
    expect(patterns).toEqual([])
  })

  it('keeps two jobs with the same hours as separate patterns', () => {
    const shifts = [shift('1', 'a', 1, 9, 17), shift('2', 'b', 1, 9, 17)]
    const patterns = derivePatterns(shifts, [job('a'), job('b')], NOW)
    expect(patterns).toHaveLength(2)
  })

  it('represents an overnight shift as running past 24h', () => {
    const patterns = derivePatterns([shift('1', 'a', 1, 22, 6)], [job('a')], NOW)
    expect(patterns[0]!.startMins).toBe(22 * 60)
    expect(patterns[0]!.endMins).toBe(30 * 60) // 06:00 the next day
  })

  it('carries the break length through', () => {
    const patterns = derivePatterns(
      [shift('1', 'a', 1, 9, 17, { breakSecs: 1800 })],
      [job('a')],
      NOW,
    )
    expect(patterns[0]!.breakSecs).toBe(1800)
  })
})

describe('patternWorkedSecs', () => {
  it('subtracts the break', () => {
    const [p] = derivePatterns([shift('1', 'a', 1, 9, 17, { breakSecs: 1800 })], [job('a')], NOW)
    expect(patternWorkedSecs(p!)).toBe(8 * 3600 - 1800)
  })
})

describe('patternToTimes', () => {
  it('places the pattern on the requested day', () => {
    const [p] = derivePatterns([shift('1', 'a', 5, 9, 17)], [job('a')], NOW)
    const target = new Date(2026, 6, 20, 15, 30).getTime()
    const { startedAt, endedAt } = patternToTimes(p!, target)
    expect(new Date(startedAt).getDate()).toBe(20)
    expect(new Date(startedAt).getHours()).toBe(9)
    expect(new Date(endedAt).getHours()).toBe(17)
  })

  it('rolls an overnight pattern into the following day', () => {
    const [p] = derivePatterns([shift('1', 'a', 5, 22, 6)], [job('a')], NOW)
    const target = new Date(2026, 6, 20, 12, 0).getTime()
    const { startedAt, endedAt } = patternToTimes(p!, target)
    expect(new Date(startedAt).getDate()).toBe(20)
    expect(new Date(endedAt).getDate()).toBe(21)
    expect(new Date(endedAt).getHours()).toBe(6)
  })
})

describe('minsToLabel', () => {
  it.each([
    [0, '00:00'],
    [9 * 60, '09:00'],
    [17 * 60 + 30, '17:30'],
    [30 * 60, '06:00'],
  ])('formats %i as %s', (mins, expected) => {
    expect(minsToLabel(mins)).toBe(expected)
  })
})
