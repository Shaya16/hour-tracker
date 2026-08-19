import { useMemo, useState } from 'react'
import { QuickLog } from '../components/QuickLog'
import { ShiftRow } from '../components/ShiftRow'
import { AnimatedNumber } from '../components/ui/AnimatedNumber'
import { Ring } from '../components/ui/Ring'
import {
  CalendarIcon,
  ChevronRight,
  CoffeeIcon,
  PlayIcon,
  PlusIcon,
  ReceiptIcon,
  StopIcon,
  TargetIcon,
  TimerIcon,
  TrendUpIcon,
} from '../components/ui/icons'
import {
  Button,
  Card,
  EmptyState,
  Header,
  Screen,
  SectionTitle,
  cx,
} from '../components/ui/primitives'
import { dayRange, formatRangeLabel, payPeriodRange, weekRange, type Range } from '../lib/dates'
import { hm, hms, humanDuration, money } from '../lib/format'
import { weekPace, type WeekPace } from '../lib/goals'
import { useJobColors, useNow } from '../lib/hooks'
import { jobBalances, overallBalance } from '../lib/invoices'
import {
  computeBreakdowns,
  isOnBreak,
  sumBreakdowns,
  type ShiftBreakdown,
  type Totals,
} from '../lib/pay'
import {
  activeJobs,
  forJob,
  jobsById,
  liveShifts,
  runningShift,
  shiftsInRange,
  useStore,
} from '../lib/store'
import type { Job, Shift } from '../lib/types'

const DAY_MS = 86_400_000

/**
 * Landing screen: the clock, and where the current week and pay period stand.
 *
 * Everything here is scoped to *now* — today, this week, this period. Choosing a date or
 * comparing periods is what Shifts and Reports are for, and duplicating their controls
 * here would only give two places to answer the same question differently.
 */
