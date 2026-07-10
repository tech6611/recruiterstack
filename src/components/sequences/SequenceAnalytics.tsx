'use client'

import { useState, useEffect } from 'react'
import { Loader2, TrendingUp, Download, Clock, ChevronDown, Check } from 'lucide-react'
import { RANGE_OPTIONS } from '@/lib/sequences/range'
import type { SequenceAnalytics as AnalyticsData } from '@/lib/types/database'

interface Props {
  sequenceId: string
}

function pct(n: number, total: number): string {
  if (!total) return '0%'
  return `${Math.round((n / total) * 100)}%`
}

// Wrap a value for CSV: quote it and escape embedded quotes so commas, quotes,
// and newlines inside a subject line can't break the column layout.
function csvCell(value: string | number): string {
  const s = String(value ?? '')
  return `"${s.replace(/"/g, '""')}"`
}

// Build a spreadsheet-friendly CSV from the analytics already loaded in the UI —
// one row per stage plus a totals row. No server round-trip needed.
function buildCsv(data: AnalyticsData): string {
  const header = ['Stage', 'Subject', 'Delay (days)', 'Sent', 'Delivered', 'Opened', 'Open %', 'Clicked', 'Click %', 'Replied', 'Reply %', 'Bounced']
  const rows = data.stages.map(s => [
    s.order_index, s.subject, s.delay_days,
    s.sent, s.delivered,
    s.opened, pct(s.opened, s.sent),
    s.clicked, pct(s.clicked, s.sent),
    s.replied, pct(s.replied, s.sent),
    s.bounced,
  ])
  const totals = ['Total', 'All stages', '', data.overall.total_sent, '', data.overall.total_opened, pct(data.overall.total_opened, data.overall.total_sent), '', '', data.overall.total_replied, pct(data.overall.total_replied, data.total_enrollments), data.overall.total_bounced]
  return [header, ...rows, totals].map(r => r.map(csvCell).join(',')).join('\r\n')
}

function downloadCsv(data: AnalyticsData): void {
  const blob = new Blob([buildCsv(data)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const safeName = (data.sequence_name || 'sequence').replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  const date = new Date().toISOString().slice(0, 10)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeName}-analytics-${date}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function SequenceAnalytics({ sequenceId }: Props) {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  // Analytics default to all-time; the filter narrows to a window.
  const [range, setRange] = useState<string>('all')
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/sequences/${sequenceId}/analytics?range=${range}`)
      .then(r => r.json())
      .then(json => { setData(json.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [sequenceId, range])

  // Only block the whole panel on the first load; keep the filter/header visible
  // while re-fetching a new window so the dropdown doesn't flicker away.
  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 py-12 justify-center text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading analytics...
      </div>
    )
  }

  if (!data) {
    return <p className="text-sm text-slate-400 py-8 text-center">No analytics data available</p>
  }

  const { overall, stages, total_enrollments, enrollment_statuses } = data

  return (
    <div className="space-y-6">
      {/* Header: time filter (left of Download) + export */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">Performance</p>
        <div className="flex items-center gap-2">
          {/* Time filter — scopes the numbers below to a window. */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setRangeMenuOpen(o => !o)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}
              {RANGE_OPTIONS.find(o => o.value === range)?.label ?? 'All time'}
              <ChevronDown className="h-3 w-3" />
            </button>
            {rangeMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setRangeMenuOpen(false)} />
                <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                  <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Show activity in</p>
                  {RANGE_OPTIONS.map(o => (
                    <button
                      key={o.value}
                      onClick={() => { setRange(o.value); setRangeMenuOpen(false) }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-50"
                    >
                      {o.label}
                      {range === o.value && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => downloadCsv(data)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Download className="h-3.5 w-3.5" /> Download CSV
          </button>
        </div>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Enrolled', value: total_enrollments, color: 'text-slate-600' },
          { label: 'Emails Sent', value: overall.total_sent, color: 'text-slate-700' },
          { label: 'Opened', value: `${overall.total_opened} (${pct(overall.total_opened, overall.total_sent)})`, color: 'text-slate-600' },
          { label: 'Replied', value: `${overall.total_replied} (${pct(overall.total_replied, total_enrollments)})`, color: 'text-emerald-600' },
        ].map(card => (
          <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-3.5">
            <p className="text-xs text-slate-400 mb-1">{card.label}</p>
            <p className={`text-lg font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Enrollment status breakdown */}
      {Object.keys(enrollment_statuses).length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold text-slate-500 mb-3">Enrollment Statuses</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(enrollment_statuses).map(([status, count]) => (
              <span key={status} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600">
                {status}: <span className="font-bold">{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Per-stage table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          <TrendingUp className="h-4 w-4 text-slate-500" />
          <p className="text-sm font-semibold text-slate-700">Per-Stage Performance</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-500">
                <th className="px-4 py-2.5 text-left font-semibold">Stage</th>
                <th className="px-4 py-2.5 text-left font-semibold">Subject</th>
                <th className="px-4 py-2.5 text-right font-semibold">Sent</th>
                <th className="px-4 py-2.5 text-right font-semibold">Opened</th>
                <th className="px-4 py-2.5 text-right font-semibold">Clicked</th>
                <th className="px-4 py-2.5 text-right font-semibold">Replied</th>
                <th className="px-4 py-2.5 text-right font-semibold">Bounced</th>
              </tr>
            </thead>
            <tbody>
              {stages.map(s => (
                <tr key={s.stage_id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-emerald-600">
                      {s.order_index}
                    </span>
                    <span className="ml-2 text-xs text-slate-400">Day {s.delay_days}</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-700 truncate max-w-[200px]">{s.subject}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-slate-700">{s.sent}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="font-medium text-slate-600">{s.opened}</span>
                    <span className="text-slate-400 ml-1 text-xs">{pct(s.opened, s.sent)}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="font-medium text-emerald-600">{s.clicked}</span>
                    <span className="text-slate-400 ml-1 text-xs">{pct(s.clicked, s.sent)}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="font-medium text-emerald-600">{s.replied}</span>
                    <span className="text-slate-400 ml-1 text-xs">{pct(s.replied, s.sent)}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="font-medium text-red-500">{s.bounced}</span>
                    <span className="text-slate-400 ml-1 text-xs">{pct(s.bounced, s.sent)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
