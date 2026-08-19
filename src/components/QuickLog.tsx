import { useMemo } from 'react'
import { format, isSameDay } from 'date-fns'
import { PlusIcon } from './ui/icons'
import { Toast, useToast } from './ui/Toast'
import { hm } from '../lib/format'
import { useJobColors } from '../lib/hooks'
import {
  derivePatterns,
  minsToLabel,
  patternToTimes,
  patternWorkedSecs,
  type ShiftPattern,
} from '../lib/quicklog'
import { activeJobs, jobsById, useStore } from '../lib/store'

/**
 * One-tap logging of shifts you work regularly.
 *
 * Deliberately shaped nothing like a ShiftRow, which sits a few centimetres below it on
 * the same screens. These are *buttons that create a shift*, not shifts — so they are
 * tinted capsules led by a plus, where a record is a neutral card with an icon tile. When
 * the two shared a surface, a rail and a layout, the row of suggestions read as shifts
 * already logged, and tapping one to "open" it silently added another.
 *
 * Hidden entirely until there is history to learn from — an empty row of suggestions on a
 * fresh install is just clutter that has to be explained.
 */
export function QuickLog({
  day,
  onCustom,
}: {
  /** The day a tapped pattern is logged against. */
  day: number
  onCustom: () => void
}) {
  const shifts = useStore((s) => s.shifts)
  const jobs = useStore((s) => s.jobs)
  const addShift = useStore((s) => s.addShift)
  const removeShift = useStore((s) => s.removeShift)
  const colors = useJobColors()
  const { toast, show, dismiss } = useToast()

  const live = useMemo(() => activeJobs(jobs), [jobs])
  const byId = useMemo(() => jobsById(jobs), [jobs])
  const patterns = useMemo(() => derivePatterns(shifts, live, Date.now()), [shifts, live])

  /**
   * Log a pattern, and offer the way back.
   *
   * Anything created in one tap needs a one-tap undo — this makes it very easy to add a
   * shift to the wrong day, and hunting for it to delete it is a far worse experience
   * than the tap saved.
   */
  function log(pattern: ShiftPattern) {
    const { startedAt, endedAt } = patternToTimes(pattern, day)
    const created = addShift({
      jobId: pattern.jobId,
      startedAt,
      endedAt,
      breakSecs: pattern.breakSecs,
    })
    show({
      message: `${byId.get(pattern.jobId)?.name ?? 'Shift'} logged`,
      actionLabel: 'Undo',
      onAction: () => removeShift(created.id),
    })
  }

  if (patterns.length === 0) return null

  return (
    <div className="mt-6">
      <div className="flex items-baseline justify-between mb-2.5 px-0.5">
        <h2 className="t-h3 text-ink">Quick log</h2>
        <span className="t-small text-muted">Tap to add to {formatDayLabel(day)}</span>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 pb-1">
        {patterns.map((p) => {
          const job = byId.get(p.jobId)
          const c = colors[job?.color ?? 'brand']
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => log(p)}
              className="shrink-0 flex items-center gap-2 h-11 pl-1.5 pr-4 rounded-full press"
              style={{ background: c.soft }}
            >
              {/* The job's colour rides the badge and the tint. The label itself stays on
                  ink, because coloured-on-tinted at 11px is where this stopped being
                  readable — which is the one thing a one-tap control cannot afford. */}
              <span
                className="grid place-items-center size-8 shrink-0 rounded-full"
                style={{ background: c.hex, color: '#fff' }}
              >
                <PlusIcon size={16} strokeWidth={2.4} />
              </span>
              <span className="flex flex-col items-start leading-none">
                <span className="text-[13.5px] font-bold tracking-[-0.012em] text-ink truncate max-w-[132px]">
                  {job?.name ?? 'Job'}
                </span>
                <span className="text-[11.5px] font-semibold tabular text-muted mt-1">
                  {minsToLabel(p.startMins)}–{minsToLabel(p.endMins)} · {hm(patternWorkedSecs(p))}
                </span>
              </span>
            </button>
          )
        })}

        <button
          type="button"
          onClick={onCustom}
          aria-label="Add a custom shift"
          className="shrink-0 flex items-center gap-2 h-11 px-4 rounded-full bg-sunken text-muted press border border-dashed border-hairline"
        >
          <PlusIcon size={16} strokeWidth={2.2} />
          <span className="text-[13.5px] font-semibold">Custom</span>
        </button>
      </div>

      <Toast toast={toast} onDismiss={dismiss} />
    </div>
  )
}

function formatDayLabel(day: number): string {
  if (isSameDay(day, Date.now())) return 'today'
  return format(day, 'EEE d MMM')
}
