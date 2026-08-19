import { describe, expect, it } from 'vitest'
import { computeBreakdowns, groupByJob, sumBreakdowns, workedSecs } from './pay'
import type { Job, Shift } from './types'

const H = 3600

function job(over: Partial<Job> = {}): Job {
  return {
    id: 'j1',
    name: 'Cafe',
    color: 'brand',
    rateAgorot: 5000, // ₪50.00/hr — round number keeps expectations readable
    defaultBreakMins: 0,
    overtimeEnabled: true,
    otTier1AfterMins: 8 * 60,
    otTier1Mult: 1.25,
    otTier2AfterMins: 10 * 60,
    otTier2Mult: 1.5,
    archived: false,
    createdAt: 0,
    updatedAt: 0,
    deleted: false,
    ...over,
  }
}

/** A shift on 2026-03-10 (a plain, non-DST day) starting at `startHour` local. */
function shift(id: string, startHour: number, hours: number, over: Partial<Shift> = {}): Shift {
  const start = new Date(2026, 2, 10, startHour, 0, 0, 0).getTime()
  return {
    id,
    jobId: 'j1',
    startedAt: start,
    endedAt: start + hours * H * 1000,
    breakSecs: 0,
    pausedAt: null,
    note: '',
    extraAgorot: 0,
    updatedAt: 0,
    deleted: false,
    ...over,
  }
}

const NOW = new Date(2026, 2, 10, 23, 0, 0, 0).getTime()

function only(shifts: Shift[], jobs: Job[]) {
  const map = new Map(jobs.map((j) => [j.id, j]))
  return computeBreakdowns(shifts, map, NOW)
}

describe('workedSecs', () => {
  it('is elapsed time minus break', () => {
    const s = shift('a', 9, 8, { breakSecs: 30 * 60 })
    expect(workedSecs(s, NOW)).toBe(7.5 * H)
  })

  it('never goes negative when the break exceeds the shift', () => {
    const s = shift('a', 9, 1, { breakSecs: 5 * H })
    expect(workedSecs(s, NOW)).toBe(0)
  })

  it('counts a running shift up to now', () => {
    const start = NOW - 2 * H * 1000
    const s = shift('a', 9, 0, { startedAt: start, endedAt: null })
    expect(workedSecs(s, NOW)).toBe(2 * H)
  })

  it('subtracts an in-progress break from a running shift', () => {
    const start = NOW - 3 * H * 1000
    const pausedAt = NOW - 1 * H * 1000
    const s = shift('a', 9, 0, { startedAt: start, endedAt: null, pausedAt })
    // 3h elapsed, 1h of it currently on break => 2h worked.
    expect(workedSecs(s, NOW)).toBe(2 * H)
  })

  it('adds an in-progress break on top of already-banked break time', () => {
    const start = NOW - 4 * H * 1000
    const pausedAt = NOW - 1 * H * 1000
    const s = shift('a', 9, 0, {
      startedAt: start,
      endedAt: null,
      pausedAt,
      breakSecs: 30 * 60,
    })
    // 4h elapsed − 0.5h banked − 1h open break = 2.5h
    expect(workedSecs(s, NOW)).toBe(2.5 * H)
  })
})

