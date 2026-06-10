/**
 * Client-side CSV export helper.
 *
 * Used by the analytics page to let admins download each card's data as
 * a spreadsheet. No server round-trip — the data is already in memory
 * when the user clicks. Stays in `lib/api/` next to the other shared
 * client utilities even though there's no API call: it deals with
 * shaping data for export which is API-adjacent.
 */

type Cell = string | number | boolean | null | undefined

/** Escape a single cell per RFC 4180: wrap in quotes if it contains
 *  comma / quote / newline; double any embedded quotes. */
function escapeCell(v: Cell): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function toCsv(rows: Cell[][]): string {
  return rows.map(r => r.map(escapeCell).join(',')).join('\r\n')
}

/** Trigger a browser download of `content` as `filename`. */
export function downloadCsv(filename: string, rows: Cell[][]): void {
  if (typeof window === 'undefined') return                     // SSR-safe no-op
  const blob = new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Build a timestamped filename suffix so multiple exports don't clobber. */
export function todayStamp(): string {
  const d = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
}
