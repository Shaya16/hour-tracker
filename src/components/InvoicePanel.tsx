import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ConfirmSheet, Sheet } from './ui/Sheet'
import { CheckIcon, TrashIcon } from './ui/icons'
import { Button, Card, Divider, Field, Input, SectionTitle, cx } from './ui/primitives'
import { toDateInput } from '../lib/dates'
import { hm, money, parseMoney } from '../lib/format'
import { useJobColors } from '../lib/hooks'
import { invoicesForJob, jobBalances, previewInvoice } from '../lib/invoices'
import { activeJobs, forJob, jobsById, liveShifts, useStore } from '../lib/store'
import type { Invoice } from '../lib/types'

/** End of the given local day — invoices cover whole days, not moments. */
function endOfDayMs(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999).getTime()
}

/**
 * Money owed, in three states: worked but not claimed, claimed but not paid, and paid.
 *
 * Tracking is per job because two employers pay separately — a claim to one says nothing
 * about what the other owes.
 */
export function InvoicePanel() {
  const jobs = useStore((s) => s.jobs)
  const shifts = useStore((s) => s.shifts)
  const invoices = useStore((s) => s.invoices)
  const settings = useStore((s) => s.settings)
  const addInvoice = useStore((s) => s.addInvoice)
  const updateInvoice = useStore((s) => s.updateInvoice)
  const removeInvoice = useStore((s) => s.removeInvoice)

  const colors = useJobColors()
  const selectedJobId = useStore((s) => s.selectedJobId)
  const live = useMemo(
    () => activeJobs(jobs).filter((j) => selectedJobId === null || j.id === selectedJobId),
    [jobs, selectedJobId],
  )
  const byId = useMemo(() => jobsById(jobs), [jobs])
  const allShifts = useMemo(() => liveShifts(shifts), [shifts])

  const [raisingFor, setRaisingFor] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Invoice | null>(null)

  const balances = useMemo(
    () => jobBalances(allShifts, invoices, byId, Date.now()),
    [allShifts, invoices, byId],
  )

  const history = useMemo(
    () =>
      forJob(
        invoices.filter((i) => !i.deleted),
        selectedJobId,
      )
        .sort((a, b) => b.periodEnd - a.periodEnd)
        .slice(0, 12),
    [invoices, selectedJobId],
  )

  if (live.length === 0) return null

  return (
    <>
      <SectionTitle>Getting paid</SectionTitle>
      <Card className="px-4">
        {live.map((job, i) => {
          const bal = balances.get(job.id)
          if (!bal) return null
          const c = colors[job.color]
          const nothingOutstanding = bal.uninvoicedAgorot === 0 && bal.awaitingAgorot === 0
          return (
            <div key={job.id}>
              {i > 0 ? <Divider /> : null}
              <div className="py-3.5">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full shrink-0" style={{ background: c.hex }} />
                  <span className="t-label text-ink truncate flex-1">{job.name}</span>
                  {bal.invoicedThrough > 0 ? (
                    <span className="t-micro text-muted tabular shrink-0">
                      invoiced to {format(bal.invoicedThrough, 'd MMM')}
                    </span>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-2 mt-2.5">
                  <Stat
                    label="Not invoiced"
                    value={money(bal.uninvoicedAgorot, settings.currencySymbol)}
                    sub={hm(bal.uninvoicedSecs)}
                    accent={bal.uninvoicedAgorot > 0}
                  />
                  <Stat
                    label="Awaiting payment"
                    value={money(bal.awaitingAgorot, settings.currencySymbol)}
                    sub={
                      bal.awaitingCount > 0
                        ? `${bal.awaitingCount} invoice${bal.awaitingCount === 1 ? '' : 's'}`
                        : '—'
                    }
                  />
                </div>

                {bal.uninvoicedAgorot > 0 ? (
                  <Button
                    variant="soft"
                    size="sm"
                    className="w-full mt-2.5"
                    onClick={() => setRaisingFor(job.id)}
                  >
                    Mark invoiced up to a date
                  </Button>
                ) : nothingOutstanding ? (
                  <p className="t-small text-muted mt-2">All settled.</p>
                ) : null}
              </div>
            </div>
          )
        })}
      </Card>

      {history.length > 0 ? (
        <>
          <SectionTitle>Invoice history</SectionTitle>
          <Card className="px-4">
            {history.map((inv, i) => {
              const job = byId.get(inv.jobId)
              const c = colors[job?.color ?? 'brand']
              const paid = inv.status === 'paid'
              return (
                <div key={inv.id}>
                  {i > 0 ? <Divider /> : null}
                  <div className="flex items-center gap-3 py-3">
                    <span
                      className="w-[3px] self-stretch rounded-full shrink-0"
                      style={{ background: c.hex }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="t-label text-ink truncate">
                        {job?.name ?? 'Deleted job'}
                      </div>
                      <div className="t-small text-muted tabular">
                        to {format(inv.periodEnd, 'd MMM yyyy')} · {hm(inv.hoursSecs)}
                        {inv.note ? ` · ${inv.note}` : ''}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="t-label tabular text-ink">
                        {money(inv.amountAgorot, settings.currencySymbol)}
                      </div>
                      <span
                        className="inline-flex items-center gap-1 h-[18px] px-1.5 mt-0.5 rounded-full t-micro"
                        style={{
                          background: paid ? colors.green.soft : colors.orange.soft,
                          color: paid ? colors.green.hex : colors.orange.hex,
                        }}
                      >
                        {paid ? <CheckIcon size={10} strokeWidth={3} /> : null}
                        {paid ? 'Paid' : 'Awaiting'}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      {!paid ? (
                        <button
                          type="button"
                          onClick={() => updateInvoice(inv.id, { status: 'paid', paidAt: Date.now() })}
                          aria-label="Mark as paid"
                          title="Mark as paid"
                          className="grid place-items-center size-8 rounded-full bg-brand-soft text-brand press"
                        >
                          <CheckIcon size={15} />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(inv)}
                        aria-label="Delete invoice"
                        title="Delete invoice"
                        className="grid place-items-center size-8 rounded-full text-faint press"
                      >
                        <TrashIcon size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </Card>
        </>
      ) : null}

      <RaiseInvoiceSheet
        jobId={raisingFor}
        onClose={() => setRaisingFor(null)}
        onCreate={(payload) => {
          addInvoice(payload)
          setRaisingFor(null)
        }}
      />

      <ConfirmSheet
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && removeInvoice(confirmDelete.id)}
        title="Delete this invoice?"
        body="The hours it covered will go back to being uninvoiced."
      />
    </>
  )
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub: string
  accent?: boolean
}) {
  return (
    <div className="bg-sunken rounded-[var(--radius-inner)] px-3 py-2">
      <div className="t-micro text-muted uppercase truncate">{label}</div>
      <div className={cx('t-label tabular truncate', accent && 'text-brand')}>{value}</div>
      <div className="t-micro text-muted tabular truncate">{sub}</div>
    </div>
  )
}

function RaiseInvoiceSheet({
  jobId,
  onClose,
  onCreate,
}: {
  jobId: string | null
  onClose: () => void
  onCreate: (payload: {
    jobId: string
    periodEnd: number
    hoursSecs: number
    amountAgorot: number
    note: string
  }) => void
}) {
  const jobs = useStore((s) => s.jobs)
  const shifts = useStore((s) => s.shifts)
  const invoices = useStore((s) => s.invoices)
  const settings = useStore((s) => s.settings)

  const byId = useMemo(() => jobsById(jobs), [jobs])
  const allShifts = useMemo(() => liveShifts(shifts), [shifts])
  const job = jobId ? byId.get(jobId) : undefined

  const [dateStr, setDateStr] = useState(() => toDateInput(Date.now()))
  const [amountOverride, setAmountOverride] = useState('')
  const [note, setNote] = useState('')

  // Reset the form each time the sheet opens on a different job.
  const [seededFor, setSeededFor] = useState<string | null>(null)
  if (jobId && seededFor !== jobId) {
    setSeededFor(jobId)
    setDateStr(toDateInput(Date.now()))
    setAmountOverride('')
    setNote('')
  }

  const periodEnd = endOfDayMs(dateStr)
  const preview = useMemo(
    () =>
      jobId
        ? previewInvoice(allShifts, invoices, byId, jobId, periodEnd, Date.now())
        : { hoursSecs: 0, amountAgorot: 0, shiftCount: 0 },
    [jobId, allShifts, invoices, byId, periodEnd],
  )

  const priorCount = jobId ? invoicesForJob(invoices, jobId).length : 0
  const amount = amountOverride.trim() === '' ? preview.amountAgorot : parseMoney(amountOverride)

  if (!jobId || !job) return null

  return (
    <Sheet
      open
      onClose={onClose}
      title="Mark as invoiced"
      footer={
        <Button
          size="lg"
          className="w-full"
          disabled={preview.shiftCount === 0 && amount === 0}
          onClick={() =>
            onCreate({
              jobId,
              periodEnd,
              hoursSecs: preview.hoursSecs,
              amountAgorot: amount,
              note: note.trim(),
            })
          }
        >
          Record invoice
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pt-1">
        <p className="t-small text-muted leading-relaxed">
          Records that you asked <span className="font-semibold text-ink">{job.name}</span> to pay
          for everything worked up to this date. Anything after it stays outstanding.
        </p>

        <Field label="Covers work up to and including">
          <Input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
        </Field>

        <div className="bg-surface rounded-[var(--radius-inner)] edge p-4">
          <div className="flex items-baseline justify-between">
            <span className="t-small text-muted">
              {preview.shiftCount} shift{preview.shiftCount === 1 ? '' : 's'}
              {priorCount > 0 ? ' since your last invoice' : ''}
            </span>
            <span className="t-label tabular text-ink">{hm(preview.hoursSecs)}</span>
          </div>
          <div className="flex items-baseline justify-between mt-1.5">
            <span className="t-small text-muted">Amount claimed</span>
            <span className="t-h3 tabular text-brand">
              {money(amount, settings.currencySymbol)}
            </span>
          </div>
        </div>

        <Field
          label={`Different amount (${settings.currencySymbol})`}
          hint="Leave empty to claim the calculated total"
        >
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            placeholder={(preview.amountAgorot / 100).toFixed(2)}
            value={amountOverride}
            onChange={(e) => setAmountOverride(e.target.value)}
          />
        </Field>

        <Field label="Note" hint="Invoice number, or how you sent it">
          <Input
            type="text"
            placeholder="Optional"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>

        <p className="t-small text-muted leading-relaxed">
          The hours and amount are saved as they stand now. Editing one of these shifts later
          will not change what this invoice says you asked for.
        </p>
      </div>
    </Sheet>
  )
}
