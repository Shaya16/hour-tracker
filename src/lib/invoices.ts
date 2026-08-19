/**
 * Invoice and payment tracking — pure functions over shifts and invoices.
 *
 * The question this answers is "what am I still owed?", which splits three ways:
 *
 *   uninvoiced  worked, but not yet claimed from the employer
 *   awaiting    claimed, not yet paid
 *   paid        settled
 *
 * Coverage is by *time*, not by linking individual shifts. An invoice covers everything
 * at one job up to `periodEnd`, which is how hourly work is actually billed — you submit
 * "my hours through the 31st", not a hand-picked list of shifts. It also means a shift
 * added late, for a day that was already invoiced, correctly shows as already claimed
 * rather than appearing as new outstanding work.
 */

import { computeBreakdowns, sumBreakdowns, type ShiftBreakdown } from './pay'
import type { Invoice, Job, Shift } from './types'

export function liveInvoices(invoices: Invoice[]): Invoice[] {
  return invoices.filter((i) => !i.deleted)
}

/** Invoices for one job, newest period first. */
export function invoicesForJob(invoices: Invoice[], jobId: string): Invoice[] {
  return liveInvoices(invoices)
    .filter((i) => i.jobId === jobId)
    .sort((a, b) => b.periodEnd - a.periodEnd)
}

/**
 * The instant up to which this job has already been invoiced.
 * Returns 0 when nothing has been claimed yet, so every shift counts as outstanding.
 */
export function invoicedThrough(invoices: Invoice[], jobId: string): number {
  let latest = 0
  for (const i of liveInvoices(invoices)) {
    if (i.jobId === jobId && i.periodEnd > latest) latest = i.periodEnd
  }
  return latest
}

export interface JobBalance {
  jobId: string
  /** Worked but not yet claimed. */
  uninvoicedSecs: number
  uninvoicedAgorot: number
  /** Claimed, not yet paid. */
  awaitingAgorot: number
  awaitingCount: number
  /** Settled. */
  paidAgorot: number
  invoicedThrough: number
}

const EMPTY_BALANCE = (jobId: string): JobBalance => ({
  jobId,
  uninvoicedSecs: 0,
  uninvoicedAgorot: 0,
  awaitingAgorot: 0,
  awaitingCount: 0,
  paidAgorot: 0,
  invoicedThrough: 0,
})

/**
 * Work out where each job stands.
 *
 * Breakdowns are computed over *all* shifts rather than only the uninvoiced ones,
 * because overtime accrues across a whole day — slicing the day at the invoice
 * boundary first would misprice a shift that straddles it.
 */
export function jobBalances(
  shifts: Shift[],
  invoices: Invoice[],
  jobsById: Map<string, Job>,
  now: number,
): Map<string, JobBalance> {
  const breakdowns = computeBreakdowns(shifts, jobsById, now)
  const out = new Map<string, JobBalance>()

  for (const job of jobsById.values()) {
    out.set(job.id, { ...EMPTY_BALANCE(job.id), invoicedThrough: invoicedThrough(invoices, job.id) })
  }

  // Uninvoiced: anything started after the job's invoiced-through mark.
  const uninvoiced: ShiftBreakdown[] = []
  for (const s of shifts) {
    if (s.deleted) continue
    const bal = out.get(s.jobId)
    const b = breakdowns.get(s.id)
    if (!bal || !b) continue
    if (s.startedAt > bal.invoicedThrough) uninvoiced.push(b)
  }

  for (const b of uninvoiced) {
    const bal = out.get(b.jobId)
    if (!bal) continue
    bal.uninvoicedSecs += b.workedSecs
    bal.uninvoicedAgorot += b.totalAgorot
  }

  for (const i of liveInvoices(invoices)) {
    const bal = out.get(i.jobId)
    if (!bal) continue
    if (i.status === 'paid') bal.paidAgorot += i.amountAgorot
    else {
      bal.awaitingAgorot += i.amountAgorot
      bal.awaitingCount += 1
    }
  }

  return out
}

/**
 * What a new invoice raised now, covering up to `periodEnd`, would claim.
 * Used to prefill the amount so the figure matches what the app has been showing.
 */
export function previewInvoice(
  shifts: Shift[],
  invoices: Invoice[],
  jobsById: Map<string, Job>,
  jobId: string,
  periodEnd: number,
  now: number,
): { hoursSecs: number; amountAgorot: number; shiftCount: number } {
  const from = invoicedThrough(invoices, jobId)
  const breakdowns = computeBreakdowns(shifts, jobsById, now)
  const covered = shifts
    .filter((s) => !s.deleted && s.jobId === jobId && s.startedAt > from && s.startedAt <= periodEnd)
    .map((s) => breakdowns.get(s.id))
    .filter((b): b is ShiftBreakdown => Boolean(b))

  const totals = sumBreakdowns(covered)
  return {
    hoursSecs: totals.workedSecs,
    amountAgorot: totals.totalAgorot,
    shiftCount: covered.length,
  }
}

/** Totals across every job, for the summary row. */
export function overallBalance(balances: Iterable<JobBalance>) {
  let uninvoicedAgorot = 0
  let uninvoicedSecs = 0
  let awaitingAgorot = 0
  let paidAgorot = 0
  for (const b of balances) {
    uninvoicedAgorot += b.uninvoicedAgorot
    uninvoicedSecs += b.uninvoicedSecs
    awaitingAgorot += b.awaitingAgorot
    paidAgorot += b.paidAgorot
  }
  return { uninvoicedAgorot, uninvoicedSecs, awaitingAgorot, paidAgorot }
}
