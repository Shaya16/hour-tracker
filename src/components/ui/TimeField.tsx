import { useEffect, useRef, useState } from 'react'
import { cx } from './primitives'

/**
 * A 24-hour time input built from two number fields.
 *
 * `<input type="time">` cannot be forced to 24-hour. Chrome renders it using the
 * *browser's* language setting — not the document `lang`, not the page, not anything the
 * app controls — so a browser configured for US English shows an AM/PM picker no matter
 * what the page asks for. The only way to guarantee a 24-hour clock is to stop using the
 * native control.
 *
 * Two numeric fields also happen to be faster on a phone than the native picker: the
 * numeric keypad appears immediately and hours auto-advance to minutes, so a time is four
 * keystrokes rather than a scroll through a spinner.
 */
export function TimeField({
  value,
  onChange,
  label,
  disabled,
}: {
  /** 'HH:mm', or '' for empty. */
  value: string
  onChange: (next: string) => void
  label: string
  disabled?: boolean
}) {
  const [hh, setHh] = useState('')
  const [mm, setMm] = useState('')
  const minutesRef = useRef<HTMLInputElement>(null)
  // Tracks what we last emitted, so an external change is distinguishable from our own.
  const emittedRef = useRef<string>('')

  useEffect(() => {
    if (value === emittedRef.current) return
    const [h = '', m = ''] = value.split(':')
    setHh(h)
    setMm(m)
    emittedRef.current = value
  }, [value])

  /** Emit only when both halves are present; otherwise the shift is "open". */
  function emit(nextHh: string, nextMm: string) {
    if (nextHh === '' && nextMm === '') {
      emittedRef.current = ''
      onChange('')
      return
    }
    if (nextHh === '' || nextMm === '') return
    const out = `${nextHh.padStart(2, '0')}:${nextMm.padStart(2, '0')}`
    emittedRef.current = out
    onChange(out)
  }

  const clamp = (raw: string, max: number) => {
    const digits = raw.replace(/\D/g, '').slice(0, 2)
    if (digits === '') return ''
    return String(Math.min(max, Number(digits)))
  }

  function onHours(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 2)
    setHh(digits)
    // Two digits, or a leading digit that cannot be the start of a valid hour —
    // either way the hour is settled, so jump to minutes.
    if (digits.length === 2 || Number(digits) > 2) {
      const settled = clamp(digits, 23)
      setHh(settled)
      emit(settled, mm)
      minutesRef.current?.focus()
      minutesRef.current?.select()
    } else {
      emit(digits, mm)
    }
  }

  function onMinutes(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 2)
    // Settle as soon as the value cannot grow into a valid minute — two digits, or a
    // leading digit above 5. Clamping only on blur would let "75" reach the model, and
    // 75 minutes silently rolls into the next hour rather than being rejected.
    if (digits.length === 2 || Number(digits) > 5) {
      const settled = clamp(digits, 59)
      setMm(settled)
      emit(hh, settled)
    } else {
      setMm(digits)
      emit(hh, digits)
    }
  }

  /** Zero-pad and clamp once the user leaves the field. */
  function normalise() {
    const h = clamp(hh, 23)
    const m = clamp(mm, 59)
    const paddedH = h === '' ? '' : h.padStart(2, '0')
    const paddedM = m === '' ? '' : m.padStart(2, '0')
    setHh(paddedH)
    setMm(paddedM)
    emit(paddedH, paddedM)
  }

  const cell =
    'w-full h-12 text-center rounded-[var(--radius-inner)] bg-sunken border border-transparent ' +
    'focus:border-brand focus:bg-surface outline-none text-ink placeholder:text-faint tabular ' +
    'transition-[background-color,border-color] duration-[var(--dur-fast)] ' +
    '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none ' +
    '[&::-webkit-outer-spin-button]:appearance-none'

  return (
    <div className={cx('flex items-center gap-1.5', disabled && 'opacity-40 pointer-events-none')}>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={`${label} hours`}
        placeholder="--"
        maxLength={2}
        value={hh}
        disabled={disabled}
        onChange={(e) => onHours(e.target.value)}
        onBlur={normalise}
        onFocus={(e) => e.target.select()}
        className={cell}
      />
      <span className="t-label text-muted select-none" aria-hidden>
        :
      </span>
      <input
        ref={minutesRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={`${label} minutes`}
        placeholder="--"
        maxLength={2}
        value={mm}
        disabled={disabled}
        onChange={(e) => onMinutes(e.target.value)}
        onBlur={normalise}
        onFocus={(e) => e.target.select()}
        className={cell}
      />
    </div>
  )
}
