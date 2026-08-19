import { useMemo, useState } from 'react'
import { addDays, addMonths, format, isSameDay as sameDay, startOfDay } from 'date-fns'
import { QuickLog } from '../components/QuickLog'
import { ShiftRow } from '../components/ShiftRow'
import { ChevronLeft, ChevronRight, PlusIcon } from '../components/ui/icons'
import { AnimatedNumber } from '../components/ui/AnimatedNumber'
import { Button, Card, EmptyState, Screen, Segmented, cx } from '../components/ui/primitives'
import { dayKey, dayRange, formatRangeLabel, monthRange, weekDays, weekRange } from '../lib/dates'
import { hm, money } from '../lib/format'
import { useNow } from '../lib/hooks'
import { computeBreakdowns, sumBreakdowns } from '../lib/pay'
import { forJob, jobsById, liveShifts, runningShift, shiftsInRange, useStore } from '../lib/store'

export function ShiftsScreen({
  onEditShift,
  onAddShift,
}: {
  onEditShift: (id: string) => void
  onAddShift: (day: number) => void
}) {
  const jobs = useStore((s) => s.jobs)
  const shifts = useStore((s) => s.shifts)
  const settings = useStore((s) => s.settings)

  const [cursor, setCursor] = useState(() => Date.now())
  /**
   * Day answers "what did I do on this date". Week and Month list every shift in the
   * period, grouped by day, for finding something without tapping through dates.
   */
  const [view, setView] = useState<'day' | 'week' | 'month'>('day')
  const selectedJobId = useStore((s) => s.selectedJobId)
  const running = useMemo(() => runningShift(shifts), [shifts])
  const now = useNow(1000, Boolean(running))

  const isMonth = view === 'month'
  const byId = useMemo(() => jobsById(jobs), [jobs])
  const days = useMemo(() => weekDays(cursor, settings.weekStartsOn), [cursor, settings.weekStartsOn])

  /** Day and Week both operate on a week; Month widens the same machinery. */
  const period = useMemo(
    () => (isMonth ? monthRange(cursor) : weekRange(cursor, settings.weekStartsOn)),
    [isMonth, cursor, settings.weekStartsOn],
  )

  const periodShifts = useMemo(
    () => forJob(shiftsInRange(liveShifts(shifts), period.start, period.end), selectedJobId),
    [shifts, period.start, period.end, selectedJobId],
  )
  const periodBreakdowns = useMemo(
    () => computeBreakdowns(periodShifts, byId, now),
    [periodShifts, byId, now],
  )
  const periodTotals = useMemo(() => sumBreakdowns(periodBreakdowns.values()), [periodBreakdowns])

  // Worked seconds per day, for the dots under the day strip.
  const perDay = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of periodShifts) {
      const b = periodBreakdowns.get(s.id)
      if (!b) continue
      m.set(b.dayKey, (m.get(b.dayKey) ?? 0) + b.workedSecs)
    }
    return m
  }, [periodShifts, periodBreakdowns])

  const selectedDay = useMemo(() => dayRange(cursor), [cursor])
  const dayShifts = useMemo(
    () => forJob(shiftsInRange(liveShifts(shifts), selectedDay.start, selectedDay.end), selectedJobId),
    [shifts, selectedDay.start, selectedDay.end, selectedJobId],
  )
  const dayBreakdowns = useMemo(
    () => computeBreakdowns(dayShifts, byId, now),
    [dayShifts, byId, now],
  )
  const dayTotals = useMemo(() => sumBreakdowns(dayBreakdowns.values()), [dayBreakdowns])

  /** The period's shifts grouped by day, newest day first, empty days omitted. */
  const grouped = useMemo(() => {
    const byDay = new Map<string, typeof periodShifts>()
    for (const s of periodShifts) {
      const k = dayKey(s.startedAt)
      const list = byDay.get(k)
      if (list) list.push(s)
      else byDay.set(k, [s])
    }
    return [...byDay.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, list]) => {
        const sorted = [...list].sort((a, b) => a.startedAt - b.startedAt)
        const totals = sumBreakdowns(
          sorted.map((s) => periodBreakdowns.get(s.id)).filter((b) => b !== undefined),
        )
        return { key, date: sorted[0]!.startedAt, shifts: sorted, totals }
      })
  }, [periodShifts, periodBreakdowns])

  const today = Date.now()

  return (
    <Screen>
      {/* Header carries the view toggle, so it does not need a full-width row of its
          own. Three stacked control blocks before any content was the density problem. */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="t-h1 text-ink">Shifts</h1>
        <div className="flex items-center gap-2">
          <Segmented
            className="w-[186px]"
            options={[
              { value: 'day', label: 'Day' },
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
            ]}
            value={view}
            onChange={setView}
          />
          <button
            type="button"
            aria-label="Add shift"
            onClick={() => onAddShift(cursor)}
            className="grid place-items-center size-9 shrink-0 rounded-full bg-brand text-[var(--color-brand-ink)] shadow-[var(--shadow-brand)] press"
          >
            <PlusIcon size={18} />
          </button>
        </div>
      </div>

      {/* Week navigation and the day strip are one job, so they are one block: the
          month caption tells you where you are, the numbers tell you the dates. */}
      <div className="mb-6">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            aria-label={isMonth ? 'Previous month' : 'Previous week'}
            onClick={() =>
              setCursor((c) =>
                isMonth ? addMonths(new Date(c), -1).getTime() : addDays(new Date(c), -7).getTime(),
              )
            }
            className="grid place-items-center size-8 shrink-0 rounded-full text-muted press"
          >
            <ChevronLeft size={18} />
          </button>
          {/* Name the actual dates, not just the month. Without the day strip below it
              — which Week and Month both hide — a bare month gave no clue which week
              you had navigated to. */}
          <span className="t-micro text-muted uppercase tabular text-center">
            {formatRangeLabel(period, isMonth ? 'month' : 'week')}
          </span>
          <button
            type="button"
            aria-label={isMonth ? 'Next month' : 'Next week'}
            onClick={() =>
              setCursor((c) =>
                isMonth ? addMonths(new Date(c), 1).getTime() : addDays(new Date(c), 7).getTime(),
              )
            }
            className="grid place-items-center size-8 shrink-0 rounded-full text-muted press"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {view === 'day' ? (
          <div className="flex mt-1">
            {days.map((d) => {
              const key = format(d, 'yyyy-MM-dd')
              const isSelected = sameDay(d, new Date(cursor))
              const isToday = sameDay(d, new Date(today))
              const secs = perDay.get(key) ?? 0
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCursor(startOfDay(d).getTime() + 12 * 3600_000)}
                  className="flex-1 flex flex-col items-center gap-1 py-1.5 press"
                >
                  <span
                    className={cx(
                      't-micro',
                      isSelected ? 'text-brand' : 'text-faint',
                    )}
                  >
                    {format(d, 'EEEEE')}
                  </span>
                  {/* Only the selected day is a filled shape. Seven bordered cards made
                      pure navigation the heaviest thing on the screen. */}
                  <span
                    className={cx(
                      'grid place-items-center size-9 rounded-full text-[15px] font-bold tabular tracking-[-0.02em]',
                      isSelected
                        ? 'bg-brand text-[var(--color-brand-ink)] shadow-[var(--shadow-brand)]'
                        : isToday
                          ? 'text-brand'
                          : 'text-ink',
                    )}
                  >
                    {format(d, 'd')}
                  </span>
                  <span
                    className={cx(
                      'size-1 rounded-full',
                      secs > 0 ? (isSelected ? 'bg-brand' : 'bg-faint') : 'bg-transparent',
                    )}
                  />
                </button>
              )
            })}
          </div>
        ) : null}
      </div>

      {/* Week summary, as one line rather than a card.
          Four stacked rows inside a raised surface made the week total compete with the
          shift list right beneath it. The same three facts — hours, pay, progress — fit
          on a single row with the goal bar doubling as the divider under it. */}
      <div className="mb-6">
        <div className="flex items-baseline justify-between gap-3">
          <span className="tabular font-bold text-[21px] tracking-[-0.03em] text-ink">
            {hm(periodTotals.workedSecs)}
            <span className="t-small text-muted font-medium ml-1.5 tracking-normal">
              {isMonth ? 'this month' : 'this week'}
            </span>
          </span>
          <AnimatedNumber
            value={periodTotals.totalAgorot}
            format={(v) => money(v, settings.currencySymbol)}
            className="tabular font-bold text-[21px] tracking-[-0.03em] text-brand"
          />
        </div>

        {/* The goal is expressed per week across every job, so the bar is meaningless
            over a month, and equally so when the view is narrowed to one job. */}
        {settings.weeklyGoalHours > 0 && !isMonth && selectedJobId === null ? (
          <div className="h-[3px] rounded-full bg-sunken mt-2.5 overflow-hidden">
            <div
              className="h-full rounded-full bg-brand"
              style={{
                width: `${Math.min(100, (periodTotals.workedSecs / (settings.weeklyGoalHours * 3600)) * 100)}%`,
                transition: 'width var(--dur-slow) var(--ease-out-expo)',
              }}
            />
          </div>
        ) : (
          <div className="h-px bg-hairline mt-2.5" />
        )}
      </div>

      <QuickLog day={cursor} onCustom={() => onAddShift(cursor)} />

      {view === 'day' ? (
        <>
          <div className="flex items-center justify-between mt-6 mb-2.5 px-0.5">
            <h2 className="t-h3">
              {sameDay(new Date(cursor), new Date(today))
                ? 'Today'
                : format(cursor, 'EEEE, MMM d')}
            </h2>
            {dayTotals.shiftCount > 0 ? (
              <span className="t-small text-muted tabular">
                {hm(dayTotals.workedSecs)} · {money(dayTotals.totalAgorot, settings.currencySymbol)}
              </span>
            ) : null}
          </div>

          {dayShifts.length === 0 ? (
            <Card>
              <EmptyState
                title="No shifts this day"
                body="Add one by hand, or use the timer on the Home tab."
                action={
                  <Button variant="soft" onClick={() => onAddShift(cursor)}>
                    <PlusIcon size={16} /> Add shift
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="flex flex-col gap-2 stagger">
              {[...dayShifts]
                .sort((a, b) => a.startedAt - b.startedAt)
                .map((s) => (
                  <ShiftRow
                    key={s.id}
                    shift={s}
                    job={byId.get(s.jobId)}
                    breakdown={dayBreakdowns.get(s.id)}
                    currency={settings.currencySymbol}
                    onClick={() => onEditShift(s.id)}
                  />
                ))}
            </div>
          )}
        </>
      ) : grouped.length === 0 ? (
        <Card className="mt-6">
          <EmptyState
            title={isMonth ? 'Nothing logged this month' : 'Nothing logged this week'}
            body="Add a shift by hand, or use the timer on the Home tab."
            action={
              <Button variant="soft" onClick={() => onAddShift(cursor)}>
                <PlusIcon size={16} /> Add shift
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="mt-6 flex flex-col gap-5">
          {grouped.map((group) => (
            <div key={group.key}>
              <div className="flex items-baseline justify-between mb-2 px-0.5">
                <h2 className="t-h3">
                  {sameDay(new Date(group.date), new Date(today))
                    ? 'Today'
                    : format(group.date, 'EEEE, d MMM')}
                </h2>
                <span className="t-small text-muted tabular">
                  {hm(group.totals.workedSecs)} ·{' '}
                  {money(group.totals.totalAgorot, settings.currencySymbol)}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {group.shifts.map((s) => (
                  <ShiftRow
                    key={s.id}
                    shift={s}
                    job={byId.get(s.jobId)}
                    breakdown={periodBreakdowns.get(s.id)}
                    currency={settings.currencySymbol}
                    onClick={() => onEditShift(s.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Screen>
  )
}
