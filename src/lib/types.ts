/**
 * Core data model.
 *
 * Every syncable record carries `id` / `updatedAt` / `deleted` so the sync layer can
 * merge per-record with last-write-wins and never hard-deletes (tombstones only).
 *
 * Money is stored as integer **agorot** (1/100 ₪) and time as integer **seconds**.
 * Nothing is ever stored as a float — formatting to "₪123.45" / "7:30" happens only
 * at render time. This keeps sums exact no matter how many shifts accumulate.
 */

export type JobColorKey =
  | 'brand'
  | 'violet'
  | 'blue'
  | 'orange'
  | 'teal'
  | 'pink'
  | 'red'
  | 'green'

export interface JobColor {
  key: JobColorKey
  /** Solid hex — used by SVG charts and inline styles. */
  hex: string
  /** Tinted background for pills and shift blocks. */
  soft: string
  /** Second stop for the gradient shift blocks in the mockup. */
  grad: string
  label: string
}

export const JOB_COLORS: Record<JobColorKey, JobColor> = {
  brand: { key: 'brand', hex: '#5B5BEF', soft: '#ECECFE', grad: '#8A8AF6', label: 'Indigo' },
  violet: { key: 'violet', hex: '#8B5CF6', soft: '#F1EAFE', grad: '#B18CFA', label: 'Violet' },
  blue: { key: 'blue', hex: '#3B82F6', soft: '#E6EFFE', grad: '#74A8F9', label: 'Blue' },
  orange: { key: 'orange', hex: '#F5A623', soft: '#FEF2DF', grad: '#F9C26A', label: 'Amber' },
  teal: { key: 'teal', hex: '#14B8A6', soft: '#DEF7F3', grad: '#5DD3C5', label: 'Teal' },
  pink: { key: 'pink', hex: '#EC4899', soft: '#FDE8F2', grad: '#F581BA', label: 'Pink' },
  red: { key: 'red', hex: '#EF4444', soft: '#FDE8E8', grad: '#F58080', label: 'Red' },
  green: { key: 'green', hex: '#22C55E', soft: '#E2F8E9', grad: '#68DA92', label: 'Green' },
}

/**
 * Dark-theme job palette.
 *
 * Not a filter over the light one. Saturated mid-tones vibrate against near-black,
 * so each hue is lifted and slightly desaturated, and the `soft` tints become deep
 * shades of their own hue rather than pale washes.
 */
export const JOB_COLORS_DARK: Record<JobColorKey, JobColor> = {
  brand: { key: 'brand', hex: '#7D7DFF', soft: '#23234A', grad: '#9C9CFF', label: 'Indigo' },
  violet: { key: 'violet', hex: '#A78BFA', soft: '#2C2150', grad: '#C4AEFC', label: 'Violet' },
  blue: { key: 'blue', hex: '#60A5FA', soft: '#132A4E', grad: '#8CC0FC', label: 'Blue' },
  orange: { key: 'orange', hex: '#FBBF24', soft: '#3F2F0E', grad: '#FCD35F', label: 'Amber' },
  teal: { key: 'teal', hex: '#2DD4BF', soft: '#0E3B36', grad: '#6BE3D4', label: 'Teal' },
  pink: { key: 'pink', hex: '#F472B6', soft: '#431529', grad: '#F79ACC', label: 'Pink' },
  red: { key: 'red', hex: '#F87171', soft: '#431717', grad: '#FA9C9C', label: 'Red' },
  green: { key: 'green', hex: '#4ADE80', soft: '#123420', grad: '#7FE9A5', label: 'Green' },
}

export function jobPalette(dark: boolean): Record<JobColorKey, JobColor> {
  return dark ? JOB_COLORS_DARK : JOB_COLORS
}

export const JOB_COLOR_ORDER: JobColorKey[] = [
  'brand',
  'orange',
  'violet',
  'teal',
  'blue',
  'pink',
  'green',
  'red',
]

export interface Job {
  id: string
  name: string
  color: JobColorKey
  /** Hourly rate in agorot. ₪52.50/hr => 5250. */
  rateAgorot: number
  /** Pre-fills a new shift's break. The shift's own value is what actually counts. */
  defaultBreakMins: number

  /** When false, every hour is paid at the base rate. */
  overtimeEnabled: boolean
  /** Daily minutes worked before tier 1 kicks in. 480 = after 8h. */
  otTier1AfterMins: number
  otTier1Mult: number
  /** Set to 0 to disable the second tier. */
  otTier2AfterMins: number
  otTier2Mult: number

  archived: boolean
  createdAt: number
  updatedAt: number
  deleted: boolean
}

export interface Shift {
  id: string
  jobId: string
  /** Epoch ms. A shift is attributed to the calendar day it *starts* on. */
  startedAt: number
  /** null => currently running. */
  endedAt: number | null
  /**
   * Accrued unpaid break in seconds. Stored in seconds so live pause/resume is exact;
   * the edit form works in whole minutes.
   */
  breakSecs: number
  /** Epoch ms the current break began, or null. Only meaningful while running. */
  pausedAt: number | null
  note: string
  /** Tips / bonus / reimbursement for this shift, in agorot. */
  extraAgorot: number
  updatedAt: number
  deleted: boolean
}

export type PayPeriodKind = 'weekly' | 'biweekly' | 'monthly'

export interface Settings {
  currencySymbol: string
  currencyCode: string
  /** 0 = Sunday. Israeli work week starts Sunday. */
  weekStartsOn: 0 | 1
  payPeriod: PayPeriodKind
  /** 'YYYY-MM-DD' — the first day of a known pay period, used to phase biweekly cycles. */
  payPeriodAnchor: string
  weeklyGoalHours: number
  /** Drives the timer ring's percentage. */
  targetShiftHours: number
  updatedAt: number
}

export const DEFAULT_SETTINGS: Settings = {
  currencySymbol: '₪',
  currencyCode: 'ILS',
  weekStartsOn: 0,
  payPeriod: 'monthly',
  payPeriodAnchor: '2026-01-01',
  weeklyGoalHours: 40,
  targetShiftHours: 8,
  updatedAt: 0,
}

/** Israeli norm: first 2 overtime hours at 125%, beyond that 150%. All editable. */
export const DEFAULT_OVERTIME = {
  overtimeEnabled: true,
  otTier1AfterMins: 8 * 60,
  otTier1Mult: 1.25,
  otTier2AfterMins: 10 * 60,
  otTier2Mult: 1.5,
} as const

/** The payload shape exchanged with the sync API. */
export interface SyncPayload {
  jobs: Job[]
  shifts: Shift[]
  settings: Settings | null
}
