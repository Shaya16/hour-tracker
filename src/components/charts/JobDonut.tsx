import { hm } from '../../lib/format'
import { useJobColors } from '../../lib/hooks'
import type { Job } from '../../lib/types'

export interface DonutSlice {
  jobId: string
  secs: number
}

/**
 * Hours split by job — the "Grouped by project" chart in the mockup.
 *
 * Drawn as stroke-dashed circles rather than arc paths: rounded caps come free, and the
 * segment maths stays one subtraction instead of four trig calls per slice.
 */
export function JobDonut({
  slices,
  jobs,
  size = 172,
  stroke = 26,
}: {
  slices: DonutSlice[]
  jobs: Job[]
  size?: number
  stroke?: number
}) {
  const colors = useJobColors()
  const total = slices.reduce((sum, s) => sum + s.secs, 0)
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r

  if (total <= 0) {
    return (
      <div className="grid place-items-center" style={{ height: size }}>
        <span className="text-[13px] text-muted">No hours yet</span>
      </div>
    )
  }

  const visible = slices.filter((s) => s.secs > 0)
  // A gap between slices reads as separation; with only one slice it would look like a bug.
  const gap = visible.length > 1 ? 3 : 0
  let acc = 0

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-sunken)" strokeWidth={stroke} />
        {visible.map((s) => {
          const job = jobs.find((j) => j.id === s.jobId)
          const frac = s.secs / total
          const dash = Math.max(0, frac * c - gap)
          const offset = -acc * c
          acc += frac
          return (
            <circle
              key={s.jobId}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={colors[job?.color ?? 'brand'].hex}
              strokeWidth={stroke}
              strokeLinecap={gap > 0 ? 'round' : 'butt'}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={offset}
            />
          )
        })}
      </svg>
      <div className="relative z-10 text-center">
        <div className="text-[11px] font-semibold text-muted">Total</div>
        <div className="text-[20px] font-bold tabular leading-tight">{hm(total)}</div>
      </div>
    </div>
  )
}

/** Colour key + per-job hours, shown beside the donut. */
export function JobLegend({
  slices,
  jobs,
  total,
}: {
  slices: DonutSlice[]
  jobs: Job[]
  total: number
}) {
  const colors = useJobColors()
  return (
    <div className="flex flex-col gap-2.5 min-w-0">
      {slices.map((s) => {
        const job = jobs.find((j) => j.id === s.jobId)
        const pct = total > 0 ? Math.round((s.secs / total) * 100) : 0
        return (
          <div key={s.jobId} className="flex items-center gap-2 min-w-0">
            <span
              className="size-2.5 rounded-full shrink-0"
              style={{ background: colors[job?.color ?? 'brand'].hex }}
            />
            <span className="text-[13px] font-semibold truncate flex-1 min-w-0">
              {job?.name ?? 'Deleted job'}
            </span>
            <span className="text-[13px] text-muted tabular shrink-0">
              {hm(s.secs)} · {pct}%
            </span>
          </div>
        )
      })}
    </div>
  )
}
