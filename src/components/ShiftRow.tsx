import { format } from 'date-fns'
import { hm, humanDuration, money } from '../lib/format'
import type { ShiftBreakdown } from '../lib/pay'
import { isOnBreak, isRunning } from '../lib/pay'
import { haptic, useJobColors } from '../lib/hooks'
import type { Job, Shift } from '../lib/types'

/**
 * One shift, as a colour-led row.
 *
 * The job's colour is carried by a solid rail on the left rather than filling the whole
 * card. A full gradient fill fights the text sat on top of it — contrast shifts with every
 * job colour, amber being the worst — whereas a rail keeps the type on a neutral surface
 * at fixed, always-legible contrast while the colour still identifies the job instantly.
 */
export function ShiftRow({
  shift,
  job,
  breakdown,
  currency,
  onClick,
}: {
  shift: Shift
  job: Job | undefined
  breakdown: ShiftBreakdown | undefined
  currency: string
  onClick?: () => void
}) {
  const colors = useJobColors()
  const color = colors[job?.color ?? 'brand']
  const running = isRunning(shift)
  const onBreak = isOnBreak(shift)
  const worked = breakdown?.workedSecs ?? 0
  const otSecs = (breakdown?.tier1Secs ?? 0) + (breakdown?.tier2Secs ?? 0)

  return (
    <button
      type="button"
      onClick={() => {
        haptic()
        onClick?.()
      }}
      className="w-full text-left rounded-[var(--radius-inner)] bg-surface edge press-sm relative overflow-hidden"
    >
      <span
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: `linear-gradient(180deg, ${color.hex}, ${color.grad})` }}
        aria-hidden
      />

      <div className="flex items-center justify-between gap-3 pl-4 pr-3.5 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="t-label text-ink truncate">{job?.name ?? 'Deleted job'}</span>
            {running ? (
              <span
                className="inline-flex items-center gap-1 h-[18px] px-1.5 rounded-full t-micro shrink-0"
                style={{
                  background: onBreak ? colors.orange.soft : colors.green.soft,
                  color: onBreak ? colors.orange.hex : colors.green.hex,
                }}
              >
                <span
                  className={onBreak ? 'size-1 rounded-full' : 'size-1 rounded-full animate-pulse'}
                  style={{ background: 'currentColor' }}
                />
                {onBreak ? 'Break' : 'Live'}
              </span>
            ) : null}
          </div>

          <div className="t-small text-muted tabular mt-0.5 truncate">
            {format(shift.startedAt, 'HH:mm')} –{' '}
            {shift.endedAt ? format(shift.endedAt, 'HH:mm') : 'now'}
            {breakdown && breakdown.breakSecs > 0
              ? ` · ${humanDuration(breakdown.breakSecs)} break`
              : ''}
          </div>

          {shift.note ? (
            <div className="t-small text-muted mt-0.5 truncate">{shift.note}</div>
          ) : null}
        </div>

        <div className="text-right shrink-0">
          <div className="t-label text-ink tabular">{hm(worked)}</div>
          {breakdown ? (
            <div className="t-small text-muted tabular">
              {money(breakdown.totalAgorot, currency)}
            </div>
          ) : null}
          {otSecs > 0 ? (
            <span
              className="inline-flex items-center h-[17px] px-1.5 mt-1 rounded-full t-micro"
              style={{ background: colors.violet.soft, color: colors.violet.hex }}
            >
              +{humanDuration(otSecs)} OT
            </span>
          ) : null}
        </div>
      </div>
    </button>
  )
}
