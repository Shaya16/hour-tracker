/**
 * Pay & hours engine — pure functions, no React, no store, no ambient clock.
 *
 * The single most important rule here: **overtime accrues per job, per calendar day —
 * not per shift.** Two 5-hour shifts at the same job on one day must cross the 8-hour
 * threshold; two 5-hour shifts at *different* jobs must not, because they are separate
 * employers with separate obligations. Getting that wrong silently under- or over-states
 * pay, which is the whole reason this app exists.
 */

import { dayKey } from './dates'
import type { Job, Shift } from './types'

const SECS_PER_HOUR = 3600

/** Seconds of an in-progress break that have not yet been folded into `breakSecs`. */
function openBreakSecs(shift: Shift, now: number): number {
  if (shift.endedAt !== null || shift.pausedAt === null) return 0
  return Math.max(0, Math.floor((now - shift.pausedAt) / 1000))
}

/** Seconds actually worked, break already deducted. Never negative. */
export function workedSecs(shift: Shift, now: number): number {
  const end = shift.endedAt ?? now
  const gross = Math.max(0, Math.floor((end - shift.startedAt) / 1000))
  return Math.max(0, gross - shift.breakSecs - openBreakSecs(shift, now))
}

/** Total elapsed wall-clock seconds, breaks included. */
export function elapsedSecs(shift: Shift, now: number): number {
  const end = shift.endedAt ?? now
  return Math.max(0, Math.floor((end - shift.startedAt) / 1000))
}

/** Break seconds including any break currently in progress. */
export function totalBreakSecs(shift: Shift, now: number): number {
  return shift.breakSecs + openBreakSecs(shift, now)
}

export function isRunning(shift: Shift): boolean {
  return shift.endedAt === null
}

export function isOnBreak(shift: Shift): boolean {
  return shift.endedAt === null && shift.pausedAt !== null
}

/** Overtime tier boundaries for a job, expressed in seconds of daily worked time. */
function tierBounds(job: Job): { t1: number; t2: number } {
  if (!job.overtimeEnabled) return { t1: Infinity, t2: Infinity }
  const t1 = job.otTier1AfterMins > 0 ? job.otTier1AfterMins * 60 : Infinity
  const rawT2 = job.otTier2AfterMins > 0 ? job.otTier2AfterMins * 60 : Infinity
  // A second tier at or below the first is meaningless — treat it as absent.
  const t2 = rawT2 > t1 ? rawT2 : Infinity
  return { t1, t2 }
}

/** Length of the overlap between [aStart,aEnd) and [bStart,bEnd). */
function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart))
}

export function payForSecs(secs: number, rateAgorot: number, mult: number): number {
  return Math.round((secs * rateAgorot * mult) / SECS_PER_HOUR)
}

export interface ShiftBreakdown {
  shiftId: string
  jobId: string
  dayKey: string
  workedSecs: number
  breakSecs: number
  regularSecs: number
  tier1Secs: number
  tier2Secs: number
  /** Pay for hours worked, overtime multipliers applied. */
  basePayAgorot: number
  /** Tips / bonus / reimbursement recorded on the shift. */
  extraAgorot: number
  totalAgorot: number
}

function emptyBreakdown(shift: Shift): ShiftBreakdown {
  return {
    shiftId: shift.id,
    jobId: shift.jobId,
    dayKey: dayKey(shift.startedAt),
    workedSecs: 0,
    breakSecs: 0,
    regularSecs: 0,
    tier1Secs: 0,
    tier2Secs: 0,
    basePayAgorot: 0,
    extraAgorot: 0,
    totalAgorot: 0,
  }
}

/**
 * Compute a breakdown for every shift.
 *
 * Shifts are grouped by (job, start-day) and processed in chronological order so each
 * shift's hours are placed against that day's running total. A shift that begins before
 * a threshold and runs past it is split across tiers.
 *
 * Pass the *full* set of shifts for any day you care about — handing in a filtered
 * subset (say, one shift of a two-shift day) would understate that day's overtime.
 */
