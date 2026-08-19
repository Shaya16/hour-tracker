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

/** Wait this long after an edit before pushing, so a burst of typing sends once. */
const DEBOUNCE_MS = 4000

/**
 * Floor on how often a *pull with nothing to push* may run.
 *
 * Without this, every window focus fired a request. Switching between the app and
 * anything else a few times a minute turned into a steady drip of pointless calls —
 * pointless because if there is nothing local to push, the only thing a pull can
 * discover is an edit made on another device, which is not a per-second event.
 */
const IDLE_POLL_GAP_MS = 90_000

/** Regular background poll, to pick up edits made on the other device. */
const POLL_INTERVAL_MS = 5 * 60_000

let inFlight: Promise<void> | null = null
let queued = false
let lastAttemptAt = 0

/**
 * @param force Bypass the idle throttle. Used by the explicit "Sync now" button and
 *              immediately after signing in, where the user is waiting on the result.
 */
export async function syncNow(force = false): Promise<void> {
  // Coalesce concurrent callers; queue one follow-up so edits made mid-flight still go.
  if (inFlight) {
    queued = true
    return inFlight
  }
  inFlight = doSync(force).finally(() => {
    inFlight = null
    if (queued) {
      queued = false
      void syncNow()
    }
  })
  return inFlight
}

async function doSync(force: boolean): Promise<void> {
  const s = useStore.getState()
  const token = s.auth.token
  if (!token) return

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    s.setSyncStatus('offline')
    return
  }

  const cutoff = s.lastPushMark - PUSH_OVERLAP_MS
  const jobs = s.jobs.filter((j) => j.updatedAt > cutoff)
  const shifts = s.shifts.filter((sh) => sh.updatedAt > cutoff)
  const invoices = s.invoices.filter((i) => i.updatedAt > cutoff)
  const settings = s.settings.updatedAt > cutoff ? s.settings : null

  // Nothing of ours to send, and we looked recently — skip the round trip entirely.
  const hasLocalChanges =
    jobs.length > 0 || shifts.length > 0 || invoices.length > 0 || settings !== null
  if (!force && !hasLocalChanges && Date.now() - lastAttemptAt < IDLE_POLL_GAP_MS) return

  lastAttemptAt = Date.now()
  s.setSyncStatus('syncing')
  const pushMark = Date.now()
  const since = s.lastSyncedAt

  try {
    const res = await api.sync(token, { since, jobs, shifts, invoices, settings })
    // Merge before advancing the cursors, so a failed merge cannot skip data.
    useStore.getState().mergeRemote({
      jobs: res.jobs,
      shifts: res.shifts,
      invoices: res.invoices ?? [],
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
 * The debounce matters: a running timer writes to the store on pause/resume, and every
 * keystroke in an edit form updates a draft — syncing on each one would be a request
 * storm on a phone connection, for no benefit.
 */
export function startAutoSync(): () => void {
  if (stopAuto) return stopAuto

  let debounce: number | undefined

  const scheduleSoon = () => {
    window.clearTimeout(debounce)
    debounce = window.setTimeout(() => void syncNow(), DEBOUNCE_MS)
  }

  const unsub = useStore.subscribe((state, prev) => {
    if (
      state.jobs !== prev.jobs ||
      state.shifts !== prev.shifts ||
      state.invoices !== prev.invoices ||
      state.settings !== prev.settings
    ) {
      scheduleSoon()
    }
  })

  const interval = window.setInterval(() => void syncNow(), POLL_INTERVAL_MS)
  const onOnline = () => void syncNow()
  const onVisible = () => {
    // Throttled inside doSync — coming back to the app does not justify a request
    // unless something actually changed or enough time has passed.
    if (document.visibilityState === 'visible') void syncNow()
  }

  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisible)

  void syncNow(true)

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
  await syncNow(true)
}

export function signOut() {
  useStore.getState().setAuth({ token: null, username: null })
  useStore.getState().setSyncStatus('idle')
  useStore.getState().setLastSyncedAt(0)
  useStore.getState().setLastPushMark(0)
}
