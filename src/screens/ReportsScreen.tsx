import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { InvoicePanel } from '../components/InvoicePanel'
import { JobDonut, JobLegend, type DonutSlice } from '../components/charts/JobDonut'
import { StackedWeekBars, type DayBar } from '../components/charts/StackedWeekBars'
import { ChevronLeft, ChevronRight, DownloadIcon } from '../components/ui/icons'
import { AnimatedNumber } from '../components/ui/AnimatedNumber'
import { Button, Card, Divider, SectionTitle, Segmented } from '../components/ui/primitives'
import { Header, Screen } from './TimerScreen'
import { downloadFile, shiftsToCsv } from '../lib/csv'
import {
  dayKey,
  daysInRange,
  formatRangeLabel,
  periodRange,
  shiftPeriod,
  type PeriodKind,
} from '../lib/dates'
import { hm, humanDuration, money, multToPercent } from '../lib/format'
import { useNow } from '../lib/hooks'
import { computeBreakdowns, groupByDayAndJob, groupByJob, sumBreakdowns } from '../lib/pay'
import { allLiveJobs, jobsById, liveShifts, runningShift, shiftsInRange, useStore } from '../lib/store'

export function ReportsScreen() {
  const jobs = useStore((s) => s.jobs)
  const shifts = useStore((s) => s.shifts)
  const settings = useStore((s) => s.settings)

  const [kind, setKind] = useState<PeriodKind>('week')
  const [cursor, setCursor] = useState(() => Date.now())

  const running = useMemo(() => runningShift(shifts), [shifts])
  const now = useNow(30_000, Boolean(running))

  const jobList = useMemo(() => allLiveJobs(jobs), [jobs])
  const byId = useMemo(() => jobsById(jobs), [jobs])
  const range = useMemo(() => periodRange(cursor, kind, settings), [cursor, kind, settings])

  const periodShifts = useMemo(
    () => shiftsInRange(liveShifts(shifts), range.start, range.end),
    [shifts, range.start, range.end],
  )
  const breakdowns = useMemo(
    () => computeBreakdowns(periodShifts, byId, now),
    [periodShifts, byId, now],
  )
  const totals = useMemo(() => sumBreakdowns(breakdowns.values()), [breakdowns])
  const perJob = useMemo(() => groupByJob(breakdowns.values()), [breakdowns])
  const perDayJob = useMemo(() => groupByDayAndJob(breakdowns.values()), [breakdowns])

  // A month has too many days for one bar per day to be readable, so month view
  // aggregates into weeks instead.
  const bars: DayBar[] = useMemo(() => {
    const days = daysInRange(range)
    if (days.length <= 14) {
      return days.map((d) => {
        const key = dayKey(d.getTime())
        const segments = perDayJob.get(key) ?? new Map<string, number>()
        let total = 0
        for (const v of segments.values()) total += v
        return { key, date: d, segments, totalSecs: total }
      })
    }
    const weeks = new Map<string, DayBar>()
    days.forEach((d, i) => {
      const bucketKey = `w${Math.floor(i / 7)}`
      let bucket = weeks.get(bucketKey)
      if (!bucket) {
        bucket = { key: bucketKey, date: d, segments: new Map(), totalSecs: 0 }
        weeks.set(bucketKey, bucket)
      }
      const segments = perDayJob.get(dayKey(d.getTime()))
      if (segments) {
        for (const [jobId, secs] of segments) {
          bucket.segments.set(jobId, (bucket.segments.get(jobId) ?? 0) + secs)
          bucket.totalSecs += secs
        }
      }
    })
    return [...weeks.values()]
  }, [range, perDayJob])

  const slices: DonutSlice[] = useMemo(
    () =>
      jobList
        .map((j) => ({ jobId: j.id, secs: perJob.get(j.id)?.workedSecs ?? 0 }))
        .filter((s) => s.secs > 0)
        .sort((a, b) => b.secs - a.secs),
    [jobList, perJob],
  )

  const isMonthly = daysInRange(range).length > 14

  function exportCsv() {
    const csv = shiftsToCsv(periodShifts, breakdowns, byId, settings)
    const name = `hours-${format(range.start, 'yyyy-MM-dd')}-to-${format(range.end, 'yyyy-MM-dd')}.csv`
    downloadFile(name, csv)
  }

  return (
    <Screen>
      <Header title="Reports" />

      <Segmented
        options={[
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
          { value: 'payPeriod', label: 'Pay period' },
        ]}
        value={kind}
        onChange={setKind}
      />

      <div className="flex items-center justify-between mt-3 mb-4">
        <button
          type="button"
          aria-label="Previous period"
          onClick={() => setCursor((c) => shiftPeriod(c, kind, settings, -1))}
          className="grid place-items-center size-9 rounded-full bg-surface edge text-brand press"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="t-label tabular text-center px-2 text-ink">
          {formatRangeLabel(range, kind)}
        </div>
        <button
          type="button"
          aria-label="Next period"
          onClick={() => setCursor((c) => shiftPeriod(c, kind, settings, 1))}
          className="grid place-items-center size-9 rounded-full bg-surface edge text-brand press"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Headline */}
      <Card className="p-5">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="t-micro text-muted uppercase">Total hours</div>
            <div className="tabular font-extrabold text-ink text-[32px] leading-none tracking-[-0.042em] mt-1.5">
              {hm(totals.workedSecs)}
            </div>
          </div>
          <div className="text-right min-w-0">
            <div className="t-micro text-muted uppercase">Gross pay</div>
            <AnimatedNumber
              value={totals.totalAgorot}
              format={(v) => money(v, settings.currencySymbol)}
              className="block tabular font-extrabold text-brand text-[32px] leading-none tracking-[-0.042em] mt-1.5"
            />
          </div>
        </div>
        <div className="t-small text-muted mt-2.5 tabular">
          {totals.shiftCount} shift{totals.shiftCount === 1 ? '' : 's'}
          {totals.tier1Secs + totals.tier2Secs > 0
            ? ` · ${humanDuration(totals.tier1Secs + totals.tier2Secs)} overtime`
            : ''}
        </div>
      </Card>

      {/* Hours per day */}
      <div className="mt-5">
        <SectionTitle>{isMonthly ? 'Hours by week' : 'Hours by day'}</SectionTitle>
        <Card className="p-4">
          <StackedWeekBars days={bars} jobs={jobList} />
        </Card>
      </div>

      {/* Grouped by job */}
      <div className="mt-5">
        <SectionTitle>Grouped by job</SectionTitle>
        <Card className="p-4">
          <div className="flex items-center gap-4">
            <div className="shrink-0">
              <JobDonut slices={slices} jobs={jobList} />
            </div>
            <div className="flex-1 min-w-0">
              <JobLegend slices={slices} jobs={jobList} total={totals.workedSecs} />
            </div>
          </div>
        </Card>
      </div>

      {/* Per-job earnings breakdown */}
      <div className="mt-5">
        <SectionTitle>Earnings breakdown</SectionTitle>
        <Card className="p-4">
          {slices.length === 0 ? (
            <div className="py-6 text-center t-small text-muted">
              Nothing to break down in this period.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {jobList.map((job) => {
                const t = perJob.get(job.id)
                if (!t || t.workedSecs === 0) return null
                return (
                  <div key={job.id}>
                    <div className="flex items-center justify-between">
                      <span className="t-label text-ink truncate">{job.name}</span>
                      <span className="t-label text-brand tabular">
                        {money(t.totalAgorot, settings.currencySymbol)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-col gap-1 t-small">
                      <LineItem label="Regular" hours={t.regularSecs} note="100%" />
                      {t.tier1Secs > 0 ? (
                        <LineItem
                          label="Overtime"
                          hours={t.tier1Secs}
                          note={multToPercent(job.otTier1Mult)}
                        />
                      ) : null}
                      {t.tier2Secs > 0 ? (
                        <LineItem
                          label="Overtime"
                          hours={t.tier2Secs}
                          note={multToPercent(job.otTier2Mult)}
                        />
                      ) : null}
                      {t.extraAgorot !== 0 ? (
                        <div className="flex items-center justify-between text-muted">
                          <span>Extra pay</span>
                          <span className="tabular">
                            {money(t.extraAgorot, settings.currencySymbol)}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )
              })}
              <Divider />
              <div className="flex items-center justify-between">
                <span className="t-label text-ink">Total</span>
                <AnimatedNumber
                  value={totals.totalAgorot}
                  format={(v) => money(v, settings.currencySymbol)}
                  className="t-h3 text-brand tabular"
                />
              </div>
            </div>
          )}
        </Card>
      </div>

      <Button variant="surface" size="lg" className="w-full mt-6" onClick={exportCsv}>
        <DownloadIcon size={18} /> Export this period as CSV
      </Button>

      {/* Invoicing spans all time, not the selected period, so it sits below the
          period-scoped sections rather than inside them. */}
      <InvoicePanel />

      <p className="t-small text-muted text-center mt-3 px-6 leading-relaxed">
        Figures are an estimate based on the rates you entered. Always check them against your
        actual payslip.
      </p>
    </Screen>
  )
}

function LineItem({ label, hours, note }: { label: string; hours: number; note: string }) {
  return (
    <div className="flex items-center justify-between text-muted">
      <span>
        {label} <span className="text-faint">({note})</span>
      </span>
      <span className="tabular">{hm(hours)}</span>
    </div>
  )
}
