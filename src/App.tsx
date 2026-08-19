import { useEffect, useMemo, useState } from 'react'
import { JobEditor } from './components/JobEditor'
import { Onboarding } from './components/Onboarding'
import { ShiftEditor } from './components/ShiftEditor'
import { TabBar, type TabKey } from './components/ui/TabBar'
import { ReportsScreen } from './screens/ReportsScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { ShiftsScreen } from './screens/ShiftsScreen'
import { TimerScreen } from './screens/TimerScreen'
import { runningShift, useStore } from './lib/store'
import { startAutoSync } from './lib/sync'

export default function App() {
  const [tab, setTab] = useState<TabKey>('timer')
  const [editingShift, setEditingShift] = useState<string | null>(null)
  const [editingShiftDay, setEditingShiftDay] = useState<number | undefined>(undefined)
  const [editingJob, setEditingJob] = useState<string | null>(null)

  const shifts = useStore((s) => s.shifts)
  const onboarded = useStore((s) => s.onboarded)
  const setOnboarded = useStore((s) => s.setOnboarded)
  const hasJobs = useStore((s) => s.jobs.some((j) => !j.deleted))
  const token = useStore((s) => s.auth.token)

  const running = useMemo(() => runningShift(shifts), [shifts])

  // Auto-sync only runs while signed in; signing out tears the listeners back down.
  useEffect(() => {
    if (!token) return
    return startAutoSync()
  }, [token])

  // Keep the browser/PWA title honest about a running clock.
  useEffect(() => {
    document.title = running ? '● Running · Hour Tracker' : 'Hour Tracker'
  }, [running])

  // Paint the mobile browser chrome to match the surface behind it.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => meta.setAttribute('content', mq.matches ? '#0b0b12' : '#f4f5fa')
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  const openShift = (id: string) => {
    setEditingShiftDay(undefined)
    setEditingShift(id)
  }

  if (!onboarded && !hasJobs) {
    return (
      <Shell>
        <Onboarding onDone={() => setOnboarded(true)} />
      </Shell>
    )
  }

  return (
    <Shell>
      {/* `key` remounts on tab change, which re-runs the entrance animation. Without it
          the screens would hard-cut and the app would feel like a set of web pages. */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden" key={tab}>
        {tab === 'timer' ? (
          <TimerScreen onEditShift={openShift} onAddJob={() => setEditingJob('new')} />
        ) : null}

        {tab === 'shifts' ? (
          <ShiftsScreen
            onEditShift={openShift}
            onAddShift={(day) => {
              setEditingShiftDay(day)
              setEditingShift('new')
            }}
          />
        ) : null}

        {tab === 'reports' ? <ReportsScreen /> : null}

        {tab === 'settings' ? <SettingsScreen onEditJob={setEditingJob} /> : null}
      </div>

      <TabBar active={tab} onChange={setTab} running={Boolean(running)} />

      <ShiftEditor
        shiftId={editingShift}
        defaultDate={editingShiftDay}
        onClose={() => {
          setEditingShift(null)
          setEditingShiftDay(undefined)
        }}
      />
      <JobEditor jobId={editingJob} onClose={() => setEditingJob(null)} />
    </Shell>
  )
}

/**
 * Phone-shaped frame.
 *
 * Full-bleed on a phone. On a desktop it centres a 460px column on the gradient backdrop,
 * the way the reference mockup presents it — the app is designed for a thumb, and
 * stretching it across a 27" monitor would only make that obvious.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full flex justify-center">
      <div
        className={
          'w-full max-w-[460px] bg-canvas flex flex-col relative ' +
          'min-h-screen ' +
          'sm:min-h-[min(900px,100vh-3rem)] sm:my-6 sm:rounded-[38px] sm:overflow-hidden ' +
          'sm:shadow-[0_40px_100px_-20px_rgba(10,10,40,0.5)] sm:ring-1 sm:ring-black/5'
        }
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        {children}
      </div>
    </div>
  )
}
