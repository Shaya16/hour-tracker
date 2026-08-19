import { useState } from 'react'
import { Button, Field, Input, cx } from './ui/primitives'
import { TimerIcon } from './ui/icons'
import { parseMoney } from '../lib/format'
import { useStore } from '../lib/store'
import { useJobColors } from '../lib/hooks'
import { DEFAULT_OVERTIME, JOB_COLOR_ORDER } from '../lib/types'

interface JobDraft {
  name: string
  rate: string
}

/**
 * First-run setup: two jobs and their rates, which is everything the app needs to be
 * useful. Anything else (overtime rules, pay period, sync) has a working default and
 * can be adjusted later in Settings.
 */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const addJob = useStore((s) => s.addJob)
  const settings = useStore((s) => s.settings)
  const colors = useJobColors()
  const [drafts, setDrafts] = useState<JobDraft[]>([
    { name: '', rate: '' },
    { name: '', rate: '' },
  ])

  const filled = drafts.filter((d) => d.name.trim() && parseMoney(d.rate) > 0)
  const canFinish = filled.length > 0

  function set(i: number, patch: Partial<JobDraft>) {
    setDrafts((ds) => ds.map((d, idx) => (idx === i ? { ...d, ...patch } : d)))
  }

  function finish() {
    filled.forEach((d, i) => {
      addJob({
        name: d.name.trim(),
        rateAgorot: parseMoney(d.rate),
        color: JOB_COLOR_ORDER[i % JOB_COLOR_ORDER.length] ?? 'brand',
        defaultBreakMins: 0,
        ...DEFAULT_OVERTIME,
      })
    })
    onDone()
  }

  return (
    <div className="min-h-full flex flex-col px-6 py-8">
      <div className="grid place-items-center size-16 rounded-[22px] bg-brand text-white shadow-[var(--shadow-brand)] mb-5">
        <TimerIcon size={30} strokeWidth={2} />
      </div>

      <h1 className="text-[28px] font-bold tracking-tight leading-tight">
        Let&rsquo;s add your jobs
      </h1>
      <p className="text-[14px] text-muted mt-2 leading-relaxed">
        Add each job and what it pays per hour. You can change any of this later, and add more
        jobs whenever you need.
      </p>

      <div className="flex flex-col gap-4 mt-7">
        {drafts.map((d, i) => {
          const color = colors[JOB_COLOR_ORDER[i % JOB_COLOR_ORDER.length] ?? 'brand']
          return (
            <div
              key={i}
              className="bg-surface rounded-[var(--radius-card)] edge p-4"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="size-3 rounded-full" style={{ background: color.hex }} />
                <span className="text-[13px] font-bold text-muted">
                  Job {i + 1}
                  {i === 1 ? ' (optional)' : ''}
                </span>
              </div>
              <div className="flex flex-col gap-3">
                <Field label="Name">
                  <Input
                    type="text"
                    placeholder={i === 0 ? 'e.g. Cafe' : 'e.g. Warehouse'}
                    value={d.name}
                    onChange={(e) => set(i, { name: e.target.value })}
                  />
                </Field>
                <Field label={`Hourly rate (${settings.currencySymbol})`}>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    placeholder="0.00"
                    value={d.rate}
                    onChange={(e) => set(i, { rate: e.target.value })}
                  />
                </Field>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex-1" />

      <div className="pt-8">
        <Button size="lg" className={cx('w-full')} onClick={finish} disabled={!canFinish}>
          Get started
        </Button>
        <button
          type="button"
          onClick={onDone}
          className="w-full text-center text-[13px] text-muted mt-3 py-2 active:opacity-60"
        >
          Skip for now
        </button>
      </div>
    </div>
  )
}
