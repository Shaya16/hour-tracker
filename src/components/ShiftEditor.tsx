import { useEffect, useMemo, useRef, useState } from 'react'
import { ConfirmSheet, Sheet } from './ui/Sheet'
import { TrashIcon } from './ui/icons'
import { Button, Field, Input, Select, Tag } from './ui/primitives'
import { fromDateTimeInput, toDateInput, toTimeInput } from '../lib/dates'
import { humanDuration, money, parseMoney, parseNum } from '../lib/format'
import { computeBreakdowns } from '../lib/pay'
import { activeJobs, jobsById, liveShifts, useStore } from '../lib/store'
import { useJobColors } from '../lib/hooks'

const DAY_MS = 86_400_000

interface Draft {
  jobId: string
  date: string
  startTime: string
  endTime: string
  breakMins: string
  extra: string
  note: string
}

/**
 * Add/edit sheet for a single shift.
 *
 * `shiftId === 'new'` opens a blank draft. An empty end time means the shift is still
 * running, which is how a mistakenly-stopped clock gets resumed.
 */
export function ShiftEditor({
  shiftId,
  onClose,
  defaultDate,
}: {
  shiftId: string | null
  onClose: () => void
  /** Pre-selects the day when adding from the Shifts screen. */
  defaultDate?: number
}) {
  const jobs = useStore((s) => s.jobs)
  const shifts = useStore((s) => s.shifts)
  const settings = useStore((s) => s.settings)
  const addShift = useStore((s) => s.addShift)
  const updateShift = useStore((s) => s.updateShift)
  const removeShift = useStore((s) => s.removeShift)

  const colors = useJobColors()
  const live = useMemo(() => activeJobs(jobs), [jobs])
  const byId = useMemo(() => jobsById(jobs), [jobs])
  const isNew = shiftId === 'new'
  const existing = useMemo(
    () => (shiftId && !isNew ? shifts.find((s) => s.id === shiftId) : undefined),
    [shifts, shiftId, isNew],
  )

  const [draft, setDraft] = useState<Draft | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  /**
   * Seed the form once per shift. Same trap as the job sheet: depending on the store's
   * arrays here meant a background sync wiped the form mid-edit.
   */
  const seededFor = useRef<string | null>(null)

  useEffect(() => {
    if (!shiftId) {
      setDraft(null)
      seededFor.current = null
      return
    }
    if (seededFor.current === shiftId) return
    seededFor.current = shiftId

    const state = useStore.getState()
    const existing = state.shifts.find((s) => s.id === shiftId)

    if (isNew) {
      const base = defaultDate ?? Date.now()
      const job = activeJobs(state.jobs)[0]
      setDraft({
        jobId: job?.id ?? '',
        date: toDateInput(base),
        startTime: '09:00',
        endTime: '17:00',
        breakMins: String(job?.defaultBreakMins ?? 0),
        extra: '',
        note: '',
      })
      return
    }
    if (!existing) return
    setDraft({
      jobId: existing.jobId,
      date: toDateInput(existing.startedAt),
      startTime: toTimeInput(existing.startedAt),
      endTime: existing.endedAt ? toTimeInput(existing.endedAt) : '',
      breakMins: String(Math.round(existing.breakSecs / 60)),
      extra: existing.extraAgorot ? String(existing.extraAgorot / 100) : '',
      note: existing.note,
    })
  }, [shiftId, isNew, defaultDate])

  const computed = useMemo(() => {
    if (!draft || !draft.date || !draft.startTime) return null
    const startedAt = fromDateTimeInput(draft.date, draft.startTime)
    let endedAt: number | null = null
    if (draft.endTime) {
      endedAt = fromDateTimeInput(draft.date, draft.endTime)
      // An end at or before the start means the shift ran past midnight.
      if (endedAt <= startedAt) endedAt += DAY_MS
    }
    const breakSecs = Math.max(0, Math.round(parseNum(draft.breakMins, 0) * 60))
    return { startedAt, endedAt, breakSecs, extraAgorot: parseMoney(draft.extra) }
  }, [draft])

  // Preview the pay this shift will produce, including any overtime it triggers when
  // combined with the day's other shifts at the same job.
  const preview = useMemo(() => {
    if (!draft || !computed || !draft.jobId) return null
    const others = liveShifts(shifts).filter((s) => s.id !== (existing?.id ?? '__new__'))
    const candidate = {
      id: '__preview__',
      jobId: draft.jobId,
      startedAt: computed.startedAt,
      endedAt: computed.endedAt,
      breakSecs: computed.breakSecs,
      pausedAt: null,
      note: '',
      extraAgorot: computed.extraAgorot,
      updatedAt: 0,
      deleted: false,
    }
    const map = computeBreakdowns([...others, candidate], byId, Date.now())
    return map.get('__preview__') ?? null
  }, [draft, computed, shifts, existing, byId])

  const crossesMidnight = Boolean(
    computed?.endedAt && toDateInput(computed.endedAt) !== toDateInput(computed.startedAt),
  )
  const canSave = Boolean(draft?.jobId && computed)

  function save() {
    if (!draft || !computed || !draft.jobId) return
    const patch = {
      jobId: draft.jobId,
      startedAt: computed.startedAt,
      endedAt: computed.endedAt,
      breakSecs: computed.breakSecs,
      extraAgorot: computed.extraAgorot,
      note: draft.note.trim(),
      pausedAt: null,
    }
    if (isNew) addShift(patch)
    else if (existing) updateShift(existing.id, patch)
    onClose()
  }

  if (!shiftId || !draft) return null

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d))

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={isNew ? 'Add shift' : 'Edit shift'}
        footer={
          <div className="flex gap-2">
            {!isNew ? (
              <Button
                variant="danger"
                size="lg"
                aria-label="Delete shift"
                onClick={() => setConfirmDelete(true)}
                className="!px-5"
              >
                <TrashIcon size={18} />
              </Button>
            ) : null}
            <Button size="lg" className="flex-1" onClick={save} disabled={!canSave}>
              {isNew ? 'Add shift' : 'Save'}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4 pt-1">
          <Field label="Job">
            <Select value={draft.jobId} onChange={(e) => set('jobId', e.target.value)}>
              {live.length === 0 ? <option value="">No jobs yet</option> : null}
              {live.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Date">
            <Input type="date" value={draft.date} onChange={(e) => set('date', e.target.value)} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Start">
              <Input
                type="time"
                value={draft.startTime}
                onChange={(e) => set('startTime', e.target.value)}
              />
            </Field>
            <Field
              label="End"
              hint={crossesMidnight ? 'Ends next day' : draft.endTime ? undefined : 'Leave empty to keep running'}
            >
              <Input
                type="time"
                value={draft.endTime}
                onChange={(e) => set('endTime', e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Unpaid break (min)">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                value={draft.breakMins}
                onChange={(e) => set('breakMins', e.target.value)}
              />
            </Field>
            <Field label={`Extra pay (${settings.currencySymbol})`} hint="Tips, bonus, travel">
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                placeholder="0.00"
                value={draft.extra}
                onChange={(e) => set('extra', e.target.value)}
              />
            </Field>
          </div>

          <Field label="Note">
            <Input
              type="text"
              placeholder="Optional"
              value={draft.note}
              onChange={(e) => set('note', e.target.value)}
            />
          </Field>

          {preview ? (
            <div className="bg-surface rounded-[var(--radius-inner)] p-4 edge">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-muted">This shift</span>
                {preview.tier1Secs + preview.tier2Secs > 0 ? (
                  <Tag color={colors.violet.hex} soft={colors.violet.soft}>
                    Includes overtime
                  </Tag>
                ) : null}
              </div>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-[22px] font-bold tabular">
                  {humanDuration(preview.workedSecs)}
                </span>
                <span className="text-[20px] font-bold text-brand tabular">
                  {money(preview.totalAgorot, settings.currencySymbol)}
                </span>
              </div>
              {preview.tier1Secs + preview.tier2Secs > 0 ? (
                <div className="text-[12px] text-muted mt-1.5 tabular">
                  {humanDuration(preview.regularSecs)} regular
                  {preview.tier1Secs > 0 ? ` · ${humanDuration(preview.tier1Secs)} at tier 1` : ''}
                  {preview.tier2Secs > 0 ? ` · ${humanDuration(preview.tier2Secs)} at tier 2` : ''}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </Sheet>

      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (existing) removeShift(existing.id)
          onClose()
        }}
        title="Delete this shift?"
        body="It will be removed from your hours and pay totals."
      />
    </>
  )
}
