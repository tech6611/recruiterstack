'use client'

import { useState, useEffect } from 'react'
import { Loader2, TrendingUp } from 'lucide-react'
import type { SequenceAnalytics as AnalyticsData } from '@/lib/types/database'

interface Props {
  sequenceId: string
}

function pct(n: number, total: number): string {
  if (!total) return '0%'
  return `${Math.round((n / total) * 100)}%`
}

export default function SequenceAnalytics({ sequenceId }: Props) {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/sequences/${sequenceId}/analytics`)
      .then(r => r.json())
      .then(json => { setData(json.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [sequenceId])

  if (loading) {
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
      {/* Overview cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Enrolled', value: total_enrollments, color: 'text-blue-600' },
          { label: 'Emails Sent', value: overall.total_sent, color: 'text-slate-700' },
          { label: 'Opened', value: `${overall.total_opened} (${pct(overall.total_opened, overall.total_sent)})`, color: 'text-violet-600' },
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
          <TrendingUp className="h-4 w-4 text-blue-500" />
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
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-600">
                      {s.order_index}
                    </span>
                    <span className="ml-2 text-xs text-slate-400">Day {s.delay_days}</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-700 truncate max-w-[200px]">{s.subject}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-slate-700">{s.sent}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="font-medium text-violet-600">{s.opened}</span>
                    <span className="text-slate-400 ml-1 text-xs">{pct(s.opened, s.sent)}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="font-medium text-blue-600">{s.clicked}</span>
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
