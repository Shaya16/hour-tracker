import { useMemo, useState } from 'react'
import { ShiftRow } from '../components/ShiftRow'
import { AnimatedNumber } from '../components/ui/AnimatedNumber'
import { Ring } from '../components/ui/Ring'
import { CoffeeIcon, PlayIcon, PlusIcon, StopIcon, TimerIcon } from '../components/ui/icons'
import { Button, Card, EmptyState, SectionTitle, cx } from '../components/ui/primitives'
import { dayRange } from '../lib/dates'
import { hm, hms, money } from '../lib/format'
import { useJobColors, useNow } from '../lib/hooks'
import { computeBreakdowns, isOnBreak, sumBreakdowns } from '../lib/pay'
import { activeJobs, jobsById, liveShifts, runningShift, shiftsInRange, useStore } from '../lib/store'

export function TimerScreen({
  onEditShift,
  onAddJob,
}: {
  onEditShift: (id: string) => void
  onAddJob: () => void
}) {
  const jobs = useStore((s) => s.jobs)
  const shifts = useStore((s) => s.shifts)
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
  const today = useMemo(() => dayRange(now), [now])
  const todayShifts = useMemo(
    () => shiftsInRange(liveShifts(shifts), today.start, today.end),
    [shifts, today.start, today.end],
  )

  // Breakdowns cover the whole day, so live figures already reflect overtime earned by
  // earlier shifts at the same job.
  const breakdowns = useMemo(
    () => computeBreakdowns(todayShifts, byId, now),
    [todayShifts, byId, now],
  )
  const todayTotals = useMemo(() => sumBreakdowns(breakdowns.values()), [breakdowns])

  const runningBreakdown = running ? breakdowns.get(running.id) : undefined
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
        <Header title="Timer" />
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

  return (
    <Screen>
      <Header
        title="Timer"
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
        <Stat label="Hours" value={hm(todayTotals.workedSecs)} />
        <Stat
          label="Earned"
          animatedValue={todayTotals.totalAgorot}
          format={(v) => money(v, settings.currencySymbol)}
          accent
        />
        <Stat label="Overtime" value={hm(todayTotals.tier1Secs + todayTotals.tier2Secs)} />
      </div>

      <SectionTitle>Today</SectionTitle>
      {todayShifts.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing logged today"
            body="Start the clock, or add a shift by hand from the Shifts tab."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-2 stagger">
          {todayShifts.map((s) => (
            <ShiftRow
              key={s.id}
              shift={s}
              job={byId.get(s.jobId)}
              breakdown={breakdowns.get(s.id)}
              currency={settings.currencySymbol}
              onClick={() => onEditShift(s.id)}
            />
          ))}
        </div>
      )}
    </Screen>
  )
}

export function Screen({ children }: { children: React.ReactNode }) {
  return <div className="px-5 pt-4 pb-6 animate-screen-in">{children}</div>
}

export function Header({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h1 className="t-h1 text-ink">{title}</h1>
      {action}
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
