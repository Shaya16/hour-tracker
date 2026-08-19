import { useMemo, useState } from 'react'
import { Sheet } from './ui/Sheet'
import { CheckIcon } from './ui/icons'
import { cx } from './ui/primitives'
import { haptic, useJobColors } from '../lib/hooks'
import { activeJobs, useStore } from '../lib/store'

/**
 * Global job focus, living in the tab bar.
 *
 * Deliberately shaped nothing like the tabs beside it: a filled pill with a colour dot
 * and a chevron rather than an icon above a label, set off by a divider. The tabs change
 * *where you are*; this changes *what you are looking at*, and two different jobs sharing
 * one visual language would make the bar read as five tabs, one of which behaves oddly.
 */
export function JobSwitcher() {
  const jobs = useStore((s) => s.jobs)
  const selectedJobId = useStore((s) => s.selectedJobId)
  const setSelectedJobId = useStore((s) => s.setSelectedJobId)
  const colors = useJobColors()
  const [open, setOpen] = useState(false)

  const live = useMemo(() => activeJobs(jobs), [jobs])
  const selected = live.find((j) => j.id === selectedJobId)
  const colour = selected ? colors[selected.color] : null

  // With one job there is nothing to switch between, and the control is just clutter.
  if (live.length < 2) return null

  return (
    <>
      <div className="flex items-center pl-1 pr-1.5" style={{ paddingBottom: 2 }}>
        <span className="w-px self-stretch bg-hairline mr-1.5 my-2" aria-hidden />
        <button
          type="button"
          onClick={() => {
            haptic()
            setOpen(true)
          }}
          aria-label={`Viewing ${selected ? selected.name : 'all jobs'}. Change.`}
          aria-haspopup="dialog"
          className={cx(
            'flex items-center gap-1.5 h-[38px] pl-2.5 pr-2 rounded-full press-sm max-w-[104px]',
            'bg-sunken',
          )}
        >
          <span
            className="size-2 rounded-full shrink-0"
            style={{
              background: colour ? colour.hex : 'transparent',
              boxShadow: colour ? undefined : 'inset 0 0 0 1.5px var(--color-faint)',
            }}
          />
          <span className="t-micro text-ink truncate">{selected ? selected.name : 'All'}</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 text-muted">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="Show">
        <div className="flex flex-col gap-1 pt-1 pb-2">
          <Option
            label="All jobs"
            sub={`${live.length} jobs combined`}
            active={selectedJobId === null}
            onSelect={() => {
              setSelectedJobId(null)
              setOpen(false)
            }}
          />
          {live.map((j) => {
            const c = colors[j.color]
            return (
              <Option
                key={j.id}
                label={j.name}
                dot={c.hex}
                active={selectedJobId === j.id}
                onSelect={() => {
                  setSelectedJobId(j.id)
                  setOpen(false)
                }}
              />
            )
          })}
        </div>
        <p className="t-small text-muted leading-relaxed pb-2">
          Filters your shifts, reports and invoices. The timer always clocks into one
          specific job.
        </p>
      </Sheet>
    </>
  )
}

function Option({
  label,
  sub,
  dot,
  active,
  onSelect,
}: {
  label: string
  sub?: string
  dot?: string
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={() => {
        haptic()
        onSelect()
      }}
      className={cx(
        'flex items-center gap-3 w-full px-3.5 py-3 rounded-[var(--radius-inner)] press-sm text-left',
        active ? 'bg-brand-soft' : 'bg-surface edge',
      )}
    >
      <span
        className="size-3 rounded-full shrink-0"
        style={{
          background: dot ?? 'transparent',
          boxShadow: dot ? undefined : 'inset 0 0 0 2px var(--color-faint)',
        }}
      />
      <span className="min-w-0 flex-1">
        <span className={cx('block t-label truncate', active ? 'text-brand' : 'text-ink')}>
          {label}
        </span>
        {sub ? <span className="block t-small text-muted truncate">{sub}</span> : null}
      </span>
      {active ? <CheckIcon size={17} className="text-brand shrink-0" /> : null}
    </button>
  )
}
