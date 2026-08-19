import { format } from 'date-fns'
import { decimalHours } from './format'
import type { ShiftBreakdown } from './pay'
import type { Job, Settings, Shift } from './types'

/** RFC 4180 quoting: wrap in quotes and double any embedded quote. */
function cell(value: string | number): string {
  const s = String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const HEADERS = [
  'Date',
  'Job',
  'Start',
  'End',
  'Break (min)',
  'Worked (h)',
  'Regular (h)',
  'Overtime 1 (h)',
  'Overtime 2 (h)',
  'Rate',
  'Base pay',
  'Extra pay',
  'Total pay',
  'Note',
]

/**
 * One row per shift, with hours as decimals so the file drops straight into a
 * spreadsheet for reconciling against a payslip.
 */
export function shiftsToCsv(
  shifts: Shift[],
  breakdowns: Map<string, ShiftBreakdown>,
  jobs: Map<string, Job>,
  settings: Settings,
): string {
  const rows: string[] = [HEADERS.map(cell).join(',')]

  const ordered = [...shifts].sort((a, b) => a.startedAt - b.startedAt)
  for (const s of ordered) {
    const b = breakdowns.get(s.id)
    if (!b) continue
    const job = jobs.get(s.jobId)
    rows.push(
      [
        format(s.startedAt, 'yyyy-MM-dd'),
        job?.name ?? 'Deleted job',
        format(s.startedAt, 'HH:mm'),
        s.endedAt ? format(s.endedAt, 'HH:mm') : '(running)',
        Math.round(b.breakSecs / 60),
        decimalHours(b.workedSecs),
        decimalHours(b.regularSecs),
        decimalHours(b.tier1Secs),
        decimalHours(b.tier2Secs),
        job ? (job.rateAgorot / 100).toFixed(2) : '',
        (b.basePayAgorot / 100).toFixed(2),
        (b.extraAgorot / 100).toFixed(2),
        (b.totalAgorot / 100).toFixed(2),
        s.note,
      ]
        .map(cell)
        .join(','),
    )
  }

  rows.push('')
  const totals = [...breakdowns.values()].reduce(
    (acc, b) => ({
      worked: acc.worked + b.workedSecs,
      regular: acc.regular + b.regularSecs,
      t1: acc.t1 + b.tier1Secs,
      t2: acc.t2 + b.tier2Secs,
      base: acc.base + b.basePayAgorot,
      extra: acc.extra + b.extraAgorot,
      total: acc.total + b.totalAgorot,
    }),
    { worked: 0, regular: 0, t1: 0, t2: 0, base: 0, extra: 0, total: 0 },
  )
  rows.push(
    [
      'TOTAL',
      '',
      '',
      '',
      '',
      decimalHours(totals.worked),
      decimalHours(totals.regular),
      decimalHours(totals.t1),
      decimalHours(totals.t2),
      '',
      (totals.base / 100).toFixed(2),
      (totals.extra / 100).toFixed(2),
      (totals.total / 100).toFixed(2),
      settings.currencyCode,
    ]
      .map(cell)
      .join(','),
  )

  return rows.join('\r\n')
}

/**
 * Trigger a browser download.
 *
 * The BOM matters: without it Excel reads the file as the system codepage and renders ₪
 * and any Hebrew note as mojibake.
 */
export function downloadFile(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
  const withBom = mime.startsWith('text/csv') ? `﻿${content}` : content
  const blob = new Blob([withBom], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoke on the next tick so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
