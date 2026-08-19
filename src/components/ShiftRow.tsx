import { format } from 'date-fns'
import {
  ArrowRightIcon,
  BoltIcon,
  BriefcaseIcon,
  ClockIcon,
  CoffeeIcon,
  NoteIcon,
} from './ui/icons'
import { hm, humanDuration, money } from '../lib/format'
import type { ShiftBreakdown } from '../lib/pay'
import { isOnBreak, isRunning } from '../lib/pay'
import { haptic, useJobColors } from '../lib/hooks'
import type { Job, Shift } from '../lib/types'

/**
 * One shift, as a record card.
 *
 * Sized for the common case, which is *one* of these in a day rather than a list to scan.
 * That budget goes on legibility: a coloured icon tile carries the job identity, the two
 * headline numbers — hours worked and what they earned — are set large on the right, and
 * every supporting fact is led by an icon so the eye can find the break or the times
 * without reading a run-on sentence of middot.
 *
 * The colour lives in the tile rather than filling the card. A full gradient fill fights
 * the text sat on top of it — contrast shifts with every job colour, amber being the
 * worst — whereas a tile keeps the type on a neutral surface at fixed contrast while the
 * colour still identifies the job instantly.
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
  const breakSecs = breakdown?.breakSecs ?? 0
  const otSecs = (breakdown?.tier1Secs ?? 0) + (breakdown?.tier2Secs ?? 0)
  const status = onBreak ? colors.orange : colors.green

  return (
    <button
      type="button"
      onClick={() => {
        haptic()
        onClick?.()
      }}
      className="w-full text-left rounded-[var(--radius-card)] bg-surface edge press-sm px-3.5 py-3.5"
    >
      <div className="flex items-start gap-3">
        {/* Job identity, as a shape rather than a word — findable before you read. */}
        <span
          className="relative grid place-items-center size-11 shrink-0 rounded-[15px]"
          style={{ background: color.soft, color: color.hex }}
        >
          <BriefcaseIcon size={20} strokeWidth={1.9} />
          {running ? (
            <span
              className="absolute -top-0.5 -right-0.5 size-[11px] rounded-full ring-2 ring-[var(--color-surface)]"
              style={{ background: status.hex }}
            >
              {!onBreak ? (
                <span
                  className="absolute inset-0 rounded-full pulse-ring"
                  style={{ background: status.hex }}
                />
              ) : null}
            </span>
          ) : null}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[15px] font-bold tracking-[-0.017em] text-ink truncate">
              {job?.name ?? 'Deleted job'}
            </span>
            {running ? (
              <span
                className="inline-flex items-center h-[18px] px-1.5 rounded-full t-micro shrink-0"
                style={{ background: status.soft, color: status.hex }}
              >
                {onBreak ? 'Break' : 'Live'}
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-1.5 mt-1.5 t-small text-muted tabular">
            <ClockIcon size={14} className="text-faint shrink-0" />
            <span>{format(shift.startedAt, 'HH:mm')}</span>
            <ArrowRightIcon size={11} className="text-faint shrink-0" strokeWidth={2.4} />
            <span>{shift.endedAt ? format(shift.endedAt, 'HH:mm') : 'now'}</span>
          </div>

          {breakSecs > 0 || otSecs > 0 ? (
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1.5">
              {breakSecs > 0 ? (
                <span className="flex items-center gap-1.5 t-small text-muted tabular">
                  <CoffeeIcon size={14} className="text-faint shrink-0" />
                  {humanDuration(breakSecs)} break
                </span>
              ) : null}
              {otSecs > 0 ? (
                <span
                  className="inline-flex items-center gap-1 h-[19px] pl-1.5 pr-2 rounded-full t-micro tabular"
                  style={{ background: colors.violet.soft, color: colors.violet.hex }}
                >
                  <BoltIcon size={11} strokeWidth={2} />
                  {humanDuration(otSecs)} OT
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* The two numbers the card exists to deliver. */}
        <div className="text-right shrink-0 pl-1">
          <div className="tabular font-extrabold text-ink text-[19px] leading-none tracking-[-0.035em]">
            {hm(worked)}
          </div>
          {breakdown ? (
            <div className="tabular font-bold text-brand text-[14px] leading-none mt-1.5">
              {money(breakdown.totalAgorot, currency)}
            </div>
          ) : null}
        </div>
      </div>

      {shift.note ? (
        <div className="flex items-start gap-2 mt-3 pt-3 border-t border-hairline">
          <NoteIcon size={14} className="text-faint shrink-0 mt-px" />
          <span className="t-small text-muted min-w-0 break-words">{shift.note}</span>
        </div>
      ) : null}
    </button>
  )
}
