import { ApiError, api } from './api'
import { useStore } from './store'

/**
 * Delta sync against the Pages Function.
 *
 * Local state is always authoritative for the UI — this runs in the background and its
 * failure is never allowed to block or undo anything the user did. Conflicts resolve
 * per record by last-write-wins on `updatedAt`.
 */

/**
 * Re-send anything touched in the last two minutes even if it was already pushed.
 * Upserts are idempotent, and this covers the window where a record was modified
 * between capturing the push mark and the request actually landing.
 */
const PUSH_OVERLAP_MS = 120_000

let inFlight: Promise<void> | null = null
let queued = false

export async function syncNow(): Promise<void> {
  // Coalesce concurrent callers; queue one follow-up so edits made mid-flight still go.
  if (inFlight) {
    queued = true
    return inFlight
  }
  inFlight = doSync().finally(() => {
    inFlight = null
    if (queued) {
      queued = false
      void syncNow()
    }
  })
  return inFlight
}

async function doSync(): Promise<void> {
  const s = useStore.getState()
  const token = s.auth.token
  if (!token) return

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    s.setSyncStatus('offline')
    return
  }

  s.setSyncStatus('syncing')
  const pushMark = Date.now()
  const since = s.lastSyncedAt
  const cutoff = s.lastPushMark - PUSH_OVERLAP_MS

  const jobs = s.jobs.filter((j) => j.updatedAt > cutoff)
  const shifts = s.shifts.filter((sh) => sh.updatedAt > cutoff)
  const settings = s.settings.updatedAt > cutoff ? s.settings : null

  try {
    const res = await api.sync(token, { since, jobs, shifts, settings })
    // Merge before advancing the cursors, so a failed merge cannot skip data.
    useStore.getState().mergeRemote({
      jobs: res.jobs,
      shifts: res.shifts,
      settings: res.settings,
    })
    useStore.getState().setLastSyncedAt(res.now)
    useStore.getState().setLastPushMark(pushMark)
    useStore.getState().setSyncStatus('ok')
  } catch (err) {
    const st = useStore.getState()
    if (err instanceof ApiError) {
      if (err.status === 401) {
        // The token is dead. Drop it so the UI prompts a fresh sign-in rather than
        // retrying forever, but never touch the local data.
        st.setAuth({ token: null, username: st.auth.username })
        st.setSyncStatus('error', 'Signed out — please sign in again')
        return
      }
      if (err.status === 0) {
        st.setSyncStatus('offline')
        return
      }
      st.setSyncStatus('error', err.message)
      return
    }
    st.setSyncStatus('error', 'Sync failed')
  }
}

let stopAuto: (() => void) | null = null

/**
 * Sync on a timer, on reconnect, and shortly after any local edit.
 *
 * The debounce matters: a running timer writes to the store on pause/resume, and each
 * keystroke in an edit form updates a draft — syncing on every one of those would be a
 * request storm on a phone connection.
 */
export function startAutoSync(): () => void {
  if (stopAuto) return stopAuto

  let debounce: number | undefined

  const scheduleSoon = () => {
    window.clearTimeout(debounce)
    debounce = window.setTimeout(() => void syncNow(), 2500)
  }

  const unsub = useStore.subscribe((state, prev) => {
    if (state.jobs !== prev.jobs || state.shifts !== prev.shifts || state.settings !== prev.settings) {
      scheduleSoon()
    }
  })

  const interval = window.setInterval(() => void syncNow(), 5 * 60_000)
  const onOnline = () => void syncNow()
  const onVisible = () => {
    if (document.visibilityState === 'visible') void syncNow()
  }

  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisible)

  void syncNow()

  stopAuto = () => {
    unsub()
    window.clearTimeout(debounce)
    window.clearInterval(interval)
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisible)
    stopAuto = null
  }
  return stopAuto
}

export async function signIn(username: string, passcode: string, mode: 'login' | 'signup') {
  const res = mode === 'signup' ? await api.signup(username, passcode) : await api.login(username, passcode)
  useStore.getState().setAuth({ token: res.token, username: res.username })
  // A new device must pull the entire history, not just what changed since it booted.
  useStore.getState().setLastSyncedAt(0)
  useStore.getState().setLastPushMark(0)
  await syncNow()
}

export function signOut() {
  useStore.getState().setAuth({ token: null, username: null })
  useStore.getState().setSyncStatus('idle')
  useStore.getState().setLastSyncedAt(0)
  useStore.getState().setLastPushMark(0)
}
