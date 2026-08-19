import { useMemo } from 'react'
import { format, isSameDay } from 'date-fns'
import { PlusIcon } from './ui/icons'
import { cx } from './ui/primitives'
import { hm } from '../lib/format'
import { useJobColors } from '../lib/hooks'
import { derivePatterns, minsToLabel, patternWorkedSecs, type ShiftPattern } from '../lib/quicklog'
import { activeJobs, jobsById, useStore } from '../lib/store'

/**
 * One-tap logging of shifts you work regularly.
 *
 * Hidden entirely until there is history to learn from — an empty row of suggestions on a
 * fresh install is just clutter that has to be explained.
 */
export function QuickLog({
  day,
  onPick,
  onCustom,
}: {
  /** The day a tapped pattern will be logged against. */
  day: number
  onPick: (pattern: ShiftPattern) => void
  onCustom: () => void
}) {
  const shifts = useStore((s) => s.shifts)
  const jobs = useStore((s) => s.jobs)
  const colors = useJobColors()

  const live = useMemo(() => activeJobs(jobs), [jobs])
  const byId = useMemo(() => jobsById(jobs), [jobs])
  const patterns = useMemo(() => derivePatterns(shifts, live, Date.now()), [shifts, live])

  if (patterns.length === 0) return null

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between mb-2.5 px-0.5">
        <h2 className="t-h3 text-ink">Quick log</h2>
        <span className="t-micro text-muted uppercase">Your usual shifts</span>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 pb-1">
        {patterns.map((p) => {
          const job = byId.get(p.jobId)
          const c = colors[job?.color ?? 'brand']
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick(p)}
              className="shrink-0 text-left rounded-[var(--radius-inner)] bg-surface edge press relative overflow-hidden min-w-[142px] pl-3.5 pr-3 py-2.5"
            >
              <span
                className="absolute left-0 top-0 bottom-0 w-[3px]"
                style={{ background: `linear-gradient(180deg, ${c.hex}, ${c.grad})` }}
                aria-hidden
              />
              <div className="t-label text-ink truncate">{job?.name ?? 'Job'}</div>
              <div className="t-small text-muted tabular mt-0.5">
                {minsToLabel(p.startMins)} – {minsToLabel(p.endMins)}
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="t-micro tabular font-bold" style={{ color: c.hex }}>
                  {hm(patternWorkedSecs(p))}
                </span>
                {p.count > 1 ? (
                  <>
                    <span className="size-[3px] rounded-full bg-faint" />
                    <span className="t-micro text-muted">{p.count}×</span>
                  </>
                ) : null}
              </div>
            </button>
          )
        })}

        <button
          type="button"
          onClick={onCustom}
          className={cx(
            'shrink-0 grid place-items-center rounded-[var(--radius-inner)] w-[74px]',
            'bg-sunken text-muted press border border-dashed border-hairline',
          )}
          aria-label="Add a custom shift"
        >
          <div className="flex flex-col items-center gap-1">
            <PlusIcon size={18} />
            <span className="t-micro">Custom</span>
          </div>
        </button>
      </div>

      <p className="t-small text-muted mt-2 px-0.5">
        Tap to log on {formatDayLabel(day)}.
      </p>
    </div>
  )
}

function formatDayLabel(day: number): string {
  if (isSameDay(day, Date.now())) return 'today'
  return format(day, 'EEEE d MMM')
}
