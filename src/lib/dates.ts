import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import type { PayPeriodKind, Settings } from './types'

export type WeekStart = 0 | 1

export interface Range {
  /** Inclusive epoch ms. */
  start: number
  /** Inclusive epoch ms (end of the final day, .999). */
  end: number
}

/**
 * Stable local-calendar key for a timestamp: 'YYYY-MM-DD'.
 *
 * Deliberately built from local getters rather than toISOString(), which would shift
 * the day for anyone east of UTC — a shift starting 01:00 in Israel must not be filed
 * under the previous day.
 */
export function dayKey(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function dayKeyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

export function weekRange(ts: number, weekStartsOn: WeekStart): Range {
  const d = new Date(ts)
  return {
    start: startOfWeek(d, { weekStartsOn }).getTime(),
    end: endOfWeek(d, { weekStartsOn }).getTime(),
  }
}

export function monthRange(ts: number): Range {
  const d = new Date(ts)
  return { start: startOfMonth(d).getTime(), end: endOfMonth(d).getTime() }
}

export function dayRange(ts: number): Range {
  const d = new Date(ts)
  return { start: startOfDay(d).getTime(), end: endOfDay(d).getTime() }
}

/**
 * The pay period containing `ts`.
 *
 * Biweekly is phased off `anchor` so the cycle lines up with the real payroll calendar
 * rather than an arbitrary week boundary. Weekly/monthly ignore the anchor.
 */
export function payPeriodRange(ts: number, kind: PayPeriodKind, anchor: string, weekStartsOn: WeekStart): Range {
  if (kind === 'weekly') return weekRange(ts, weekStartsOn)
  if (kind === 'monthly') return monthRange(ts)

  const anchorDate = startOfDay(dayKeyToDate(anchor))
  const target = startOfDay(new Date(ts))
  const diff = differenceInCalendarDays(target, anchorDate)
  // Floor toward negative infinity so dates before the anchor still land on a boundary.
  const periods = Math.floor(diff / 14)
  const start = addDays(anchorDate, periods * 14)
  return { start: start.getTime(), end: endOfDay(addDays(start, 13)).getTime() }
}

export type PeriodKind = 'week' | 'month' | 'payPeriod'

export function periodRange(ts: number, kind: PeriodKind, settings: Settings): Range {
  if (kind === 'week') return weekRange(ts, settings.weekStartsOn)
  if (kind === 'month') return monthRange(ts)
  return payPeriodRange(ts, settings.payPeriod, settings.payPeriodAnchor, settings.weekStartsOn)
}

/** Step a period forward/backward by `dir` whole periods, returning a ts inside it. */
export function shiftPeriod(ts: number, kind: PeriodKind, settings: Settings, dir: 1 | -1): number {
  if (kind === 'month') return addMonths(new Date(ts), dir).getTime()
  const r = periodRange(ts, kind, settings)
  // Land one day outside the current range, then let periodRange snap it.
  return dir === 1 ? r.end + 12 * 3600_000 : r.start - 12 * 3600_000
}

/** Every day in a range, as local midnights. Used for the weekday bar chart. */
export function daysInRange(range: Range): Date[] {
  const out: Date[] = []
  let cur = startOfDay(new Date(range.start))
  const last = startOfDay(new Date(range.end))
  // Guard against runaway loops on a malformed range.
  let guard = 0
  while (cur.getTime() <= last.getTime() && guard++ < 400) {
    out.push(cur)
    cur = addDays(cur, 1)
  }
  return out
}

export function formatRangeLabel(range: Range, kind: PeriodKind): string {
  const s = new Date(range.start)
  const e = new Date(range.end)
  if (kind === 'month') return format(s, 'MMMM yyyy')
  const sameYear = s.getFullYear() === e.getFullYear()
  const sameMonth = sameYear && s.getMonth() === e.getMonth()
  if (sameMonth) return `${format(s, 'MMM d')} – ${format(e, 'd, yyyy')}`
  if (sameYear) return `${format(s, 'MMM d')} – ${format(e, 'MMM d, yyyy')}`
  return `${format(s, 'MMM d, yyyy')} – ${format(e, 'MMM d, yyyy')}`
}

/** The 7 days of the week containing `ts` — for the Shifts screen day strip. */
export function weekDays(ts: number, weekStartsOn: WeekStart): Date[] {
  const start = startOfWeek(new Date(ts), { weekStartsOn })
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export function isSameDay(a: number, b: number): boolean {
  return dayKey(a) === dayKey(b)
}

/** 'HH:mm' in local time — for <input type="time">. */
export function toTimeInput(ts: number): string {
  return format(new Date(ts), 'HH:mm')
}

/** 'YYYY-MM-DD' in local time — for <input type="date">. */
export function toDateInput(ts: number): string {
  return dayKey(ts)
}

/** Recombine a date input and a time input back into an epoch ms. */
export function fromDateTimeInput(dateStr: string, timeStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = timeStr.split(':').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0).getTime()
}
