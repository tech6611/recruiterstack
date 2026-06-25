'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ShieldCheck, ArrowLeft, Lock, RefreshCw } from 'lucide-react'
import { useCapabilities } from '@/components/providers/CapabilitiesProvider'

interface EeoOptionCount { value: string; count: number }
interface EeoQuestionReport {
  field_id: string
  label: string
  responses: number
  options: EeoOptionCount[]
}
interface EeoReport {
  total_applications: number
  responded: number
  questions: EeoQuestionReport[]
}

function pct(val: number, total: number) {
  if (!total) return 0
  return Math.round((val / total) * 100)
}

export default function EeoReportPage() {
  const { can, loading: capsLoading } = useCapabilities()
  const allowed = can('compliance:view')

  const [data, setData]       = useState<EeoReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const res = await fetch('/api/analytics/eeo')
    if (res.status === 403) { setError('forbidden'); setLoading(false); return }
    if (!res.ok) { setError('Failed to load the report'); setLoading(false); return }
    const json = await res.json()
    setData(json.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (capsLoading) return
    if (!allowed) { setLoading(false); return }
    load()
  }, [capsLoading, allowed, load])

  // ── Access denied ──────────────────────────────────────────────────────────
  if ((!capsLoading && !allowed) || error === 'forbidden') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-slate-400 px-8 text-center">
        <Lock className="h-8 w-8" />
        <p className="text-sm max-w-sm">
          You don&apos;t have access to compliance reporting. Ask a workspace admin for the
          <span className="font-medium text-slate-500"> Compliance · View</span> permission.
        </p>
        <Link href="/analytics" className="text-sm font-medium text-emerald-600 hover:underline">
          Back to Analytics
        </Link>
      </div>
    )
  }

  if (loading || capsLoading) {
    return (
      <div className="flex flex-col gap-6 px-8 py-8 max-w-3xl">
        <div className="h-8 w-56 rounded-xl bg-slate-200 animate-pulse" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-48 rounded-2xl bg-slate-200 animate-pulse" />
        ))}
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-slate-400">
        <ShieldCheck className="h-8 w-8" />
        <p className="text-sm">{error || 'No data'}</p>
        <button onClick={load} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors">
          Retry
        </button>
      </div>
    )
  }

  const responseRate = pct(data.responded, data.total_applications)

  return (
    <div className="flex flex-col gap-6 px-8 py-8 max-w-3xl">
      {/* Header */}
      <div>
        <Link href="/analytics" className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-600 mb-3">
          <ArrowLeft className="h-3.5 w-3.5" /> Analytics
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-200">
              <ShieldCheck className="h-4.5 w-4.5 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">EEO / Voluntary disclosures</h1>
              <p className="text-sm text-slate-400 mt-0.5">Anonymous, aggregate counts — never linked to any candidate</p>
            </div>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </div>

      {/* Privacy note */}
      <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-xs text-amber-900 leading-relaxed">
        These voluntary disclosures are collected for compliance reporting only. They are hidden from
        the hiring team and must never influence any hiring decision. Figures below are totals across
        all applications — no individual responses are shown.
      </div>

      {/* Response rate */}
      <div className="rounded-2xl bg-white border border-slate-200 px-5 py-4 flex items-center gap-8">
        <div>
          <p className="text-2xl font-bold text-slate-900 leading-tight">{data.total_applications}</p>
          <p className="text-xs font-medium text-slate-500">Total applications</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-slate-900 leading-tight">{data.responded}</p>
          <p className="text-xs font-medium text-slate-500">Provided disclosures</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-slate-900 leading-tight">{responseRate}%</p>
          <p className="text-xs font-medium text-slate-500">Response rate</p>
        </div>
      </div>

      {/* Per-question breakdowns */}
      {data.questions.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center text-sm text-slate-400">
          No voluntary disclosures collected yet. Add EEO questions to a job&apos;s application form,
          and responses will aggregate here.
        </div>
      ) : (
        data.questions.map(q => {
          const maxCount = Math.max(...q.options.map(o => o.count), 1)
          return (
            <div key={q.field_id} className="rounded-2xl bg-white border border-slate-200 p-6">
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="text-sm font-bold text-slate-900">{q.label}</h2>
                <span className="text-xs text-slate-400">{q.responses} responded</span>
              </div>
              <div className="space-y-2.5">
                {q.options.map(opt => (
                  <div key={opt.value} className="flex items-center gap-3">
                    <span className="w-40 shrink-0 text-right text-xs font-medium text-slate-600 truncate" title={opt.value}>
                      {opt.value}
                    </span>
                    <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${pct(opt.count, maxCount)}%`, minWidth: opt.count > 0 ? '2rem' : '0' }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-xs font-bold text-slate-600">
                      {opt.count} <span className="font-normal text-slate-400">({pct(opt.count, q.responses)}%)</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
