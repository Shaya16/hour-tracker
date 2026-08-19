import { describe, expect, it } from 'vitest'
import { invoicedThrough, jobBalances, previewInvoice } from './invoices'
import type { Invoice, Job, Shift } from './types'

const H = 3600_000

function job(id: string, rate = 5000): Job {
  return {
    id,
    name: id,
    color: 'brand',
    rateAgorot: rate,
    defaultBreakMins: 0,
    // Overtime off keeps these expectations about invoicing, not about tiers.
    overtimeEnabled: false,
    otTier1AfterMins: 480,
    otTier1Mult: 1.25,
    otTier2AfterMins: 600,
    otTier2Mult: 1.5,
    archived: false,
    createdAt: 0,
    updatedAt: 0,
    deleted: false,
  }
}

/** A `hours`-long shift at `jobId`, starting on day `day` of March 2026 at 09:00. */
function shift(id: string, jobId: string, day: number, hours: number, over: Partial<Shift> = {}): Shift {
  const start = new Date(2026, 2, day, 9, 0, 0, 0).getTime()
  return {
    id,
    jobId,
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

function invoice(id: string, jobId: string, endDay: number, over: Partial<Invoice> = {}): Invoice {
  const periodEnd = new Date(2026, 2, endDay, 23, 59, 59, 999).getTime()
  return {
    id,
    jobId,
    periodEnd,
    hoursSecs: 0,
    amountAgorot: 0,
    status: 'requested',
    requestedAt: periodEnd,
    paidAt: null,
    note: '',
    updatedAt: 0,
    deleted: false,
    ...over,
  }
}

const NOW = new Date(2026, 2, 31, 12, 0, 0, 0).getTime()
const byId = (jobs: Job[]) => new Map(jobs.map((j) => [j.id, j]))

describe('invoicedThrough', () => {
  it('is zero when nothing has been claimed', () => {
    expect(invoicedThrough([], 'a')).toBe(0)
  })

  it('takes the latest period end, not the latest created', () => {
    const older = invoice('i1', 'a', 20)
    const newer = invoice('i2', 'a', 10)
    expect(invoicedThrough([older, newer], 'a')).toBe(older.periodEnd)
  })

  it('ignores other jobs', () => {
    expect(invoicedThrough([invoice('i1', 'b', 20)], 'a')).toBe(0)
  })

  it('ignores deleted invoices', () => {
    expect(invoicedThrough([invoice('i1', 'a', 20, { deleted: true })], 'a')).toBe(0)
  })
})

describe('jobBalances', () => {
  const jobs = [job('a'), job('b', 6000)]

  it('treats everything as uninvoiced before any invoice exists', () => {
    const shifts = [shift('s1', 'a', 5, 8), shift('s2', 'a', 6, 4)]
    const bal = jobBalances(shifts, [], byId(jobs), NOW).get('a')!
    expect(bal.uninvoicedSecs).toBe(12 * 3600)
    expect(bal.uninvoicedAgorot).toBe(12 * 5000)
  })

  it('excludes shifts covered by an invoice', () => {
    const shifts = [shift('s1', 'a', 5, 8), shift('s2', 'a', 20, 4)]
    // Claimed through the 10th: the first shift is covered, the second is not.
    const bal = jobBalances(shifts, [invoice('i1', 'a', 10)], byId(jobs), NOW).get('a')!
    expect(bal.uninvoicedSecs).toBe(4 * 3600)
    expect(bal.uninvoicedAgorot).toBe(4 * 5000)
  })

  it('keeps a late-added shift inside an already-invoiced period covered', () => {
    // Logged after the fact, for a day that was already claimed — it must not
    // reappear as new outstanding work.
    const shifts = [shift('late', 'a', 3, 5)]
    const bal = jobBalances(shifts, [invoice('i1', 'a', 10)], byId(jobs), NOW).get('a')!
    expect(bal.uninvoicedSecs).toBe(0)
  })

  it('separates awaiting payment from paid', () => {
    const invoices = [
      invoice('i1', 'a', 10, { amountAgorot: 30000, status: 'paid', paidAt: NOW }),
      invoice('i2', 'a', 20, { amountAgorot: 12000, status: 'requested' }),
    ]
    const bal = jobBalances([], invoices, byId(jobs), NOW).get('a')!
    expect(bal.paidAgorot).toBe(30000)
    expect(bal.awaitingAgorot).toBe(12000)
    expect(bal.awaitingCount).toBe(1)
  })

  it('keeps jobs independent', () => {
    const shifts = [shift('s1', 'a', 20, 5), shift('s2', 'b', 20, 5)]
    // Only job A has been invoiced; job B's hours stay outstanding.
    const balances = jobBalances(shifts, [invoice('i1', 'a', 25)], byId(jobs), NOW)
    expect(balances.get('a')!.uninvoicedSecs).toBe(0)
    expect(balances.get('b')!.uninvoicedSecs).toBe(5 * 3600)
    expect(balances.get('b')!.uninvoicedAgorot).toBe(5 * 6000)
  })

  it('ignores deleted shifts', () => {
    const shifts = [shift('s1', 'a', 20, 5, { deleted: true })]
    expect(jobBalances(shifts, [], byId(jobs), NOW).get('a')!.uninvoicedSecs).toBe(0)
  })

  it('reports a zero balance for a job with no activity', () => {
    const bal = jobBalances([], [], byId(jobs), NOW).get('b')!
    expect(bal.uninvoicedAgorot).toBe(0)
    expect(bal.awaitingAgorot).toBe(0)
    expect(bal.paidAgorot).toBe(0)
  })
})

describe('previewInvoice', () => {
  const jobs = [job('a')]

  it('covers everything since the last invoice up to the chosen end', () => {
    const shifts = [shift('s1', 'a', 5, 8), shift('s2', 'a', 15, 4), shift('s3', 'a', 25, 6)]
    const periodEnd = new Date(2026, 2, 20, 23, 59).getTime()
    const p = previewInvoice(shifts, [invoice('i1', 'a', 10)], byId(jobs), 'a', periodEnd, NOW)
    // s1 already claimed, s3 beyond the chosen end — only s2 counts.
    expect(p.shiftCount).toBe(1)
    expect(p.hoursSecs).toBe(4 * 3600)
    expect(p.amountAgorot).toBe(4 * 5000)
  })

  it('covers all history when nothing has been invoiced', () => {
    const shifts = [shift('s1', 'a', 5, 8), shift('s2', 'a', 15, 4)]
    const periodEnd = new Date(2026, 2, 30).getTime()
    const p = previewInvoice(shifts, [], byId(jobs), 'a', periodEnd, NOW)
    expect(p.shiftCount).toBe(2)
    expect(p.amountAgorot).toBe(12 * 5000)
  })

  it('returns zero when there is nothing new to claim', () => {
    const shifts = [shift('s1', 'a', 5, 8)]
    const periodEnd = new Date(2026, 2, 30).getTime()
    const p = previewInvoice(shifts, [invoice('i1', 'a', 10)], byId(jobs), 'a', periodEnd, NOW)
    expect(p.shiftCount).toBe(0)
    expect(p.amountAgorot).toBe(0)
  })

  it('includes extra pay in the claim', () => {
    const shifts = [shift('s1', 'a', 5, 4, { extraAgorot: 2500 })]
    const periodEnd = new Date(2026, 2, 30).getTime()
    const p = previewInvoice(shifts, [], byId(jobs), 'a', periodEnd, NOW)
    expect(p.amountAgorot).toBe(4 * 5000 + 2500)
  })
})

describe('snapshot semantics', () => {
  it('does not restate a raised invoice when a covered shift is later edited', () => {
    const jobs = [job('a')]
    const raised = invoice('i1', 'a', 10, { amountAgorot: 40000, hoursSecs: 8 * 3600 })
    // The shift it covered gets corrected afterwards.
    const shifts = [shift('s1', 'a', 5, 20)]
    const bal = jobBalances(shifts, [raised], byId(jobs), NOW).get('a')!
    // The claim stands at what was actually asked for.
    expect(raised.amountAgorot).toBe(40000)
    expect(bal.awaitingAgorot).toBe(40000)
    // And the corrected shift is still treated as covered, not as new work.
    expect(bal.uninvoicedSecs).toBe(0)
  })
})