describe('overtime tiers', () => {
  it('pays a plain 6h shift entirely at the base rate', () => {
    const b = only([shift('a', 9, 6)], [job()]).get('a')!
    expect(b.regularSecs).toBe(6 * H)
    expect(b.tier1Secs).toBe(0)
    expect(b.tier2Secs).toBe(0)
    expect(b.totalAgorot).toBe(6 * 5000)
  })

  it('splits an 11h day into 8 regular + 2 at x1.25 + 1 at x1.5', () => {
    const b = only([shift('a', 8, 11)], [job()]).get('a')!
    expect(b.regularSecs).toBe(8 * H)
    expect(b.tier1Secs).toBe(2 * H)
    expect(b.tier2Secs).toBe(1 * H)
    // 8*50 + 2*62.50 + 1*75 = 400 + 125 + 75 = ₪600.00
    expect(b.totalAgorot).toBe(60000)
  })

  it('crosses only the first tier on a 9h day', () => {
    const b = only([shift('a', 8, 9)], [job()]).get('a')!
    expect(b.regularSecs).toBe(8 * H)
    expect(b.tier1Secs).toBe(1 * H)
    expect(b.tier2Secs).toBe(0)
    expect(b.totalAgorot).toBe(8 * 5000 + Math.round(1.25 * 5000))
  })

  it('deducts the break before applying tiers', () => {
    // 9h on the clock, 1h break => 8h worked => no overtime at all.
    const b = only([shift('a', 8, 9, { breakSecs: H })], [job()]).get('a')!
    expect(b.workedSecs).toBe(8 * H)
    expect(b.tier1Secs).toBe(0)
    expect(b.totalAgorot).toBe(8 * 5000)
  })

  it('pays everything flat when overtime is disabled', () => {
    const b = only([shift('a', 8, 12)], [job({ overtimeEnabled: false })]).get('a')!
    expect(b.regularSecs).toBe(12 * H)
    expect(b.tier1Secs).toBe(0)
    expect(b.totalAgorot).toBe(12 * 5000)
  })

  it('ignores a second tier set at or below the first', () => {
    const b = only([shift('a', 8, 11)], [job({ otTier2AfterMins: 8 * 60 })]).get('a')!
    expect(b.tier2Secs).toBe(0)
    expect(b.tier1Secs).toBe(3 * H)
  })
})

describe('overtime accrues per job per day, not per shift', () => {
  it('pools two same-job shifts on one day across the threshold', () => {
    // 5h morning + 5h evening at the SAME job = 10h => 8 regular + 2 at x1.25
    const map = only([shift('a', 6, 5), shift('b', 14, 5)], [job()])
    const t = sumBreakdowns(map.values())
    expect(t.workedSecs).toBe(10 * H)
    expect(t.regularSecs).toBe(8 * H)
    expect(t.tier1Secs).toBe(2 * H)

    // The split lands on the second shift, which is the one that crossed the line.
    expect(map.get('a')!.regularSecs).toBe(5 * H)
    expect(map.get('a')!.tier1Secs).toBe(0)
    expect(map.get('b')!.regularSecs).toBe(3 * H)
    expect(map.get('b')!.tier1Secs).toBe(2 * H)
  })

  it('does NOT pool across two different jobs on the same day', () => {
    const jobA = job({ id: 'j1', name: 'Cafe' })
    const jobB = job({ id: 'j2', name: 'Warehouse', rateAgorot: 6000 })
    const map = only(
      [shift('a', 6, 5, { jobId: 'j1' }), shift('b', 14, 5, { jobId: 'j2' })],
      [jobA, jobB],
    )
    const t = sumBreakdowns(map.values())
    expect(t.workedSecs).toBe(10 * H)
    // Separate employers: neither reached 8h, so there is no overtime anywhere.
    expect(t.regularSecs).toBe(10 * H)
    expect(t.tier1Secs).toBe(0)
    expect(t.totalAgorot).toBe(5 * 5000 + 5 * 6000)
  })

  it('pools regardless of the order shifts are supplied in', () => {
    const later = shift('b', 14, 5)
    const earlier = shift('a', 6, 5)
    const map = only([later, earlier], [job()])
    // Chronology, not array order, decides which shift absorbs the overtime.
    expect(map.get('a')!.tier1Secs).toBe(0)
    expect(map.get('b')!.tier1Secs).toBe(2 * H)
  })

  it('keeps the same job on different days independent', () => {
    const day2 = new Date(2026, 2, 11, 8, 0, 0, 0).getTime()
    const map = only(
      [shift('a', 8, 7), shift('b', 8, 7, { startedAt: day2, endedAt: day2 + 7 * H * 1000 })],
      [job()],
    )
    const t = sumBreakdowns(map.values())
    expect(t.tier1Secs).toBe(0)
    expect(t.regularSecs).toBe(14 * H)
  })
})

