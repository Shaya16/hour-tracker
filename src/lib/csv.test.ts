import { describe, expect, it } from 'vitest'
import { shiftsToCsv } from './csv'
import { computeBreakdowns } from './pay'
import { DEFAULT_SETTINGS, type Job, type Shift } from './types'

const H = 3600_000

const job: Job = {
  id: 'j1',
  name: 'Cafe',
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
}

function shift(id: string, startHour: number, hours: number, over: Partial<Shift> = {}): Shift {
  const start = new Date(2026, 2, 10, startHour, 0, 0, 0).getTime()
  return {
    id,
    jobId: 'j1',
    startedAt: start,
    endedAt: start + hours * H,
    breakSecs: 0,
    pausedAt: null,
    note: '',
    extraAgorot: 0,
    updatedAt: 0,
    deleted: false,
    ...over,
  }
}

function build(shifts: Shift[], jobs: Job[] = [job]) {
  const byId = new Map(jobs.map((j) => [j.id, j]))
  const breakdowns = computeBreakdowns(shifts, byId, Date.now())
  return shiftsToCsv(shifts, breakdowns, byId, DEFAULT_SETTINGS)
}

describe('shiftsToCsv', () => {
  it('emits a header row', () => {
    const csv = build([shift('a', 9, 8)])
    expect(csv.split('\r\n')[0]).toBe(
      'Date,Job,Start,End,Break (min),Worked (h),Regular (h),Overtime 1 (h),Overtime 2 (h),Rate,Base pay,Extra pay,Total pay,Note',
    )
  })

  it('writes hours as decimals a spreadsheet can sum', () => {
    const csv = build([shift('a', 9, 8, { breakSecs: 30 * 60 })])
    const row = csv.split('\r\n')[1]!.split(',')
    expect(row[4]).toBe('30') // break minutes
    expect(row[5]).toBe('7.5') // worked hours
    expect(row[12]).toBe('375.00') // 7.5 * 50
  })

  it('splits overtime into its own columns', () => {
    const csv = build([shift('a', 8, 11)])
    const row = csv.split('\r\n')[1]!.split(',')
    expect(row[6]).toBe('8') // regular
    expect(row[7]).toBe('2') // tier 1
    expect(row[8]).toBe('1') // tier 2
    expect(row[12]).toBe('600.00')
  })

  it('orders rows chronologically regardless of input order', () => {
    const csv = build([shift('b', 14, 2), shift('a', 6, 2)])
    const lines = csv.split('\r\n')
    expect(lines[1]).toContain('06:00')
    expect(lines[2]).toContain('14:00')
  })

  it('marks a running shift rather than inventing an end time', () => {
    const csv = build([shift('a', 9, 0, { endedAt: null })])
    expect(csv.split('\r\n')[1]).toContain('(running)')
  })

  it('ends with a TOTAL row that matches the sum of the rows', () => {
    const csv = build([shift('a', 6, 4), shift('b', 14, 4)])
    const lines = csv.split('\r\n').filter(Boolean)
    const total = lines[lines.length - 1]!.split(',')
    expect(total[0]).toBe('TOTAL')
    expect(total[5]).toBe('8') // 4 + 4 hours
    expect(total[12]).toBe('400.00') // 8 * 50
  })

  it('quotes a note containing a comma so columns do not shift', () => {
    const csv = build([shift('a', 9, 4, { note: 'Late, covered for Dana' })])
    expect(csv).toContain('"Late, covered for Dana"')
    // The row must still have exactly the header's column count.
    const headerCols = csv.split('\r\n')[0]!.split(',').length
    const rowCols = csv.split('\r\n')[1]!.match(/(".*?"|[^,]*)(,|$)/g)!.length - 1
    expect(rowCols).toBe(headerCols)
  })

  it('escapes embedded quotes by doubling them', () => {
    const csv = build([shift('a', 9, 4, { note: 'Said "hello"' })])
    expect(csv).toContain('"Said ""hello"""')
  })

  it('keeps a note with a newline inside one quoted field', () => {
    const csv = build([shift('a', 9, 4, { note: 'line one\nline two' })])
    expect(csv).toContain('"line one\nline two"')
  })

  it('handles a Hebrew note without mangling it', () => {
    const csv = build([shift('a', 9, 4, { note: 'משמרת ערב' })])
    expect(csv).toContain('משמרת ערב')
  })

  it('includes extra pay in the total', () => {
    const csv = build([shift('a', 9, 4, { extraAgorot: 2550 })])
    const row = csv.split('\r\n')[1]!.split(',')
    expect(row[10]).toBe('200.00') // base
    expect(row[11]).toBe('25.50') // extra
    expect(row[12]).toBe('225.50') // total
  })

  it('produces only a header and total for an empty period', () => {
    const csv = build([])
    const lines = csv.split('\r\n').filter(Boolean)
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain('TOTAL')
  })
})