export function HomeScreen({
  onEditShift,
  onAddShift,
  onAddJob,
  onOpenReports,
}: {
  onEditShift: (id: string) => void
  onAddShift: (day: number) => void
  onAddJob: () => void
  onOpenReports: () => void
}) {
  const jobs = useStore((s) => s.jobs)
  const shifts = useStore((s) => s.shifts)
  const invoices = useStore((s) => s.invoices)
  const settings = useStore((s) => s.settings)
  const startShift = useStore((s) => s.startShift)
  const pauseShift = useStore((s) => s.pauseShift)
  const resumeShift = useStore((s) => s.resumeShift)
  const stopShift = useStore((s) => s.stopShift)

  const colors = useJobColors()
  const live = useMemo(() => activeJobs(jobs), [jobs])
  const running = useMemo(() => runningShift(shifts), [shifts])

  const globalJobId = useStore((s) => s.selectedJobId)
  const [localJobId, setLocalJobId] = useState<string | null>(null)

  /**
   * Which job the clock will start on.
   *
   * A running shift always wins — you cannot retarget hours that are already accruing.
   * Otherwise the global focus decides, and only when that is "All jobs" does the local
   * pick apply. The pills below stay visible in exactly that case, because starting a
   * timer needs one unambiguous job and "all" is not an answer.
   */
  const activeJobId = running?.jobId ?? globalJobId ?? localJobId ?? live[0]?.id ?? null
  const showJobPills = globalJobId === null

  // Only tick while a clock is actually running.
  const now = useNow(1000, Boolean(running))

  const byId = useMemo(() => jobsById(jobs), [jobs])
  const all = useMemo(() => liveShifts(shifts), [shifts])

  const today = useMemo(() => dayRange(now), [now])
  const week = useMemo(() => weekRange(now, settings.weekStartsOn), [now, settings.weekStartsOn])
  const period = useMemo(
    () => payPeriodRange(now, settings.payPeriod, settings.payPeriodAnchor, settings.weekStartsOn),
    [now, settings.payPeriod, settings.payPeriodAnchor, settings.weekStartsOn],
  )

  /**
   * Breakdowns are always computed over the *unfiltered* set for a range and only then
   * narrowed to the focused job. Handing computeBreakdowns a filtered list would be fine
   * for the totals, but the running shift would vanish from the map whenever the focus
   * sat on a different job — and the ring would read 00:00 against a live clock.
   */
  const todayShifts = useMemo(
    () => shiftsInRange(all, today.start, today.end),
    [all, today.start, today.end],
  )
  const todayBreakdowns = useMemo(
    () => computeBreakdowns(todayShifts, byId, now),
    [todayShifts, byId, now],
  )
  const visibleToday = useMemo(
    () => forJob(todayShifts, globalJobId),
    [todayShifts, globalJobId],
  )
  const todayTotals = useMemo(
    () => totalsFor(visibleToday, todayBreakdowns),
    [visibleToday, todayBreakdowns],
  )

  const weekTotals = useRangeTotals(all, byId, week, globalJobId, now)
  const periodTotals = useRangeTotals(all, byId, period, globalJobId, now)

  /**
   * The weekly goal counts every job, so it can only judge the combined view. Held
   * against one job's hours it is not a goal but a guarantee of failure — a focused week
   * would read "18h behind" on a week that was, across both jobs, comfortably ahead.
   */
  const pace = useMemo(
    () =>
      globalJobId === null
        ? weekPace(weekTotals.workedSecs, settings.weeklyGoalHours, week, now)
        : null,
    [globalJobId, weekTotals.workedSecs, settings.weeklyGoalHours, week, now],
  )

  /**
   * What is still owed. Deliberately pinned to a render-time clock rather than `now`:
   * this walks the *entire* shift history, and it is a standing balance, not a live
   * readout — recomputing it every second so a running shift could nudge it by a few
   * agorot would be the most expensive thing on the screen.
   */
  const owed = useMemo(() => {
    const balances = jobBalances(all, invoices, byId, Date.now())
    return overallBalance(
      [...balances.values()].filter((b) => globalJobId === null || b.jobId === globalJobId),
    )
  }, [all, invoices, byId, globalJobId])

  const runningBreakdown = running ? todayBreakdowns.get(running.id) : undefined
  const workedSecs = runningBreakdown?.workedSecs ?? 0
  const onBreak = running ? isOnBreak(running) : false

  const targetSecs = Math.max(1, settings.targetShiftHours * 3600)
  const progress = workedSecs / targetSecs
  const overtime = progress > 1

  const activeJob = activeJobId ? byId.get(activeJobId) : undefined
  const jobColor = colors[activeJob?.color ?? 'brand']
  const ringColor = onBreak ? colors.orange.hex : overtime ? colors.violet.hex : jobColor.hex
  const ringColorTo = onBreak ? colors.orange.grad : overtime ? colors.violet.grad : jobColor.grad

  if (live.length === 0) {
    return (
      <Screen>
        <Header title="Home" />
        <Card className="mt-1">
          <EmptyState
            icon={<TimerIcon size={26} />}
            title="No jobs yet"
            body="Add your jobs and their hourly rates, then you can start the clock."
            action={
              <Button onClick={onAddJob}>
                <PlusIcon size={17} /> Add a job
              </Button>
            }
          />
        </Card>
      </Screen>
    )
  }

  const statusLabel = running ? (onBreak ? 'On break' : 'Working') : 'Ready'
  const statusColor = running ? (onBreak ? colors.orange.hex : colors.green.hex) : undefined

  // Weekly pay periods *are* the week, so a second identical row would be noise.
  const showPeriod = settings.payPeriod !== 'weekly'
  const daysLeft = Math.max(0, Math.ceil((period.end - now) / DAY_MS))

  return (
    <Screen>
      <Header
        title="Home"
        action={
          <div className="flex items-center gap-2 h-8 px-3 rounded-full bg-surface edge">
            <span className="relative flex size-2">
              {running && !onBreak ? (
                <span
                  className="absolute inset-0 rounded-full pulse-ring"
                  style={{ background: statusColor }}
                />
              ) : null}
              <span
                className="relative size-2 rounded-full"
                style={{ background: statusColor ?? 'var(--color-faint)' }}
              />
            </span>
            <span className="t-micro text-muted">{statusLabel}</span>
          </div>
        }
      />

      {/* Job picker — only needed while the global focus is "All jobs"; otherwise the
          switcher in the tab bar has already answered the question. Locked to the running
          job while the clock is going, since switching mid-shift would misattribute hours. */}
      {showJobPills ? (
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 pb-1">
          {live.map((j) => {
            const c = colors[j.color]
            const isActive = j.id === activeJobId
            const locked = Boolean(running) && j.id !== running?.jobId
            return (
              <button
                key={j.id}
                type="button"
                disabled={locked}
                onClick={() => setLocalJobId(j.id)}
                className={cx(
                  'shrink-0 h-9 px-4 rounded-full text-[13.5px] font-semibold press',
                  locked && 'opacity-30',
                )}
                style={
                  isActive
                    ? { background: c.hex, color: '#fff', boxShadow: `0 6px 18px -6px ${c.hex}` }
                    : { background: c.soft, color: c.hex }
                }
              >
                {j.name}
              </button>
            )
          })}

          <button
            type="button"
            onClick={onAddJob}
            aria-label="Add a job"
            title="Add a job"
            className="shrink-0 grid place-items-center h-9 w-9 rounded-full bg-sunken text-muted press border border-dashed border-hairline"
          >
            <PlusIcon size={16} />
          </button>
        </div>
      ) : null}

      <Card className="mt-3.5 p-5 pb-5">
        <div className="flex justify-center pt-1 pb-5">
          <Ring
            progress={progress}
            color={ringColor}
            colorTo={ringColorTo}
            glow={Boolean(running)}
            size={244}
            stroke={16}
          >
            <div className="t-micro text-muted uppercase truncate max-w-[150px]">
              {activeJob?.name ?? 'No job'}
            </div>
            <div
              className="tabular font-extrabold text-ink mt-1"
              style={{ fontSize: 41, letterSpacing: '-0.05em', lineHeight: 1.02 }}
            >
              {hms(workedSecs)}
            </div>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span
                className="t-small tabular font-bold"
                style={{ color: overtime ? colors.violet.hex : 'var(--color-faint)' }}
              >
                {Math.round(progress * 100)}%
              </span>
              <span className="size-[3px] rounded-full bg-faint" />
              <AnimatedNumber
                value={runningBreakdown?.totalAgorot ?? 0}
                format={(v) => money(v, settings.currencySymbol)}
                className="t-small tabular font-bold text-brand"
              />
            </div>
          </Ring>
        </div>

        {!running ? (
          <Button
            size="lg"
            className="w-full"
            onClick={() => activeJobId && startShift(activeJobId)}
            disabled={!activeJobId}
          >
            <PlayIcon size={17} />
            {activeJob ? `Start · ${activeJob.name}` : 'Start shift'}
          </Button>
        ) : (
          <div className="flex gap-2.5">
            <Button
              variant="soft"
              size="lg"
              className="flex-1"
              onClick={() => (onBreak ? resumeShift(running.id) : pauseShift(running.id))}
            >
              {onBreak ? <PlayIcon size={17} /> : <CoffeeIcon size={17} />}
              {onBreak ? 'Resume' : 'Break'}
            </Button>
            <Button
              size="lg"
              className="flex-1 !bg-red !text-white !shadow-[0_6px_20px_-6px_rgba(239,68,68,0.6)]"
              onClick={() => stopShift(running.id)}
            >
              <StopIcon size={15} /> Stop
            </Button>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-3 gap-2.5 mt-3">
        <Stat label="Today" value={hm(todayTotals.workedSecs)} />
        <Stat
          label="Earned"
          animatedValue={todayTotals.totalAgorot}
          format={(v) => money(v, settings.currencySymbol)}
          accent
        />
        <Stat label="Overtime" value={hm(todayTotals.tier1Secs + todayTotals.tier2Secs)} />
      </div>

      <SectionTitle>This week</SectionTitle>
      <Card className="p-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="tabular font-extrabold text-ink text-[27px] leading-none tracking-[-0.042em]">
            {hm(weekTotals.workedSecs)}
          </span>
          <AnimatedNumber
            value={weekTotals.totalAgorot}
            format={(v) => money(v, settings.currencySymbol)}
            className="tabular font-extrabold text-brand text-[22px] leading-none tracking-[-0.038em]"
          />
        </div>

        {pace ? (
          <>
            {/* The bar is progress; the notch is where a steady pace would have you by
                now. Two facts on one line — without the notch, "12 of 40 hours" on a
                Tuesday looks like failure rather than a week going fine. */}
            <div className="relative mt-3.5 mb-3">
              <div className="h-1.5 rounded-full bg-sunken overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pace.progress * 100}%`,
                    background: pace.status === 'behind' ? colors.orange.hex : 'var(--color-brand)',
                    transition: 'width var(--dur-slow) var(--ease-out-expo)',
                  }}
                />
              </div>
              {pace.status !== 'met' ? (
                <span
                  aria-hidden
                  className="absolute -top-1 h-[14px] w-[2px] rounded-full bg-ink/30"
                  style={{ left: `calc(${pace.pace * 100}% - 1px)` }}
                />
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 t-small text-muted min-w-0">
                <TargetIcon size={14} className="text-faint shrink-0" />
                <span className="truncate tabular">
                  {pace.remainingSecs > 0
                    ? `${hm(pace.remainingSecs)} to your ${settings.weeklyGoalHours}h goal`
                    : `${settings.weeklyGoalHours}h goal reached`}
                </span>
              </span>
              <PaceBadge pace={pace} />
            </div>
          </>
        ) : null}

        {showPeriod ? (
          <>
            <div className="h-px bg-hairline my-3.5" />
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 t-small text-muted min-w-0">
                <CalendarIcon size={14} className="text-faint shrink-0" />
                <span className="truncate">
                  Pay period ·{' '}
                  <span className="tabular">
                    {daysLeft === 0 ? 'ends today' : `${daysLeft}d left`}
                  </span>
                </span>
              </span>
              <span className="t-small tabular text-ink shrink-0">
                {hm(periodTotals.workedSecs)}
                <span className="text-brand font-semibold ml-1.5">
                  {money(periodTotals.totalAgorot, settings.currencySymbol)}
                </span>
              </span>
            </div>
            <div className="t-micro text-faint tabular mt-1 pl-[22px]">
              {formatRangeLabel(period, settings.payPeriod === 'monthly' ? 'month' : 'week')}
            </div>
          </>
        ) : null}
      </Card>

      <QuickLog day={now} onCustom={() => onAddShift(now)} />

      <SectionTitle
        action={
          <button
            type="button"
            onClick={() => onAddShift(now)}
            className="t-small font-semibold text-brand press-sm"
          >
            Add shift
          </button>
        }
      >
        Today
      </SectionTitle>
      {visibleToday.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing logged today"
            body="Start the clock above, or add a shift by hand."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-2 stagger">
          {visibleToday.map((s) => (
            <ShiftRow
              key={s.id}
              shift={s}
              job={byId.get(s.jobId)}
              breakdown={todayBreakdowns.get(s.id)}
              currency={settings.currencySymbol}
              onClick={() => onEditShift(s.id)}
            />
          ))}
        </div>
      )}

      {owed.uninvoicedAgorot > 0 || owed.awaitingAgorot > 0 ? (
        <>
          <SectionTitle>Getting paid</SectionTitle>
          <Card className="p-4" onClick={onOpenReports}>
            <div className="flex items-center gap-3">
              <span className="grid place-items-center size-11 shrink-0 rounded-[15px] bg-brand-soft text-brand">
                <ReceiptIcon size={20} strokeWidth={1.9} />
              </span>
              <div className="flex-1 grid grid-cols-2 gap-3 min-w-0">
                <Figure
                  label="Not invoiced"
                  value={money(owed.uninvoicedAgorot, settings.currencySymbol)}
                  sub={owed.uninvoicedSecs > 0 ? humanDuration(owed.uninvoicedSecs) : undefined}
                  accent
                />
                <Figure
                  label="Awaiting"
                  value={money(owed.awaitingAgorot, settings.currencySymbol)}
                />
              </div>
              <ChevronRight size={18} className="text-faint shrink-0" />
            </div>
          </Card>
        </>
      ) : null}
    </Screen>
  )
}

/** Sum the breakdowns belonging to `list`, skipping anything the map does not know. */
function totalsFor(list: Shift[], breakdowns: Map<string, ShiftBreakdown>): Totals {
  return sumBreakdowns(list.map((s) => breakdowns.get(s.id)).filter((b) => b !== undefined))
}

/** Totals for one range, computed unfiltered then narrowed to the focused job. */
function useRangeTotals(
  all: Shift[],
  byId: Map<string, Job>,
  range: Range,
  jobId: string | null,
  now: number,
): Totals {
  const inRange = useMemo(
    () => shiftsInRange(all, range.start, range.end),
    [all, range.start, range.end],
  )
  const breakdowns = useMemo(() => computeBreakdowns(inRange, byId, now), [inRange, byId, now])
  return useMemo(
    () => totalsFor(forJob(inRange, jobId), breakdowns),
    [inRange, jobId, breakdowns],
  )
}

function PaceBadge({ pace }: { pace: WeekPace }) {
  const colors = useJobColors()
  if (pace.status === 'met') {
    return (
      <span
        className="flex items-center gap-1 t-small font-bold shrink-0"
        style={{ color: colors.green.hex }}
      >
        <TrendUpIcon size={13} /> Goal met
      </span>
    )
  }
  if (pace.status === 'onTrack') {
    return <span className="t-small font-semibold text-muted shrink-0">On track</span>
  }
  const ahead = pace.status === 'ahead'
  return (
    <span
      className="flex items-center gap-1 t-small font-bold tabular shrink-0"
      style={{ color: ahead ? colors.green.hex : colors.orange.hex }}
    >
      {/* One glyph, flipped, so "behind" reads as the mirror of "ahead" rather than
          as an unrelated second symbol the eye has to learn. */}
      <TrendUpIcon size={13} className={ahead ? undefined : '-scale-y-100'} />
      {humanDuration(Math.abs(pace.deltaSecs))} {ahead ? 'ahead' : 'behind'}
    </span>
  )
}

function Figure({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: boolean
}) {
  return (
    <div className="min-w-0">
      <div className="t-micro text-muted uppercase truncate">{label}</div>
      <div
        className={cx(
          'tabular font-bold truncate mt-0.5 text-[15.5px]',
          accent ? 'text-brand' : 'text-ink',
        )}
      >
        {value}
      </div>
      {sub ? <div className="t-micro text-faint tabular truncate">{sub}</div> : null}
    </div>
  )
}

function Stat({
  label,
  value,
  animatedValue,
  format,
  accent,
}: {
  label: string
  value?: string
  animatedValue?: number
  format?: (v: number) => string
  accent?: boolean
}) {
  return (
    <div className="bg-surface rounded-[var(--radius-inner)] edge px-3 py-2.5 min-w-0">
      <div className="t-micro text-muted uppercase truncate">{label}</div>
      <div
        className={cx('tabular font-bold truncate mt-0.5 text-[15.5px]', accent && 'text-brand')}
      >
        {animatedValue !== undefined && format ? (
          <AnimatedNumber value={animatedValue} format={format} />
        ) : (
          value
        )}
      </div>
    </div>
  )
}