describe('day attribution', () => {
  it('files a shift crossing midnight under its start date', () => {
    const start = new Date(2026, 2, 10, 22, 0, 0, 0).getTime()
    const s = shift('a', 22, 0, { startedAt: start, endedAt: start + 4 * H * 1000 })
    const b = only([s], [job()]).get('a')!
    expect(b.dayKey).toBe('2026-03-10')
    expect(b.workedSecs).toBe(4 * H)
  })

  it('pools a late-night shift with an earlier one from the same calendar day', () => {
    const map = only([shift('a', 9, 6), shift('b', 22, 4)], [job()])
    const t = sumBreakdowns(map.values())
    // Both start on the 10th => 10h that day => 2h of tier 1.
    expect(t.regularSecs).toBe(8 * H)
    expect(t.tier1Secs).toBe(2 * H)
  })
})

describe('edge cases', () => {
  it('handles a zero-length shift', () => {
    const b = only([shift('a', 9, 0)], [job()]).get('a')!
    expect(b.workedSecs).toBe(0)
    expect(b.totalAgorot).toBe(0)
  })

  it('ignores deleted shifts entirely', () => {
    const map = only([shift('a', 9, 8, { deleted: true })], [job()])
    expect(map.size).toBe(0)
  })

  it('still reports hours for a shift whose job is missing, with no pay', () => {
    const b = only([shift('a', 9, 8, { jobId: 'gone' })], [job()]).get('a')!
    expect(b.workedSecs).toBe(8 * H)
    expect(b.basePayAgorot).toBe(0)
  })

  it('adds extra pay on top of the hourly total', () => {
    const b = only([shift('a', 9, 4, { extraAgorot: 3500 })], [job()]).get('a')!
    expect(b.basePayAgorot).toBe(4 * 5000)
    expect(b.totalAgorot).toBe(4 * 5000 + 3500)
  })

  it('rounds pay to whole agorot rather than carrying floats', () => {
    // 1h 1s at ₪33.33/hr — must be an integer, never 3333.925.
    const s = shift('a', 9, 0, { endedAt: new Date(2026, 2, 10, 10, 0, 1).getTime() })
    const b = only([s], [job({ rateAgorot: 3333 })]).get('a')!
    expect(Number.isInteger(b.totalAgorot)).toBe(true)
    expect(b.totalAgorot).toBe(3334)
  })

  it('survives a spring-forward DST day without inventing or losing hours', () => {
    // Israel springs forward on 2026-03-27. A shift spanning the jump is 8h on the
    // clock face but 7h of real elapsed time, and pay follows real elapsed time.
    const start = new Date(2026, 2, 26, 22, 0, 0, 0).getTime()
    const end = new Date(2026, 2, 27, 6, 0, 0, 0).getTime()
    const s = shift('a', 22, 0, { startedAt: start, endedAt: end })
    const b = only([s], [job()]).get('a')!
    const realHours = (end - start) / 3600_000
    expect(b.workedSecs).toBe(Math.floor(realHours * H))
    expect(b.regularSecs + b.tier1Secs + b.tier2Secs).toBe(b.workedSecs)
  })

  it('conserves seconds across tiers for any duration', () => {
    for (let h = 0; h <= 16; h += 0.5) {
      const b = only([shift('x', 6, h)], [job()]).get('x')!
      expect(b.regularSecs + b.tier1Secs + b.tier2Secs).toBe(b.workedSecs)
    }
  })
})

describe('grouping', () => {
  it('separates totals by job', () => {
    const jobA = job({ id: 'j1' })
    const jobB = job({ id: 'j2', rateAgorot: 10000 })
    const map = only(
      [shift('a', 8, 4, { jobId: 'j1' }), shift('b', 13, 3, { jobId: 'j2' })],
      [jobA, jobB],
    )
    const byJob = groupByJob(map.values())
    expect(byJob.get('j1')!.workedSecs).toBe(4 * H)
    expect(byJob.get('j1')!.totalAgorot).toBe(4 * 5000)
    expect(byJob.get('j2')!.workedSecs).toBe(3 * H)
    expect(byJob.get('j2')!.totalAgorot).toBe(3 * 10000)
  })
})
