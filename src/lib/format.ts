/** Display formatting. Everything here takes integer seconds or agorot and returns a string. */

/** 2:23:01 — the timer readout. */
export function hms(totalSecs: number): string {
  const s = Math.max(0, Math.floor(totalSecs))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

/** 7:30 — hours and minutes, for summaries where seconds are noise. */
export function hm(totalSecs: number): string {
  const s = Math.max(0, Math.floor(totalSecs))
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  // Rounding 59.6 minutes up must roll into the next hour, not render "7:60".
  if (m === 60) return `${h + 1}:00`
  return `${h}:${String(m).padStart(2, '0')}`
}

/** 7.5h — compact decimal hours, for dense chart labels. */
export function decimalHours(totalSecs: number, digits = 2): number {
  return Number((Math.max(0, totalSecs) / 3600).toFixed(digits))
}

/** "7h 30m", or "45m" when under an hour. */
export function humanDuration(totalSecs: number): string {
  const s = Math.max(0, Math.floor(totalSecs))
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  if (m === 60) return `${h + 1}h`
  return `${h}h ${m}m`
}

/** ₪1,234.50 */
export function money(agorot: number, symbol = '₪'): string {
  const neg = agorot < 0
  const abs = Math.abs(Math.round(agorot))
  const whole = Math.floor(abs / 100)
  const cents = abs % 100
  const grouped = whole.toLocaleString('en-US')
  return `${neg ? '-' : ''}${symbol}${grouped}.${String(cents).padStart(2, '0')}`
}

/** ₪1,234 — drops the fraction where space is tight and precision does not matter. */
export function moneyShort(agorot: number, symbol = '₪'): string {
  const neg = agorot < 0
  const abs = Math.abs(Math.round(agorot))
  return `${neg ? '-' : ''}${symbol}${Math.round(abs / 100).toLocaleString('en-US')}`
}

/** Parse a user-typed amount ("52.5", "52,50", "₪52.50") into agorot. */
export function parseMoney(input: string): number {
  const cleaned = input.replace(/[^0-9.,-]/g, '').replace(',', '.')
  const n = Number.parseFloat(cleaned)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

/** Parse a user-typed number, falling back to `fallback` on garbage. */
export function parseNum(input: string, fallback = 0): number {
  const n = Number.parseFloat(input.replace(',', '.'))
  return Number.isFinite(n) ? n : fallback
}

/** x1.25 -> "125%" */
export function multToPercent(mult: number): string {
  return `${Math.round(mult * 100)}%`
}
