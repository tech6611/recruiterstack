'use client'

/**
 * Shared per-pane toolbar controls — Search, Time window, and Download-CSV.
 *
 * These mirror the controls first built inline on the Sequences page so that
 * every two-pane "Active / Past" list (Sequences, Requisitions, Jobs,
 * Candidates) offers the same options on each pane instead of one page-level
 * toolbar. Each control is a small icon/field you drop into a pane's header
 * bar; state (search text, chosen window) lives per pane in the parent page.
 *
 * Filtering is in-memory: `withinRange` tests a row's date against the pane's
 * window, and the Download button builds a CSV from whatever rows the pane is
 * already showing. Time presets come from `lib/sequences/range.ts` so every
 * page agrees on what "Last 30 days" means.
 */

import { useState } from 'react'
import { Search, X, Clock, Check, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  RANGE_OPTIONS,
  DEFAULT_RANGE,
  resolveWindow,
  inWindow,
} from '@/lib/sequences/range'
import { downloadCsv, todayStamp } from '@/lib/api/csv-export'

type Cell = string | number | boolean | null | undefined

// ── Time window value ─────────────────────────────────────────────────────────
// A pane's chosen window: a preset key ('7d'|'30d'|'90d'|'all') OR 'custom' with
// two YYYY-MM-DD dates. Mirrors the Sequences page's RangeValue.
export type RangeValue = { range: string; start: string; end: string }

/** Default window (Last 30 days) — a sensible default for the Active pane. */
export const DEFAULT_RANGE_VALUE: RangeValue = { range: DEFAULT_RANGE, start: '', end: '' }
/** All-time window — a sensible default for the Past/Archived pane. */
export const ALL_RANGE_VALUE: RangeValue = { range: 'all', start: '', end: '' }

/** Human label for the current window, e.g. "Last 30 days" or "2026-01-01 → 2026-02-01". */
export function rangeLabel(v: RangeValue): string {
  if (v.range === 'custom') {
    if (v.start && v.end) return `${v.start} → ${v.end}`
    if (v.start) return `From ${v.start}`
    if (v.end) return `Until ${v.end}`
    return 'Custom range'
  }
  return RANGE_OPTIONS.find(o => o.value === v.range)?.label ?? 'Last 30 days'
}

/** True when an ISO timestamp (e.g. a row's created_at) falls inside the window. */
export function withinRange(iso: string | null | undefined, v: RangeValue): boolean {
  return inWindow(iso ?? null, resolveWindow(v.range, v.start, v.end))
}

// ── Per-pane name search ──────────────────────────────────────────────────────
export function PaneSearchInput({
  query, onQueryChange, placeholder = 'Search by name…',
}: {
  query: string
  onQueryChange: (q: string) => void
  placeholder?: string
}) {
  return (
    <div className="relative hidden sm:block">
      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      <input
        type="text"
        value={query}
        onChange={e => onQueryChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-44 rounded-lg border border-slate-200 bg-white/80 pl-7 pr-6 text-xs text-slate-700 placeholder:text-slate-400 focus:border-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-300"
      />
      {query && (
        <button
          type="button"
          onClick={() => onQueryChange('')}
          title="Clear search"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

// ── Per-pane time control ─────────────────────────────────────────────────────
// An icon button (hover tooltip shows the current window) that opens a dropdown
// of presets plus a "Custom range…" option with two date pickers.
export function TimeRangeControl({
  value, onChange, badgeClass = 'text-slate-600',
}: {
  value: RangeValue
  onChange: (v: RangeValue) => void
  badgeClass?: string
}) {
  const [open, setOpen] = useState(false)
  const [showCustom, setShowCustom] = useState(value.range === 'custom')
  const [start, setStart] = useState(value.start)
  const [end, setEnd] = useState(value.end)

  const pickPreset = (r: string) => { onChange({ range: r, start: '', end: '' }); setShowCustom(false); setOpen(false) }
  const applyCustom = () => { onChange({ range: 'custom', start, end }); setOpen(false) }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title={`Time window: ${rangeLabel(value)}`}
        className={cn('flex items-center gap-1 rounded-lg bg-white/70 px-2 py-1 text-xs font-semibold hover:bg-white transition-colors', badgeClass)}
      >
        <Clock className="h-3.5 w-3.5" />
        {value.range !== DEFAULT_RANGE && <span className="h-1.5 w-1.5 rounded-full bg-[#221b14]" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 w-56 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
            <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Show items from</p>
            {RANGE_OPTIONS.map(o => (
              <button
                key={o.value}
                onClick={() => pickPreset(o.value)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50"
              >
                {o.label}
                {value.range === o.value && <Check className="h-3.5 w-3.5 text-emerald-600" />}
              </button>
            ))}
            <button
              onClick={() => setShowCustom(s => !s)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50"
            >
              Custom range…
              {value.range === 'custom' && <Check className="h-3.5 w-3.5 text-emerald-600" />}
            </button>
            {showCustom && (
              <div className="border-t border-slate-100 px-3 py-2.5 space-y-2">
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  From
                  <input type="date" value={start} max={end || undefined} onChange={e => setStart(e.target.value)}
                    className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:border-slate-400 focus:outline-none" />
                </label>
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  To
                  <input type="date" value={end} min={start || undefined} onChange={e => setEnd(e.target.value)}
                    className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:border-slate-400 focus:outline-none" />
                </label>
                <button
                  onClick={applyCustom}
                  disabled={!start && !end}
                  className="w-full rounded-lg bg-[#221b14] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#33271b] disabled:opacity-40"
                >Apply</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Per-pane Download control ─────────────────────────────────────────────────
// One-click CSV of exactly the rows shown in this pane. `rows` is the full grid
// including the header row; the button disables itself when there's nothing to
// export.
export function PaneDownloadButton({
  filename, rows, disabled, badgeClass = 'text-slate-600',
}: {
  filename: string
  rows: Cell[][]
  disabled?: boolean
  badgeClass?: string
}) {
  const isEmpty = disabled ?? rows.length <= 1
  return (
    <button
      type="button"
      onClick={() => downloadCsv(filename, rows)}
      disabled={isEmpty}
      title="Download this pane as CSV"
      className={cn('flex items-center rounded-lg bg-white/70 px-2 py-1 text-xs font-semibold hover:bg-white transition-colors disabled:opacity-40', badgeClass)}
    >
      <Download className="h-3.5 w-3.5" />
    </button>
  )
}

export { todayStamp }
