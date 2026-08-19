import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  DEFAULT_OVERTIME,
  DEFAULT_SETTINGS,
  JOB_COLOR_ORDER,
  type Job,
  type JobColorKey,
  type Settings,
  type Shift,
} from './types'

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

const now = () => Date.now()

export interface AuthState {
  token: string | null
  username: string | null
}

export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'error' | 'offline'

interface State {
  jobs: Job[]
  shifts: Shift[]
  settings: Settings
  auth: AuthState
  /** Server-issued cursor: everything changed on the server after this has been pulled. */
  lastSyncedAt: number
  /**
   * Local-clock cursor: everything changed locally before this has been pushed.
   * Kept separate from `lastSyncedAt` because the two clocks are not the same clock —
   * a phone running a few minutes fast would otherwise skip its own edits forever.
   */
  lastPushMark: number
  syncStatus: SyncStatus
  syncError: string | null
  /** Set once the first-run wizard has been dismissed. */
  onboarded: boolean

  // Jobs
  addJob: (partial?: Partial<Job>) => Job
  updateJob: (id: string, patch: Partial<Job>) => void
  removeJob: (id: string) => void

  // Shifts
  addShift: (partial: Partial<Shift> & { jobId: string; startedAt: number }) => Shift
  updateShift: (id: string, patch: Partial<Shift>) => void
  removeShift: (id: string) => void

  // Timer
  startShift: (jobId: string, at?: number) => Shift | null
  pauseShift: (id: string, at?: number) => void
  resumeShift: (id: string, at?: number) => void
  stopShift: (id: string, at?: number) => void

  // Settings & auth
  updateSettings: (patch: Partial<Settings>) => void
  setAuth: (auth: AuthState) => void
  setSyncStatus: (status: SyncStatus, error?: string | null) => void
  setLastSyncedAt: (ts: number) => void
  setLastPushMark: (ts: number) => void
  setOnboarded: (v: boolean) => void

  /** Replace local data with a merged set from the sync layer. */
  mergeRemote: (data: { jobs: Job[]; shifts: Shift[]; settings: Settings | null }) => void
  /** Wholesale replace, for JSON restore. */
  replaceAll: (data: { jobs: Job[]; shifts: Shift[]; settings?: Settings }) => void
  reset: () => void
}

function nextColor(jobs: Job[]): JobColorKey {
  const used = new Set(jobs.filter((j) => !j.deleted).map((j) => j.color))
  return JOB_COLOR_ORDER.find((c) => !used.has(c)) ?? 'brand'
}