export function computeBreakdowns(
  shifts: Shift[],
  jobsById: Map<string, Job>,
  now: number,
): Map<string, ShiftBreakdown> {
  const out = new Map<string, ShiftBreakdown>()

  // Bucket by job + calendar day of the shift's start.
  const buckets = new Map<string, Shift[]>()
  for (const s of shifts) {
    if (s.deleted) continue
    const key = `${s.jobId}|${dayKey(s.startedAt)}`
    const arr = buckets.get(key)
    if (arr) arr.push(s)
    else buckets.set(key, [s])
  }

  for (const [key, bucket] of buckets) {
    const jobId = key.slice(0, key.indexOf('|'))
    const job = jobsById.get(jobId)
    bucket.sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id))

    if (!job) {
      // Orphaned shift: still count the hours, but there is no rate to pay them at.
      for (const s of bucket) {
        const b = emptyBreakdown(s)
        b.workedSecs = workedSecs(s, now)
        b.breakSecs = totalBreakSecs(s, now)
        b.regularSecs = b.workedSecs
        b.extraAgorot = s.extraAgorot
        b.totalAgorot = s.extraAgorot
        out.set(s.id, b)
      }
      continue
    }

    const { t1, t2 } = tierBounds(job)
    let cumulative = 0

    for (const s of bucket) {
      const worked = workedSecs(s, now)
      const from = cumulative
      const to = cumulative + worked

      const regularSecs = overlap(from, to, 0, t1)
      const tier1Secs = overlap(from, to, t1, t2)
      const tier2Secs = overlap(from, to, t2, Infinity)

      const basePayAgorot =
        payForSecs(regularSecs, job.rateAgorot, 1) +
        payForSecs(tier1Secs, job.rateAgorot, job.otTier1Mult) +
        payForSecs(tier2Secs, job.rateAgorot, job.otTier2Mult)

      out.set(s.id, {
        shiftId: s.id,
        jobId: s.jobId,
        dayKey: dayKey(s.startedAt),
        workedSecs: worked,
        breakSecs: totalBreakSecs(s, now),
        regularSecs,
        tier1Secs,
        tier2Secs,
        basePayAgorot,
        extraAgorot: s.extraAgorot,
        totalAgorot: basePayAgorot + s.extraAgorot,
      })

      cumulative = to
    }
  }

  return out
}

export interface Totals {
  workedSecs: number
  regularSecs: number
  tier1Secs: number
  tier2Secs: number
  basePayAgorot: number
  extraAgorot: number
  totalAgorot: number
  shiftCount: number
}

export const ZERO_TOTALS: Totals = {
  workedSecs: 0,
  regularSecs: 0,
  tier1Secs: 0,
  tier2Secs: 0,
  basePayAgorot: 0,
  extraAgorot: 0,
  totalAgorot: 0,
  shiftCount: 0,
}

function accumulate(target: Totals, b: ShiftBreakdown): void {
  target.workedSecs += b.workedSecs
  target.regularSecs += b.regularSecs
  target.tier1Secs += b.tier1Secs
  target.tier2Secs += b.tier2Secs
  target.basePayAgorot += b.basePayAgorot
  target.extraAgorot += b.extraAgorot
  target.totalAgorot += b.totalAgorot
  target.shiftCount += 1
}

export function sumBreakdowns(items: Iterable<ShiftBreakdown>): Totals {
  const t: Totals = { ...ZERO_TOTALS }
  for (const b of items) accumulate(t, b)
  return t
}

/** Group breakdowns by job id. */
export function groupByJob(items: Iterable<ShiftBreakdown>): Map<string, Totals> {
  const out = new Map<string, Totals>()
  for (const b of items) {
    let cur = out.get(b.jobId)
    if (!cur) {
      cur = { ...ZERO_TOTALS }
      out.set(b.jobId, cur)
    }
    accumulate(cur, b)
  }
  return out
}

/** Group breakdowns by 'YYYY-MM-DD'. */
export function groupByDay(items: Iterable<ShiftBreakdown>): Map<string, Totals> {
  const out = new Map<string, Totals>()
  for (const b of items) {
    let cur = out.get(b.dayKey)
    if (!cur) {
      cur = { ...ZERO_TOTALS }
      out.set(b.dayKey, cur)
    }
    accumulate(cur, b)
  }
  return out
}

/** Per-day, per-job worked seconds — the shape the stacked bar chart consumes. */
export function groupByDayAndJob(
  items: Iterable<ShiftBreakdown>,
): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>()
  for (const b of items) {
    let day = out.get(b.dayKey)
    if (!day) {
      day = new Map()
      out.set(b.dayKey, day)
    }
    day.set(b.jobId, (day.get(b.jobId) ?? 0) + b.workedSecs)
  }
  return out
}
