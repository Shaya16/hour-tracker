import { useEffect, useMemo, useState } from 'react'
import { JobEditor } from './components/JobEditor'
import { Onboarding } from './components/Onboarding'
import { ShiftEditor } from './components/ShiftEditor'
import { TabBar, type TabKey } from './components/ui/TabBar'
import { HomeScreen } from './screens/HomeScreen'
import { ReportsScreen } from './screens/ReportsScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { ShiftsScreen } from './screens/ShiftsScreen'
import { runningShift, useStore } from './lib/store'
import { startAutoSync } from './lib/sync'

export default function App() {
  const [tab, setTab] = useState<TabKey>('home')
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

  const addShiftOn = (day: number) => {
    setEditingShiftDay(day)
    setEditingShift('new')
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
      {/* `min-h-0` is load-bearing: a flex child defaults to min-height:auto, so without
          it this pane refuses to shrink below its content, the frame grows past the
          viewport, and the tab bar is pushed off the bottom of the screen. */}
      <div
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain"
        key={tab}
      >
        {tab === 'home' ? (
          <HomeScreen
            onEditShift={openShift}
            onAddShift={addShiftOn}
            onAddJob={() => setEditingJob('new')}
            onOpenReports={() => setTab('reports')}
          />
        ) : null}

        {tab === 'shifts' ? (
          <ShiftsScreen onEditShift={openShift} onAddShift={addShiftOn} />
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
        className="app-frame w-full max-w-[460px] bg-canvas flex flex-col relative sm:ring-1 sm:ring-black/5"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        {children}
      </div>
    </div>
  )
}