/** Last-write-wins by `updatedAt`; ties keep the incoming record. */
function mergeById<T extends { id: string; updatedAt: number }>(local: T[], remote: T[]): T[] {
  const byId = new Map(local.map((r) => [r.id, r]))
  for (const r of remote) {
    const existing = byId.get(r.id)
    if (!existing || r.updatedAt >= existing.updatedAt) byId.set(r.id, r)
  }
  return [...byId.values()]
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      jobs: [],
      shifts: [],
      settings: { ...DEFAULT_SETTINGS },
      auth: { token: null, username: null },
      lastSyncedAt: 0,
      lastPushMark: 0,
      syncStatus: 'idle',
      syncError: null,
      onboarded: false,

      addJob: (partial = {}) => {
        const ts = now()
        const job: Job = {
          id: uid(),
          name: 'New job',
          color: nextColor(get().jobs),
          rateAgorot: 5000,
          defaultBreakMins: 0,
          ...DEFAULT_OVERTIME,
          archived: false,
          createdAt: ts,
          updatedAt: ts,
          deleted: false,
          ...partial,
        }
        set((s) => ({ jobs: [...s.jobs, job] }))
        return job
      },

      updateJob: (id, patch) =>
        set((s) => ({
          jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...patch, updatedAt: now() } : j)),
        })),

      // Soft delete: the tombstone has to survive so sync can propagate the removal.
      removeJob: (id) =>
        set((s) => ({
          jobs: s.jobs.map((j) => (j.id === id ? { ...j, deleted: true, updatedAt: now() } : j)),
          shifts: s.shifts.map((sh) =>
            sh.jobId === id ? { ...sh, deleted: true, updatedAt: now() } : sh,
          ),
        })),

      addShift: (partial) => {
        const ts = now()
        const job = get().jobs.find((j) => j.id === partial.jobId)
        const shift: Shift = {
          id: uid(),
          endedAt: null,
          breakSecs: (job?.defaultBreakMins ?? 0) * 60,
          pausedAt: null,
          note: '',
          extraAgorot: 0,
          updatedAt: ts,
          deleted: false,
          ...partial,
        }
        set((s) => ({ shifts: [...s.shifts, shift] }))
        return shift
      },

      updateShift: (id, patch) =>
        set((s) => ({
          shifts: s.shifts.map((sh) => (sh.id === id ? { ...sh, ...patch, updatedAt: now() } : sh)),
        })),

      removeShift: (id) =>
        set((s) => ({
          shifts: s.shifts.map((sh) =>
            sh.id === id ? { ...sh, deleted: true, updatedAt: now() } : sh,
          ),
        })),

      startShift: (jobId, at) => {
        // Only one clock may run at a time; close any stragglers first.
        const running = get().shifts.find((s) => !s.deleted && s.endedAt === null)
        if (running) get().stopShift(running.id, at)
        // A fresh timed shift starts with a zero break — the job's default break is a
        // manual-entry convenience, and double-counting it here would eat real paid time.
        return get().addShift({ jobId, startedAt: at ?? now(), breakSecs: 0 })
      },

      pauseShift: (id, at) => {
        const shift = get().shifts.find((s) => s.id === id)
        if (!shift || shift.endedAt !== null || shift.pausedAt !== null) return
        get().updateShift(id, { pausedAt: at ?? now() })
      },

      resumeShift: (id, at) => {
        const shift = get().shifts.find((s) => s.id === id)
        if (!shift || shift.pausedAt === null) return
        const elapsed = Math.max(0, Math.floor(((at ?? now()) - shift.pausedAt) / 1000))
        get().updateShift(id, { pausedAt: null, breakSecs: shift.breakSecs + elapsed })
      },

      stopShift: (id, at) => {
        const shift = get().shifts.find((s) => s.id === id)
        if (!shift || shift.endedAt !== null) return
        const end = at ?? now()
        // Fold an open break into the total before closing, or it would be lost.
        const openBreak =
          shift.pausedAt !== null ? Math.max(0, Math.floor((end - shift.pausedAt) / 1000)) : 0
        get().updateShift(id, {
          endedAt: end,
          pausedAt: null,
          breakSecs: shift.breakSecs + openBreak,
        })
      },

      updateSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch, updatedAt: now() } })),

      setAuth: (auth) => set({ auth }),
      setSyncStatus: (syncStatus, syncError = null) => set({ syncStatus, syncError }),
      setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
      setLastPushMark: (lastPushMark) => set({ lastPushMark }),
      setOnboarded: (onboarded) => set({ onboarded }),

      mergeRemote: ({ jobs, shifts, settings }) =>
        set((s) => ({
          jobs: mergeById(s.jobs, jobs),
          shifts: mergeById(s.shifts, shifts),
          settings:
            settings && settings.updatedAt >= s.settings.updatedAt ? settings : s.settings,
        })),

      replaceAll: ({ jobs, shifts, settings }) =>
        set((s) => ({
          jobs,
          shifts,
          settings: settings ?? s.settings,
        })),

      reset: () =>
        set({
          jobs: [],
          shifts: [],
          settings: { ...DEFAULT_SETTINGS },
          auth: { token: null, username: null },
          lastSyncedAt: 0,
          lastPushMark: 0,
          syncStatus: 'idle',
          syncError: null,
          onboarded: false,
        }),
    }),
    {
      name: 'hour-tracker-v1',
      version: 1,
      partialize: (s) => ({
        jobs: s.jobs,
        shifts: s.shifts,
        settings: s.settings,
        auth: s.auth,
        lastSyncedAt: s.lastSyncedAt,
        lastPushMark: s.lastPushMark,
        onboarded: s.onboarded,
      }),
    },
  ),
)

// ---- Selectors -------------------------------------------------------------
// Plain functions rather than hooks so they can be reused in tests and the CSV writer.

export const activeJobs = (jobs: Job[]): Job[] =>
  jobs.filter((j) => !j.deleted && !j.archived).sort((a, b) => a.createdAt - b.createdAt)

export const allLiveJobs = (jobs: Job[]): Job[] =>
  jobs.filter((j) => !j.deleted).sort((a, b) => a.createdAt - b.createdAt)

export const liveShifts = (shifts: Shift[]): Shift[] => shifts.filter((s) => !s.deleted)

export const jobsById = (jobs: Job[]): Map<string, Job> =>
  new Map(jobs.filter((j) => !j.deleted).map((j) => [j.id, j]))

export const runningShift = (shifts: Shift[]): Shift | undefined =>
  shifts.find((s) => !s.deleted && s.endedAt === null)

/** Shifts whose *start* falls inside [start, end], newest first. */
export const shiftsInRange = (shifts: Shift[], start: number, end: number): Shift[] =>
  shifts
    .filter((s) => !s.deleted && s.startedAt >= start && s.startedAt <= end)
    .sort((a, b) => b.startedAt - a.startedAt)
