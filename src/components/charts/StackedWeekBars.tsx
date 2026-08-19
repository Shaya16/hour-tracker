import { format } from 'date-fns'
import { hm } from '../../lib/format'
import { useJobColors } from '../../lib/hooks'
import type { Job } from '../../lib/types'

export interface DayBar {
  key: string
  date: Date
  /** jobId -> worked seconds */
  segments: Map<string, number>
  totalSecs: number
}

/** Pick a tidy axis maximum so short days stay visible instead of hugging a 24h scale. */
function axisMax(maxSecs: number): number {
  const hours = maxSecs / 3600
  for (const candidate of [4, 6, 8, 10, 12, 16, 20, 24]) {
    if (hours <= candidate) return candidate
  }
  return Math.ceil(hours / 4) * 4
}

/**
 * Horizontal stacked bars, one row per day — the "Tracker hours" chart in the mockup.
 *
 * Built from flex divs rather than SVG: the shapes are just rounded rectangles, and CSS
 * gives crisp edges at any width without the viewBox scaling that would distort text.
 */
export function StackedWeekBars({ days, jobs }: { days: DayBar[]; jobs: Job[] }) {
  const colors = useJobColors()
  const maxSecs = Math.max(0, ...days.map((d) => d.totalSecs))
  const maxHours = axisMax(maxSecs)
  const tickCount = maxHours <= 8 ? maxHours / 2 + 1 : 5
  const ticks = Array.from({ length: tickCount }, (_, i) =>
    Math.round((maxHours / (tickCount - 1)) * i),
  )
  const jobOrder = jobs.map((j) => j.id)

  if (maxSecs === 0) {
    return (
      <div className="py-8 text-center text-[13px] text-muted">No hours logged in this period.</div>
    )
  }

  return (
    <div>
      <div className="relative pl-6">
        {/* Gridlines sit behind the bars, aligned with the axis labels below. */}
        <div className="absolute inset-y-0 left-6 right-0 flex justify-between pointer-events-none">
          {ticks.map((t) => (
            <div key={t} className="w-px bg-hairline" />
          ))}
        </div>

        <div className="relative flex flex-col gap-2">
          {days.map((d) => (
            <div key={d.key} className="flex items-center gap-2">
              <span className="absolute left-0 w-5 text-[11px] font-semibold text-muted text-center">
                {format(d.date, 'EEEEE')}
              </span>
              <div className="flex-1 h-4 rounded-full bg-sunken overflow-hidden flex">
                {jobOrder.map((jobId) => {
                  const secs = d.segments.get(jobId) ?? 0
                  if (secs <= 0) return null
                  const job = jobs.find((j) => j.id === jobId)
                  const pct = (secs / (maxHours * 3600)) * 100
                  return (
                    <div
                      key={jobId}
                      className="h-full first:rounded-l-full last:rounded-r-full"
                      style={{
                        width: `${pct}%`,
                        background: colors[job?.color ?? 'brand'].hex,
                      }}
                      title={`${job?.name ?? 'Job'} · ${hm(secs)}`}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Axis */}
      <div className="flex justify-between pl-6 mt-2">
        {ticks.map((t) => (
          <span key={t} className="text-[10px] text-faint tabular">
            {t}h
          </span>
        ))}
      </div>
    </div>
  )
}
