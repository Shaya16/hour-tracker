import { useEffect, useMemo, useRef, useState } from 'react'
import { ConfirmSheet, Sheet } from './ui/Sheet'
import { TrashIcon } from './ui/icons'
import { Button, Divider, Field, Input, Row, Toggle, cx } from './ui/primitives'
import { parseMoney, parseNum } from '../lib/format'
import { useStore } from '../lib/store'
import { useJobColors } from '../lib/hooks'
import { JOB_COLOR_ORDER, type JobColorKey } from '../lib/types'

interface Draft {
  name: string
  color: JobColorKey
  rate: string
  defaultBreakMins: string
  overtimeEnabled: boolean
  t1After: string
  t1Mult: string
  t2After: string
  t2Mult: string
}

export function JobEditor({ jobId, onClose }: { jobId: string | null; onClose: () => void }) {
  const jobs = useStore((s) => s.jobs)
  const settings = useStore((s) => s.settings)
  const addJob = useStore((s) => s.addJob)
  const updateJob = useStore((s) => s.updateJob)
  const removeJob = useStore((s) => s.removeJob)

  const isNew = jobId === 'new'
  const existing = useMemo(
    () => (jobId && !isNew ? jobs.find((j) => j.id === jobId) : undefined),
    [jobs, jobId, isNew],
  )
  const shiftCount = useStore(
    (s) => s.shifts.filter((sh) => !sh.deleted && sh.jobId === existing?.id).length,
  )

  const colors = useJobColors()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  /**
   * Seed the form once per job, not once per render of the store.
   *
   * This effect must not depend on `jobs`. A background sync hands the store a new array
   * reference every few seconds, and depending on it here re-ran this effect and reset the
   * draft to blanks — deleting whatever the user was in the middle of typing.
   */
  const seededFor = useRef<string | null>(null)

  useEffect(() => {
    if (!jobId) {
      setDraft(null)
      seededFor.current = null
      return
    }
    if (seededFor.current === jobId) return
    seededFor.current = jobId

    // Read non-reactively: this is a starting value, not a live subscription.
    const { jobs } = useStore.getState()
    const existing = jobs.find((j) => j.id === jobId)

    if (isNew) {
      setDraft({
        name: '',
        color: JOB_COLOR_ORDER.find(
          (c) => !jobs.filter((j) => !j.deleted).some((j) => j.color === c),
        ) ?? 'brand',
        rate: '',
        defaultBreakMins: '0',
        overtimeEnabled: true,
        t1After: '8',
        t1Mult: '1.25',
        t2After: '10',
        t2Mult: '1.5',
      })
      return
    }
    if (!existing) return
    setDraft({
      name: existing.name,
      color: existing.color,
      rate: String(existing.rateAgorot / 100),
      defaultBreakMins: String(existing.defaultBreakMins),
      overtimeEnabled: existing.overtimeEnabled,
      t1After: String(existing.otTier1AfterMins / 60),
      t1Mult: String(existing.otTier1Mult),
      t2After: existing.otTier2AfterMins > 0 ? String(existing.otTier2AfterMins / 60) : '',
      t2Mult: String(existing.otTier2Mult),
    })
  }, [jobId, isNew])

  if (!jobId || !draft) return null

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d))

  const canSave = draft.name.trim().length > 0 && parseMoney(draft.rate) > 0

  function save() {
    if (!draft || !canSave) return
    const patch = {
      name: draft.name.trim(),
      color: draft.color,
      rateAgorot: parseMoney(draft.rate),
      defaultBreakMins: Math.max(0, Math.round(parseNum(draft.defaultBreakMins, 0))),
      overtimeEnabled: draft.overtimeEnabled,
      otTier1AfterMins: Math.max(0, Math.round(parseNum(draft.t1After, 8) * 60)),
      otTier1Mult: Math.max(1, parseNum(draft.t1Mult, 1.25)),
      otTier2AfterMins: draft.t2After.trim() === '' ? 0 : Math.max(0, Math.round(parseNum(draft.t2After, 0) * 60)),
      otTier2Mult: Math.max(1, parseNum(draft.t2Mult, 1.5)),
    }
    if (isNew) addJob(patch)
    else if (existing) updateJob(existing.id, patch)
    onClose()
  }

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={isNew ? 'Add job' : 'Edit job'}
        footer={
          <div className="flex gap-2">
            {!isNew ? (
              <Button
                variant="danger"
                size="lg"
                aria-label="Delete job"
                onClick={() => setConfirmDelete(true)}
                className="!px-5"
              >
                <TrashIcon size={18} />
              </Button>
            ) : null}
            <Button size="lg" className="flex-1" onClick={save} disabled={!canSave}>
              {isNew ? 'Add job' : 'Save'}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4 pt-1">
          <Field label="Job name">
            <Input
              type="text"
              placeholder="e.g. Cafe, Warehouse"
              value={draft.name}
              onChange={(e) => set('name', e.target.value)}
              autoFocus={isNew}
            />
          </Field>

          <Field label="Colour">
            <div className="flex flex-wrap gap-2">
              {JOB_COLOR_ORDER.map((key) => {
                const c = colors[key]
                const active = draft.color === key
                return (
                  <button
                    key={key}
                    type="button"
                    aria-label={c.label}
                    onClick={() => set('color', key)}
                    className={cx(
                      'size-9 rounded-full transition-transform active:scale-90',
                      active && 'ring-2 ring-offset-2 ring-[var(--color-ink)]',
                    )}
                    style={{ background: c.hex }}
                  />
                )
              })}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={`Hourly rate (${settings.currencySymbol})`}>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                placeholder="0.00"
                value={draft.rate}
                onChange={(e) => set('rate', e.target.value)}
              />
            </Field>
            <Field label="Default break (min)" hint="Pre-fills new shifts">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                value={draft.defaultBreakMins}
                onChange={(e) => set('defaultBreakMins', e.target.value)}
              />
            </Field>
          </div>

          <Divider />

          <Row
            label="Overtime"
            sub="Applied per day, counting only this job's hours"
          >
            <Toggle
              checked={draft.overtimeEnabled}
              onChange={(v) => set('overtimeEnabled', v)}
              label="Enable overtime"
            />
          </Row>

          {draft.overtimeEnabled ? (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="After (hours/day)">
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    min={0}
                    value={draft.t1After}
                    onChange={(e) => set('t1After', e.target.value)}
                  />
                </Field>
                <Field label="Pay multiplier" hint={`${Math.round(parseNum(draft.t1Mult, 1) * 100)}%`}>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.05"
                    min={1}
                    value={draft.t1Mult}
                    onChange={(e) => set('t1Mult', e.target.value)}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Then after (hours/day)" hint="Leave empty for no second tier">
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    min={0}
                    placeholder="none"
                    value={draft.t2After}
                    onChange={(e) => set('t2After', e.target.value)}
                  />
                </Field>
                <Field label="Pay multiplier" hint={`${Math.round(parseNum(draft.t2Mult, 1) * 100)}%`}>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.05"
                    min={1}
                    disabled={draft.t2After.trim() === ''}
                    value={draft.t2Mult}
                    onChange={(e) => set('t2Mult', e.target.value)}
                  />
                </Field>
              </div>

              <p className="text-[12px] text-muted leading-relaxed bg-brand-soft rounded-[var(--radius-inner)] p-3">
                Overtime is counted per day for this job only. Hours at your other job never push
                this one into overtime.
              </p>
            </div>
          ) : null}
        </div>
      </Sheet>

      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (existing) removeJob(existing.id)
          onClose()
        }}
        title={`Delete ${existing?.name ?? 'this job'}?`}
        body={
          shiftCount > 0
            ? `This also deletes ${shiftCount} shift${shiftCount === 1 ? '' : 's'} logged against it. This cannot be undone.`
            : 'This cannot be undone.'
        }
      />
    </>
  )
}
