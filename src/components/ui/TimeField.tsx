import { useEffect, useState } from 'react'
import Picker from 'react-mobile-picker'
import { Sheet } from './Sheet'
import { Button, cx } from './primitives'
import { haptic } from '../../lib/hooks'

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

const ITEM_H = 44
/**
 * Must be **odd**. The wheel centres the selected row at height/2, so an even row count
 * puts that midpoint on a boundary between two rows — the selection never lines up with
 * an item, and the highlight band sits half a row out. Four rows was exactly that bug.
 */
const ROWS = 5

/** Round the current clock to the nearest 5 minutes, for a sensible starting position. */
function nowRounded(): { hour: string; minute: string } {
  const d = new Date()
  const m = Math.round(d.getMinutes() / 5) * 5
  const rolled = m === 60
  return {
    hour: String((d.getHours() + (rolled ? 1 : 0)) % 24).padStart(2, '0'),
    minute: String(rolled ? 0 : m).padStart(2, '0'),
  }
}

/**
 * 24-hour time entry, as a scrolling wheel in a sheet.
 *
 * `<input type="time">` is unusable here: Chrome renders it from the *browser's* language
 * setting, so a US-configured browser shows an AM/PM picker no matter what the page asks
 * for. This replaces it outright, which also means the control matches the rest of the app
 * in both themes instead of inheriting whatever the platform felt like drawing.
 */
export function TimeField({
  value,
  onChange,
  label,
  allowEmpty = false,
}: {
  /** 'HH:mm', or '' when empty. */
  value: string
  onChange: (next: string) => void
  label: string
  /** Offers a "Still running" action that clears the value. */
  allowEmpty?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(() => splitOrNow(value))
  useEffect(() => {
    if (!open) return
    // Re-seed on open only — not on every `value` change — so a pick in progress is
    // never yanked out from under the user by a parent update.
    setDraft(splitOrNow(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => {
          haptic()
          setOpen(true)
        }}
        aria-label={`${label}: ${value || 'not set'}. Change.`}
        className={cx(
          'w-full h-12 px-3.5 rounded-[var(--radius-inner)] bg-sunken border border-transparent',
          'flex items-center justify-between press-sm',
          'active:border-brand transition-colors duration-[var(--dur-fast)]',
        )}
      >
        <span className={cx('tabular text-[17px] font-semibold', value ? 'text-ink' : 'text-faint')}>
          {value || '--:--'}
        </span>
        <ClockGlyph />
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        footer={
          <div className="flex gap-2">
            {allowEmpty ? (
              <Button
                variant="soft"
                size="lg"
                onClick={() => {
                  onChange('')
                  setOpen(false)
                }}
              >
                Still running
              </Button>
            ) : null}
            <Button
              size="lg"
              className="flex-1"
              onClick={() => {
                onChange(`${draft.hour}:${draft.minute}`)
                setOpen(false)
              }}
            >
              Set {draft.hour}:{draft.minute}
            </Button>
          </div>
        }
      >
        <div className="relative py-2">
          {/* The selection band sits behind the wheels so the centred row reads as chosen. */}
          <div
            className="absolute left-0 right-0 top-1/2 -translate-y-1/2 rounded-[var(--radius-inner)] bg-brand-soft pointer-events-none"
            style={{ height: ITEM_H }}
            aria-hidden
          />
          <Picker
            value={draft}
            onChange={(v) => {
              haptic(4)
              setDraft(v as { hour: string; minute: string })
            }}
            height={ROWS * ITEM_H}
            itemHeight={ITEM_H}
            wheelMode="normal"
          >
            <Picker.Column name="hour">
              {HOURS.map((h) => (
                <Picker.Item key={h} value={h}>
                  {({ selected }) => <Cell selected={selected}>{h}</Cell>}
                </Picker.Item>
              ))}
            </Picker.Column>

            <div className="grid place-items-center w-4 shrink-0">
              <span className="tabular text-[22px] font-bold text-muted select-none">:</span>
            </div>

            <Picker.Column name="minute">
              {MINUTES.map((m) => (
                <Picker.Item key={m} value={m}>
                  {({ selected }) => <Cell selected={selected}>{m}</Cell>}
                </Picker.Item>
              ))}
            </Picker.Column>
          </Picker>
        </div>

        <div className="flex flex-wrap gap-1.5 justify-center pb-1">
          {['00', '15', '30', '45'].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                haptic()
                setDraft((d) => ({ ...d, minute: m }))
              }}
              className={cx(
                'h-8 px-3 rounded-full t-micro press-sm',
                draft.minute === m ? 'bg-brand text-[var(--color-brand-ink)]' : 'bg-sunken text-muted',
              )}
            >
              :{m}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  )
}

function Cell({ selected, children }: { selected: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cx(
        'grid place-items-center h-11 tabular transition-all duration-[var(--dur-fast)]',
        selected
          ? 'text-[24px] font-bold text-brand'
          : 'text-[20px] font-semibold text-faint scale-90',
      )}
    >
      {children}
    </div>
  )
}

function ClockGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden className="text-muted">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7.5V12l3 1.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function splitOrNow(value: string): { hour: string; minute: string } {
  const [h, m] = value.split(':')
  if (h && m && HOURS.includes(h) && MINUTES.includes(m)) return { hour: h, minute: m }
  return nowRounded()
}
