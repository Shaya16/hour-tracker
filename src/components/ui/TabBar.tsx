import { CalendarIcon, ChartIcon, SettingsIcon, TimerIcon } from './icons'
import { cx } from './primitives'
import { haptic } from '../../lib/hooks'

export type TabKey = 'timer' | 'shifts' | 'reports' | 'settings'

const TABS: { key: TabKey; label: string; Icon: typeof TimerIcon }[] = [
  { key: 'timer', label: 'Timer', Icon: TimerIcon },
  { key: 'shifts', label: 'Shifts', Icon: CalendarIcon },
  { key: 'reports', label: 'Reports', Icon: ChartIcon },
  { key: 'settings', label: 'Settings', Icon: SettingsIcon },
]

export function TabBar({
  active,
  onChange,
  running,
}: {
  active: TabKey
  onChange: (t: TabKey) => void
  /** Pulses a dot on the Timer tab so a running clock is visible from any screen. */
  running?: boolean
}) {
  return (
    <nav
      className="shrink-0 z-30 bg-surface/80 backdrop-blur-2xl border-t border-hairline"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-stretch px-1 pt-1.5 pb-1">
        {TABS.map(({ key, label, Icon }) => {
          const isActive = key === active
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                haptic()
                onChange(key)
              }}
              aria-current={isActive ? 'page' : undefined}
              className="flex-1 flex flex-col items-center gap-[3px] py-1.5 rounded-[var(--radius-inner)] press-sm"
            >
              <span className="relative">
                <Icon
                  size={21}
                  className={cx(
                    'transition-colors duration-[var(--dur-fast)]',
                    isActive ? 'text-brand' : 'text-muted',
                  )}
                  strokeWidth={isActive ? 2.15 : 1.75}
                />
                {key === 'timer' && running ? (
                  <span className="absolute -top-px -right-1 size-[7px] rounded-full bg-green ring-2 ring-[var(--color-surface)]" />
                ) : null}
              </span>
              <span
                className={cx(
                  'text-[10.5px] font-semibold tracking-[-0.005em] transition-colors duration-[var(--dur-fast)]',
                  isActive ? 'text-brand' : 'text-muted',
                )}
              >
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
