import { beforeEach, describe, expect, it } from 'vitest'
import type { Job, Settings, Shift } from './types'

// The store persists to localStorage, which does not exist in the node test env.
// Stub it before importing the store, or every write logs a warning.
const mem = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size
  },
} as Storage

const { useStore } = await import('./store')

const base = Date.now()

function job(id: string, updatedAt: number, over: Partial<Job> = {}): Job {
  return {
    id,
    name: id,
    color: 'brand',
    rateAgorot: 5000,
    defaultBreakMins: 0,
    overtimeEnabled: true,
    otTier1AfterMins: 480,
    otTier1Mult: 1.25,
    otTier2AfterMins: 600,
    otTier2Mult: 1.5,
    archived: false,
    createdAt: base,
    updatedAt,
    deleted: false,
    ...over,
  }
}

function shift(id: string, updatedAt: number, over: Partial<Shift> = {}): Shift {
  return {
    id,
    jobId: 'j1',
    startedAt: base,
    endedAt: base + 3600_000,
    breakSecs: 0,
    pausedAt: null,
    note: '',
    extraAgorot: 0,
    updatedAt,
    deleted: false,
    ...over,
  }
}

const settingsAt = (updatedAt: number): Settings => ({
  currencySymbol: '₪',
  currencyCode: 'ILS',
  weekStartsOn: 0,
  payPeriod: 'monthly',
  payPeriodAnchor: '2026-01-01',
  weeklyGoalHours: 40,
  targetShiftHours: 8,
  updatedAt,
})

beforeEach(() => {
  useStore.getState().reset()
})

/**
 * These guard a bug that was very hard to see and very easy to hit: a background sync
 * that returned nothing new still handed the store fresh array references, every
 * component selecting jobs/shifts re-rendered, and any open edit form was reset —
 * so text vanished from the inputs while the user was typing.
 */
describe('mergeRemote preserves identity when nothing changed', () => {
  it('keeps the same jobs array when the server echoes identical records', () => {
    const j = job('j1', 100)
    useStore.setState({ jobs: [j] })
    const before = useStore.getState().jobs

    useStore.getState().mergeRemote({ jobs: [{ ...j }], shifts: [], invoices: [], settings: null })

    expect(useStore.getState().jobs).toBe(before)
  })

  it('keeps the same arrays when the server returns nothing at all', () => {
    useStore.setState({ jobs: [job('j1', 100)], shifts: [shift('s1', 100)] })
    const jobsBefore = useStore.getState().jobs
    const shiftsBefore = useStore.getState().shifts

    useStore.getState().mergeRemote({ jobs: [], shifts: [], invoices: [], settings: null })

    expect(useStore.getState().jobs).toBe(jobsBefore)
    expect(useStore.getState().shifts).toBe(shiftsBefore)
  })

  it('keeps the same array when the incoming record is older', () => {
    useStore.setState({ jobs: [job('j1', 200)] })
    const before = useStore.getState().jobs

    useStore.getState().mergeRemote({ jobs: [job('j1', 100)], shifts: [], invoices: [], settings: null })

    expect(useStore.getState().jobs).toBe(before)
    expect(useStore.getState().jobs[0]!.updatedAt).toBe(200)
  })

  it('keeps settings identical when the incoming copy is not newer', () => {
    useStore.setState({ settings: settingsAt(200) })
    const before = useStore.getState().settings

    useStore.getState().mergeRemote({ jobs: [], shifts: [], invoices: [], settings: settingsAt(200) })

    expect(useStore.getState().settings).toBe(before)
  })

  it('does not notify subscribers when a sync brings nothing new', () => {
    useStore.setState({ jobs: [job('j1', 100)] })
    let notifiedWithNewJobs = 0
    const unsub = useStore.subscribe((state, prev) => {
      if (state.jobs !== prev.jobs) notifiedWithNewJobs += 1
    })

    useStore.getState().mergeRemote({ jobs: [job('j1', 100)], shifts: [], invoices: [], settings: null })
    useStore.getState().mergeRemote({ jobs: [], shifts: [], invoices: [], settings: null })

    unsub()
    expect(notifiedWithNewJobs).toBe(0)
  })
})

describe('mergeRemote still applies real changes', () => {
  it('replaces a record the server has a newer version of', () => {
    useStore.setState({ jobs: [job('j1', 100, { name: 'Old' })] })
    const before = useStore.getState().jobs

    useStore.getState().mergeRemote({
      jobs: [job('j1', 200, { name: 'New' })],
      shifts: [],
      invoices: [],
      settings: null,
    })

    expect(useStore.getState().jobs).not.toBe(before)
    expect(useStore.getState().jobs[0]!.name).toBe('New')
  })

  it('adds a record the client has never seen', () => {
    useStore.setState({ jobs: [job('j1', 100)] })

    useStore.getState().mergeRemote({ jobs: [job('j2', 100)], shifts: [], invoices: [], settings: null })

    expect(useStore.getState().jobs.map((j) => j.id).sort()).toEqual(['j1', 'j2'])
  })

  it('applies a tombstone arriving from another device', () => {
    useStore.setState({ shifts: [shift('s1', 100)] })

    useStore.getState().mergeRemote({
      jobs: [],
      shifts: [shift('s1', 200, { deleted: true })],
      invoices: [],
      settings: null,
    })

    expect(useStore.getState().shifts[0]!.deleted).toBe(true)
  })

  it('takes newer settings', () => {
    useStore.setState({ settings: settingsAt(100) })

    useStore.getState().mergeRemote({
      jobs: [],
      shifts: [],
      invoices: [],
      settings: { ...settingsAt(200), weeklyGoalHours: 25 },
    })

    expect(useStore.getState().settings.weeklyGoalHours).toBe(25)
  })

  it('leaves untouched records referentially intact when one sibling changes', () => {
    const keep = job('j1', 100)
    useStore.setState({ jobs: [keep, job('j2', 100)] })

    useStore.getState().mergeRemote({ jobs: [job('j2', 300)], shifts: [], invoices: [], settings: null })

    // The array is new, but the record nobody edited is still the same object —
    // which is what lets memoised consumers skip work.
    const after = useStore.getState().jobs
    expect(after.find((j) => j.id === 'j1')).toBe(keep)
    expect(after.find((j) => j.id === 'j2')!.updatedAt).toBe(300)
  })
})
